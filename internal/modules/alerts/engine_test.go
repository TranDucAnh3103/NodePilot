package alerts

import (
	"testing"
	"time"

	sysdomain "hscc/internal/modules/system/domain"
)

func cpuSnap(v float64) *sysdomain.HostSnapshot {
	return &sysdomain.HostSnapshot{CPU: sysdomain.CPUMetrics{UsagePercent: &v}}
}

func TestEngine_SustainHysteresisCooldown(t *testing.T) {
	e := NewEngine(DefaultConfig())
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	e.SetClock(func() time.Time { return now })
	ch, unsub := e.Subscribe()
	defer unsub()

	// 1. Breach shorter than 5 minutes must not fire.
	for i := 0; i < 4; i++ {
		e.Observe(cpuSnap(95))
		now = now.Add(time.Minute)
	}
	if active, _ := e.Snapshot(); len(active) != 0 {
		t.Fatalf("expected no alert before sustain window, got %d", len(active))
	}

	// 2. Reaching 5 minutes fires exactly once.
	now = now.Add(time.Minute)
	e.Observe(cpuSnap(95))
	select {
	case a := <-ch:
		if a.Kind != "cpu" || !a.Active {
			t.Fatalf("unexpected alert %+v", a)
		}
	default:
		t.Fatal("expected cpu alert to fire")
	}
	e.Observe(cpuSnap(96))
	if active, _ := e.Snapshot(); len(active) != 1 {
		t.Fatalf("expected a single active alert, got %d", len(active))
	}

	// 3. Hysteresis: 80% is below trigger but above clear -> stays firing.
	e.Observe(cpuSnap(80))
	if active, _ := e.Snapshot(); len(active) != 1 {
		t.Fatalf("alert should remain active inside hysteresis band")
	}

	// 4. Drop below clear threshold resolves it.
	e.Observe(cpuSnap(50))
	if active, _ := e.Snapshot(); len(active) != 0 {
		t.Fatalf("alert should be resolved below clear threshold")
	}

	// 5. Re-breach within cooldown (15 min) must not notify again.
	for i := 0; i <= 5; i++ {
		e.Observe(cpuSnap(95))
		now = now.Add(time.Minute)
	}
	select {
	case a := <-ch:
		t.Fatalf("cooldown violated, got %+v", a)
	default:
	}
}

func TestEngine_DiskImmediateAndContainers(t *testing.T) {
	e := NewEngine(DefaultConfig())
	e.Observe(&sysdomain.HostSnapshot{Disks: []sysdomain.DiskPartition{{Mountpoint: "/", UsedPercent: 91}}})
	if active, _ := e.Snapshot(); len(active) != 1 || active[0].Kind != "disk" {
		t.Fatalf("expected immediate disk alert, got %+v", active)
	}

	e.ObserveContainers([]ContainerHealth{{Name: "web", HealthStatus: "unhealthy"}})
	if active, _ := e.Snapshot(); len(active) != 2 {
		t.Fatalf("expected container alert, got %d active", len(active))
	}
	// Container removed -> alert resolved.
	e.ObserveContainers(nil)
	if active, _ := e.Snapshot(); len(active) != 1 {
		t.Fatalf("expected container alert resolved, got %d active", len(active))
	}
}
