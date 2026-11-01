package telemetry

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"hscc/internal/modules/system/domain"
)

var (
	ErrNoSnapshotYet = errors.New("system metrics snapshot warming up")
)

// Collector abstracts the host metrics sampler (gopsutil based in production).
type Collector interface {
	Collect(ctx context.Context) (*domain.HostSnapshot, error)
}

// SnapshotSink receives every collected snapshot (downsampler, alert engine).
// Sinks run on the collector goroutine and must be cheap / non-blocking.
type SnapshotSink func(*domain.HostSnapshot)

type Subscriber chan *domain.HostSnapshot

// Power modes reported by Status().
const (
	ModeActive    = "active"    // live viewers present: full-rate sampling
	ModeIdle      = "idle"      // nobody watching: low-rate background sampling
	ModeHibernate = "hibernate" // nobody watching and idle sampling disabled
)

type Status struct {
	Mode            string    `json:"mode"`
	Subscribers     int       `json:"subscribers"`
	ActiveInterval  float64   `json:"activeIntervalSeconds"`
	IdleInterval    float64   `json:"idleIntervalSeconds"`
	LastCollectedAt time.Time `json:"lastCollectedAt"`
	CollectCount    uint64    `json:"collectCount"`
}

// TelemetryService owns the single shared collector goroutine. The collector is
// demand-driven: it samples at the active interval only while a UI client is
// watching (WebSocket subscriber or recent REST request) and drops to the idle
// interval (or sleeps completely) otherwise.
type TelemetryService struct {
	collector   Collector
	ringBuffer  *RingBuffer
	subscribers map[Subscriber]struct{}
	subMu       sync.RWMutex
	maxSubs     int

	sinksMu sync.RWMutex
	sinks   []SnapshotSink

	activeInterval time.Duration
	idleInterval   time.Duration
	grace          time.Duration

	wakeCh       chan struct{}
	lastDemand   atomic.Int64 // unix nanos
	collectCount atomic.Uint64
	collectMu    sync.Mutex
	runCtx       atomic.Pointer[context.Context]
}

func NewTelemetryService(collector Collector, ringCapacity, maxSubs int) *TelemetryService {
	if maxSubs <= 0 {
		maxSubs = 3
	}
	return &TelemetryService{
		collector:      collector,
		ringBuffer:     NewRingBuffer(ringCapacity),
		subscribers:    make(map[Subscriber]struct{}),
		maxSubs:        maxSubs,
		activeInterval: 3 * time.Second,
		idleInterval:   60 * time.Second,
		grace:          30 * time.Second,
		wakeCh:         make(chan struct{}, 1),
	}
}

// SetPowerPolicy configures idle sampling (0 = full hibernation) and the grace
// period that keeps active mode after the last viewer leaves.
func (s *TelemetryService) SetPowerPolicy(idleInterval, grace time.Duration) {
	if idleInterval < 0 {
		idleInterval = 0
	}
	if grace < 0 {
		grace = 0
	}
	s.idleInterval = idleInterval
	s.grace = grace
}

// AddSink registers a consumer that is invoked for every collected snapshot.
func (s *TelemetryService) AddSink(sink SnapshotSink) {
	s.sinksMu.Lock()
	defer s.sinksMu.Unlock()
	s.sinks = append(s.sinks, sink)
}

// Start runs the demand-driven collector goroutine until ctx is cancelled.
func (s *TelemetryService) Start(ctx context.Context, interval time.Duration) {
	if interval > 0 {
		s.activeInterval = interval
	}
	s.runCtx.Store(&ctx)

	go func() {
		slog.Info("starting demand-driven telemetry collector",
			slog.Duration("active_interval", s.activeInterval),
			slog.Duration("idle_interval", s.idleInterval),
			slog.Duration("grace", s.grace))

		// Prime one sample so the first page load is instant.
		s.collectOnce(ctx)

		var timer *time.Timer
		stopTimer := func() {
			if timer != nil {
				timer.Stop()
				timer = nil
			}
		}
		defer stopTimer()

		lastMode := ""
		for {
			interval := s.currentInterval()
			mode := s.modeFor(interval)
			if mode != lastMode {
				slog.Info("telemetry collector power mode changed", slog.String("mode", mode))
				lastMode = mode
			}

			var timerC <-chan time.Time
			if interval > 0 {
				timer = time.NewTimer(interval)
				timerC = timer.C
			}

			select {
			case <-ctx.Done():
				slog.Info("system telemetry collector stopped")
				return
			case <-s.wakeCh:
				stopTimer()
				// Woken by a new viewer: refresh immediately if data is old.
				if s.isStale(s.activeInterval) {
					s.collectOnce(ctx)
				}
			case <-timerC:
				timer = nil
				s.collectOnce(ctx)
			}
		}
	}()
}

func (s *TelemetryService) currentInterval() time.Duration {
	if s.hasViewers() {
		return s.activeInterval
	}
	return s.idleInterval
}

func (s *TelemetryService) modeFor(interval time.Duration) string {
	switch {
	case s.hasViewers():
		return ModeActive
	case interval == 0:
		return ModeHibernate
	default:
		return ModeIdle
	}
}

func (s *TelemetryService) hasViewers() bool {
	s.subMu.RLock()
	n := len(s.subscribers)
	s.subMu.RUnlock()
	if n > 0 {
		return true
	}
	last := s.lastDemand.Load()
	return last > 0 && time.Since(time.Unix(0, last)) < s.grace
}

func (s *TelemetryService) isStale(maxAge time.Duration) bool {
	latest := s.ringBuffer.Latest()
	return latest == nil || time.Since(latest.CapturedAt) > maxAge
}

// touch records UI demand and wakes the collector loop.
func (s *TelemetryService) touch() {
	s.lastDemand.Store(time.Now().UnixNano())
	select {
	case s.wakeCh <- struct{}{}:
	default:
	}
}

func (s *TelemetryService) collectOnce(ctx context.Context) {
	s.collectMu.Lock()
	defer s.collectMu.Unlock()

	snap, err := s.collector.Collect(ctx)
	if err != nil || snap == nil {
		if err != nil && ctx.Err() == nil {
			slog.Warn("collector failed to sample host metrics", slog.String("error", err.Error()))
		}
		return
	}
	s.collectCount.Add(1)
	s.ringBuffer.Push(snap)
	s.broadcast(snap)

	s.sinksMu.RLock()
	sinks := s.sinks
	s.sinksMu.RUnlock()
	for _, sink := range sinks {
		sink(snap)
	}
}

// ensureFresh synchronously samples when the cached snapshot is too old
// (e.g. the collector was hibernating when a REST request arrived).
func (s *TelemetryService) ensureFresh() {
	s.touch()
	if !s.isStale(2 * s.activeInterval) {
		return
	}
	ctx := context.Background()
	if p := s.runCtx.Load(); p != nil {
		ctx = *p
	}
	if ctx.Err() != nil {
		return
	}
	cctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	s.collectOnce(cctx)
}

// Subscribe registers a new subscriber channel (capacity 2) and switches the
// collector into active mode.
func (s *TelemetryService) Subscribe() (Subscriber, error) {
	s.subMu.Lock()
	if len(s.subscribers) >= s.maxSubs {
		s.subMu.Unlock()
		return nil, errors.New("maximum concurrent websocket clients reached")
	}
	ch := make(Subscriber, 2)
	s.subscribers[ch] = struct{}{}
	// Send current snapshot immediately if available (buffered, never blocks;
	// done under the lock so CloseAll cannot close the channel concurrently).
	if latest := s.ringBuffer.Latest(); latest != nil {
		ch <- latest
	}
	s.subMu.Unlock()
	s.touch()
	return ch, nil
}

// Unsubscribe unregisters and closes a subscriber channel.
func (s *TelemetryService) Unsubscribe(ch Subscriber) {
	s.subMu.Lock()
	defer s.subMu.Unlock()

	if _, ok := s.subscribers[ch]; ok {
		delete(s.subscribers, ch)
		close(ch)
	}
	// Grace period starts now.
	s.lastDemand.Store(time.Now().UnixNano())
}

// CloseAll disconnects every subscriber (used during graceful shutdown so
// WebSocket handlers return immediately instead of waiting for timeouts).
func (s *TelemetryService) CloseAll() {
	s.subMu.Lock()
	defer s.subMu.Unlock()
	for ch := range s.subscribers {
		delete(s.subscribers, ch)
		close(ch)
	}
}

func (s *TelemetryService) broadcast(snap *domain.HostSnapshot) {
	s.subMu.RLock()
	defer s.subMu.RUnlock()

	for ch := range s.subscribers {
		select {
		case ch <- snap:
		default:
			// Non-blocking: drop oldest, insert newest to prevent slow consumer lag (BUG-1.3)
			select {
			case <-ch:
			default:
			}
			select {
			case ch <- snap:
			default:
			}
		}
	}
}

// Status reports the collector power state (exposed for observability).
func (s *TelemetryService) Status() Status {
	s.subMu.RLock()
	n := len(s.subscribers)
	s.subMu.RUnlock()
	st := Status{
		Mode:           s.modeFor(s.currentInterval()),
		Subscribers:    n,
		ActiveInterval: s.activeInterval.Seconds(),
		IdleInterval:   s.idleInterval.Seconds(),
		CollectCount:   s.collectCount.Load(),
	}
	if latest := s.ringBuffer.Latest(); latest != nil {
		st.LastCollectedAt = latest.CapturedAt
	}
	return st
}

// GetSummary returns the latest snapshot, sampling on demand if hibernating.
func (s *TelemetryService) GetSummary() (*domain.HostSnapshot, error) {
	s.ensureFresh()
	latest := s.ringBuffer.Latest()
	if latest == nil {
		return nil, ErrNoSnapshotYet
	}
	return latest, nil
}

// GetDisks returns current disk partitions.
func (s *TelemetryService) GetDisks() ([]domain.DiskPartition, error) {
	snap, err := s.GetSummary()
	if err != nil {
		return nil, err
	}
	return snap.Disks, nil
}

// GetNetworks returns current network interfaces.
func (s *TelemetryService) GetNetworks() ([]domain.NetworkInterface, error) {
	snap, err := s.GetSummary()
	if err != nil {
		return nil, err
	}
	return snap.Networks, nil
}

// GetHistory returns in-memory ring buffer snapshots.
func (s *TelemetryService) GetHistory() []*domain.HostSnapshot {
	s.touch()
	return s.ringBuffer.GetAll()
}
