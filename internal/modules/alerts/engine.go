package alerts

import (
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	sysdomain "hscc/internal/modules/system/domain"
)

type Severity string

const (
	SeverityWarning  Severity = "warning"
	SeverityCritical Severity = "critical"
)

// Alert is an informational notification. Alerts never trigger automatic
// remediation (no kill / restart) - FR-SYS-09 / AC 3.1.4.
type Alert struct {
	ID          string     `json:"id"`
	Key         string     `json:"key"`
	Kind        string     `json:"kind"` // cpu | memory | disk | container
	Severity    Severity   `json:"severity"`
	Title       string     `json:"title"`
	Message     string     `json:"message"`
	Value       float64    `json:"value"`
	Threshold   float64    `json:"threshold"`
	TriggeredAt time.Time  `json:"triggeredAt"`
	ResolvedAt  *time.Time `json:"resolvedAt,omitempty"`
	Active      bool       `json:"active"`
}

// Rule thresholds with hysteresis: an alert fires once the value stays beyond
// Trigger for Sustain, and only clears after it returns past Clear.
type Rule struct {
	Trigger float64
	Clear   float64
	Sustain time.Duration
}

type Config struct {
	CPU      Rule // usage percent above
	MemAvail Rule // available percent below
	Disk     Rule // used percent above
	Cooldown time.Duration
}

func DefaultConfig() Config {
	return Config{
		CPU:      Rule{Trigger: 85, Clear: 75, Sustain: 5 * time.Minute},
		MemAvail: Rule{Trigger: 15, Clear: 20, Sustain: 5 * time.Minute},
		Disk:     Rule{Trigger: 85, Clear: 80, Sustain: 0},
		Cooldown: 15 * time.Minute,
	}
}

type ruleState struct {
	breachSince time.Time
	firing      bool
	lastFired   time.Time
	activeID    string
}

const recentCapacity = 50

// Engine evaluates snapshots and container health. Event driven: it only runs
// when the telemetry collector produces a snapshot.
type Engine struct {
	cfg Config
	now func() time.Time

	mu     sync.Mutex
	states map[string]*ruleState
	recent []Alert // newest last, bounded

	subMu sync.RWMutex
	subs  map[chan Alert]struct{}
}

func NewEngine(cfg Config) *Engine {
	return &Engine{
		cfg:    cfg,
		now:    time.Now,
		states: make(map[string]*ruleState),
		subs:   make(map[chan Alert]struct{}),
	}
}

// SetClock overrides the time source (tests).
func (e *Engine) SetClock(now func() time.Time) { e.now = now }

// Observe is a telemetry.SnapshotSink.
func (e *Engine) Observe(snap *sysdomain.HostSnapshot) {
	if snap == nil {
		return
	}
	if snap.CPU.UsagePercent != nil {
		v := *snap.CPU.UsagePercent
		e.evaluate("cpu", "cpu", e.cfg.CPU, v > e.cfg.CPU.Trigger, v < e.cfg.CPU.Clear, v,
			"CPU tải cao kéo dài",
			fmt.Sprintf("CPU sử dụng %.1f%% vượt ngưỡng %.0f%% liên tục %s", v, e.cfg.CPU.Trigger, e.cfg.CPU.Sustain))
	}
	if snap.Memory.TotalBytes > 0 {
		avail := float64(snap.Memory.AvailableBytes) / float64(snap.Memory.TotalBytes) * 100
		e.evaluate("memory", "memory", e.cfg.MemAvail, avail < e.cfg.MemAvail.Trigger, avail > e.cfg.MemAvail.Clear, avail,
			"RAM khả dụng thấp",
			fmt.Sprintf("RAM khả dụng chỉ còn %.1f%% (ngưỡng %.0f%%) liên tục %s", avail, e.cfg.MemAvail.Trigger, e.cfg.MemAvail.Sustain))
	}
	for _, d := range snap.Disks {
		e.evaluate("disk:"+d.Mountpoint, "disk", e.cfg.Disk, d.UsedPercent > e.cfg.Disk.Trigger, d.UsedPercent < e.cfg.Disk.Clear, d.UsedPercent,
			"Ổ đĩa sắp đầy",
			fmt.Sprintf("Phân vùng %s đã dùng %.1f%% (ngưỡng %.0f%%)", d.Mountpoint, d.UsedPercent, e.cfg.Disk.Trigger))
	}
}

// ContainerHealth is the minimal view the engine needs from the Docker module.
type ContainerHealth struct {
	Name         string
	HealthStatus string
}

// ObserveContainers raises an alert for each unhealthy container.
func (e *Engine) ObserveContainers(list []ContainerHealth) {
	seen := make(map[string]bool, len(list))
	rule := Rule{Sustain: 0}
	for _, c := range list {
		key := "container:" + c.Name
		seen[key] = true
		unhealthy := c.HealthStatus == "unhealthy"
		e.evaluate(key, "container", rule, unhealthy, !unhealthy, 0,
			"Container không khỏe",
			fmt.Sprintf("Container %s báo trạng thái healthcheck: unhealthy", c.Name))
	}
	// Containers that disappeared resolve their alerts.
	e.mu.Lock()
	var gone []string
	for key, st := range e.states {
		if len(key) > 10 && key[:10] == "container:" && !seen[key] && st.firing {
			gone = append(gone, key)
		}
	}
	e.mu.Unlock()
	for _, key := range gone {
		e.evaluate(key, "container", rule, false, true, 0, "", "")
	}
}

func (e *Engine) evaluate(key, kind string, rule Rule, breaching, clearing bool, value float64, title, message string) {
	now := e.now()
	var fired *Alert

	e.mu.Lock()
	st := e.states[key]
	if st == nil {
		st = &ruleState{}
		e.states[key] = st
	}
	switch {
	case breaching:
		if st.breachSince.IsZero() {
			st.breachSince = now
		}
		if !st.firing && now.Sub(st.breachSince) >= rule.Sustain {
			st.firing = true
			if st.lastFired.IsZero() || now.Sub(st.lastFired) >= e.cfg.Cooldown {
				st.lastFired = now
				a := Alert{
					ID:          uuid.NewString(),
					Key:         key,
					Kind:        kind,
					Severity:    severityFor(kind, value, rule),
					Title:       title,
					Message:     message,
					Value:       round1(value),
					Threshold:   rule.Trigger,
					TriggeredAt: now.UTC(),
					Active:      true,
				}
				st.activeID = a.ID
				e.pushRecent(a)
				fired = &a
			}
		}
	default:
		st.breachSince = time.Time{}
		if st.firing && clearing {
			st.firing = false
			if st.activeID != "" {
				resolved := now.UTC()
				for i := range e.recent {
					if e.recent[i].ID == st.activeID {
						e.recent[i].Active = false
						e.recent[i].ResolvedAt = &resolved
					}
				}
				st.activeID = ""
			}
		}
	}
	e.mu.Unlock()

	if fired != nil {
		e.broadcast(*fired)
	}
}

func (e *Engine) pushRecent(a Alert) {
	e.recent = append(e.recent, a)
	if len(e.recent) > recentCapacity {
		e.recent = e.recent[len(e.recent)-recentCapacity:]
	}
}

// Snapshot returns active and recent alerts (newest first).
func (e *Engine) Snapshot() (active []Alert, recent []Alert) {
	e.mu.Lock()
	defer e.mu.Unlock()
	active = []Alert{}
	recent = make([]Alert, 0, len(e.recent))
	for i := len(e.recent) - 1; i >= 0; i-- {
		a := e.recent[i]
		recent = append(recent, a)
		if a.Active {
			active = append(active, a)
		}
	}
	return active, recent
}

// Subscribe returns a channel receiving newly fired alerts and an unsubscribe func.
func (e *Engine) Subscribe() (<-chan Alert, func()) {
	ch := make(chan Alert, 8)
	e.subMu.Lock()
	e.subs[ch] = struct{}{}
	e.subMu.Unlock()
	var once sync.Once
	return ch, func() {
		once.Do(func() {
			e.subMu.Lock()
			delete(e.subs, ch)
			e.subMu.Unlock()
			close(ch)
		})
	}
}

func (e *Engine) broadcast(a Alert) {
	e.subMu.RLock()
	defer e.subMu.RUnlock()
	for ch := range e.subs {
		select {
		case ch <- a:
		default: // never block the collector
		}
	}
}

func severityFor(kind string, value float64, rule Rule) Severity {
	switch kind {
	case "container":
		return SeverityCritical
	case "memory":
		if value < rule.Trigger/2 {
			return SeverityCritical
		}
	case "disk", "cpu":
		if value >= 95 {
			return SeverityCritical
		}
	}
	return SeverityWarning
}

func round1(v float64) float64 {
	return float64(int64(v*10+0.5)) / 10
}
