package telemetry

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"math"
	"sort"
	"sync"
	"time"

	"hscc/internal/modules/system/domain"
)

// Granularities and retention windows (FR-SYS-08, NFR-PERF-05).
const (
	FineGranularity   = 60  // seconds
	CoarseGranularity = 300 // seconds
	FineRetention     = 24 * time.Hour
	CoarseRetention   = 7 * 24 * time.Hour
	maintenanceEvery  = time.Hour
	tsLayout          = "2006-01-02T15:04:05Z"
)

// MetricPoint is one aggregated history sample.
type MetricPoint struct {
	TS    time.Time `json:"ts"`
	Value float64   `json:"value"`
}

// MetricSeries is a named time series returned by the history API.
type MetricSeries struct {
	Metric      string        `json:"metric"`
	Scope       string        `json:"scope"`
	Unit        string        `json:"unit"`
	StepSeconds int           `json:"stepSeconds"`
	Points      []MetricPoint `json:"points"`
}

type accKey struct{ metric, scope string }

type accumulator struct {
	sum   float64
	count int
	unit  string
}

// HistoryStore downsamples live snapshots into 60s buckets in SQLite and keeps
// them compacted (5 min after 24h) and bounded (7 days). It is event driven:
// work only happens when a snapshot arrives, so it naturally sleeps while the
// collector hibernates - no background ticker of its own.
type HistoryStore struct {
	db  *sql.DB
	now func() time.Time

	mu              sync.Mutex
	bucket          time.Time
	acc             map[accKey]*accumulator
	lastMaintenance time.Time
}

func NewHistoryStore(db *sql.DB) *HistoryStore {
	return &HistoryStore{
		db:  db,
		now: func() time.Time { return time.Now().UTC() },
		acc: make(map[accKey]*accumulator),
	}
}

// Observe is a telemetry.SnapshotSink.
func (h *HistoryStore) Observe(snap *domain.HostSnapshot) {
	if snap == nil {
		return
	}
	ts := snap.CapturedAt.UTC()
	bucket := ts.Truncate(FineGranularity * time.Second)

	h.mu.Lock()
	var flushBucket time.Time
	var flushAcc map[accKey]*accumulator
	if !h.bucket.IsZero() && !bucket.Equal(h.bucket) && len(h.acc) > 0 {
		flushBucket, flushAcc = h.bucket, h.acc
		h.acc = make(map[accKey]*accumulator)
	}
	h.bucket = bucket
	for _, v := range valuesFromSnapshot(snap) {
		k := accKey{v.metric, v.scope}
		a := h.acc[k]
		if a == nil {
			a = &accumulator{unit: v.unit}
			h.acc[k] = a
		}
		a.sum += v.value
		a.count++
	}
	runMaintenance := time.Since(h.lastMaintenance) >= maintenanceEvery
	if runMaintenance {
		h.lastMaintenance = time.Now()
	}
	h.mu.Unlock()

	if flushAcc != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := h.writeBucket(ctx, flushBucket, flushAcc); err != nil {
			slog.Warn("failed to persist downsampled metrics", slog.String("error", err.Error()))
		}
		cancel()
	}
	if runMaintenance {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			if err := h.Maintain(ctx); err != nil {
				slog.Warn("metric history maintenance failed", slog.String("error", err.Error()))
			}
		}()
	}
}

// Flush persists the in-progress bucket (called on graceful shutdown).
func (h *HistoryStore) Flush(ctx context.Context) error {
	h.mu.Lock()
	bucket, acc := h.bucket, h.acc
	h.acc = make(map[accKey]*accumulator)
	h.mu.Unlock()
	if bucket.IsZero() || len(acc) == 0 {
		return nil
	}
	return h.writeBucket(ctx, bucket, acc)
}

func (h *HistoryStore) writeBucket(ctx context.Context, bucket time.Time, acc map[accKey]*accumulator) error {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	stmt, err := tx.PrepareContext(ctx, `INSERT OR REPLACE INTO metric_samples (ts, metric, scope, value, unit, granularity_seconds) VALUES (?, ?, ?, ?, ?, ?)`)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	defer stmt.Close()
	ts := bucket.UTC().Format(tsLayout)
	for k, a := range acc {
		if a.count == 0 {
			continue
		}
		if _, err := stmt.ExecContext(ctx, ts, k.metric, k.scope, round2(a.sum/float64(a.count)), a.unit, FineGranularity); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// Maintain compacts 60s samples older than 24h into 5 min samples and drops
// anything older than 7 days.
func (h *HistoryStore) Maintain(ctx context.Context) error {
	now := h.now()
	fineCutoff := now.Add(-FineRetention).Format(tsLayout)
	coarseCutoff := now.Add(-CoarseRetention).Format(tsLayout)

	rows, err := h.db.QueryContext(ctx, `SELECT ts, metric, scope, value, unit FROM metric_samples WHERE granularity_seconds = ? AND ts < ?`, FineGranularity, fineCutoff)
	if err != nil {
		return fmt.Errorf("select fine samples: %w", err)
	}
	type coarseKey struct {
		ts            string
		metric, scope string
	}
	agg := make(map[coarseKey]*accumulator)
	for rows.Next() {
		var tsStr, metric, scope, unit string
		var value float64
		if err := rows.Scan(&tsStr, &metric, &scope, &value, &unit); err != nil {
			rows.Close()
			return err
		}
		t, err := time.Parse(tsLayout, tsStr)
		if err != nil {
			continue
		}
		k := coarseKey{t.Truncate(CoarseGranularity * time.Second).Format(tsLayout), metric, scope}
		a := agg[k]
		if a == nil {
			a = &accumulator{unit: unit}
			agg[k] = a
		}
		a.sum += value
		a.count++
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	for k, a := range agg {
		if _, err := tx.ExecContext(ctx, `INSERT OR REPLACE INTO metric_samples (ts, metric, scope, value, unit, granularity_seconds) VALUES (?, ?, ?, ?, ?, ?)`,
			k.ts, k.metric, k.scope, round2(a.sum/float64(a.count)), a.unit, CoarseGranularity); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM metric_samples WHERE granularity_seconds = ? AND ts < ?`, FineGranularity, fineCutoff); err != nil {
		_ = tx.Rollback()
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM metric_samples WHERE ts < ?`, coarseCutoff); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

// Query returns a series bucketed to roughly maxPoints points.
func (h *HistoryStore) Query(ctx context.Context, metric, scope string, rng time.Duration, maxPoints int) (*MetricSeries, error) {
	if maxPoints <= 0 {
		maxPoints = 300
	}
	now := h.now()
	from := now.Add(-rng)
	step := int(math.Ceil(rng.Seconds()/float64(maxPoints)/60.0)) * 60
	if step < FineGranularity {
		step = FineGranularity
	}

	rows, err := h.db.QueryContext(ctx, `SELECT ts, value, unit FROM metric_samples WHERE metric = ? AND scope = ? AND ts >= ? ORDER BY ts ASC`,
		metric, scope, from.Format(tsLayout))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	series := &MetricSeries{Metric: metric, Scope: scope, StepSeconds: step, Points: []MetricPoint{}}
	buckets := make(map[int64]*accumulator)
	for rows.Next() {
		var tsStr, unit string
		var value float64
		if err := rows.Scan(&tsStr, &value, &unit); err != nil {
			return nil, err
		}
		t, err := time.Parse(tsLayout, tsStr)
		if err != nil {
			continue
		}
		series.Unit = unit
		b := t.Truncate(time.Duration(step) * time.Second).Unix()
		a := buckets[b]
		if a == nil {
			a = &accumulator{}
			buckets[b] = a
		}
		a.sum += value
		a.count++
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	keys := make([]int64, 0, len(buckets))
	for k := range buckets {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i] < keys[j] })
	for _, k := range keys {
		a := buckets[k]
		series.Points = append(series.Points, MetricPoint{TS: time.Unix(k, 0).UTC(), Value: round2(a.sum / float64(a.count))})
	}
	return series, nil
}

// Scopes lists the distinct scopes recorded for a metric (e.g. disk mounts).
func (h *HistoryStore) Scopes(ctx context.Context, metric string) ([]string, error) {
	rows, err := h.db.QueryContext(ctx, `SELECT DISTINCT scope FROM metric_samples WHERE metric = ? ORDER BY scope`, metric)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

type metricValue struct {
	metric, scope, unit string
	value               float64
}

func valuesFromSnapshot(s *domain.HostSnapshot) []metricValue {
	out := make([]metricValue, 0, 8+len(s.Disks))
	if s.CPU.UsagePercent != nil {
		out = append(out, metricValue{"cpu.usage", "host", "percent", *s.CPU.UsagePercent})
	}
	if s.Memory.TotalBytes > 0 {
		out = append(out, metricValue{"mem.used", "host", "percent", s.Memory.UsedPercent})
		avail := float64(s.Memory.AvailableBytes) / float64(s.Memory.TotalBytes) * 100
		out = append(out, metricValue{"mem.available", "host", "percent", avail})
	}
	if s.Memory.SwapTotalBytes > 0 {
		out = append(out, metricValue{"swap.used", "host", "percent", s.Memory.SwapUsedPercent})
	}
	for _, d := range s.Disks {
		out = append(out, metricValue{"disk.used", d.Mountpoint, "percent", d.UsedPercent})
	}
	var rx, tx float64
	for _, n := range s.Networks {
		rx += n.RxBytesPerSec
		tx += n.TxBytesPerSec
	}
	out = append(out, metricValue{"net.rx", "all", "bytes_per_sec", rx}, metricValue{"net.tx", "all", "bytes_per_sec", tx})
	if s.Temperature.Supported && s.Temperature.Celsius != nil {
		out = append(out, metricValue{"temp", "host", "celsius", *s.Temperature.Celsius})
	}
	return out
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }
