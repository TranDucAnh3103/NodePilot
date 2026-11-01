package telemetry

import (
	"fmt"
	"testing"
	"time"

	"hscc/internal/modules/system/domain"
)

func TestRingBuffer_PushAndCapacity(t *testing.T) {
	rb := NewRingBuffer(3)

	if rb.Latest() != nil {
		t.Errorf("expected Latest() to be nil on empty buffer")
	}

	snap1 := &domain.HostSnapshot{CapturedAt: time.Now().Add(-2 * time.Minute), Host: domain.HostInfo{Hostname: "host-1"}}
	snap2 := &domain.HostSnapshot{CapturedAt: time.Now().Add(-1 * time.Minute), Host: domain.HostInfo{Hostname: "host-2"}}
	snap3 := &domain.HostSnapshot{CapturedAt: time.Now(), Host: domain.HostInfo{Hostname: "host-3"}}

	rb.Push(snap1)
	rb.Push(snap2)
	rb.Push(snap3)

	if rb.count != 3 {
		t.Errorf("expected count 3, got %d", rb.count)
	}

	if rb.Latest().Host.Hostname != "host-3" {
		t.Errorf("expected Latest() host-3, got %s", rb.Latest().Host.Hostname)
	}

	// Push 4th item (should overwrite snap1)
	snap4 := &domain.HostSnapshot{CapturedAt: time.Now().Add(1 * time.Minute), Host: domain.HostInfo{Hostname: "host-4"}}
	rb.Push(snap4)

	if rb.count != 3 {
		t.Errorf("expected count to remain 3, got %d", rb.count)
	}

	if rb.Latest().Host.Hostname != "host-4" {
		t.Errorf("expected Latest() host-4, got %s", rb.Latest().Host.Hostname)
	}

	all := rb.GetAll()
	if len(all) != 3 {
		t.Fatalf("expected 3 items in GetAll, got %d", len(all))
	}

	expectedOrder := []string{"host-2", "host-3", "host-4"}
	for i, s := range all {
		if s.Host.Hostname != expectedOrder[i] {
			t.Errorf("index %d expected %s, got %s", i, expectedOrder[i], s.Host.Hostname)
		}
	}
}

func TestRingBuffer_ThreadSafety(t *testing.T) {
	rb := NewRingBuffer(50)
	done := make(chan bool)

	// Writer goroutine
	go func() {
		for i := 0; i < 200; i++ {
			rb.Push(&domain.HostSnapshot{Host: domain.HostInfo{Hostname: fmt.Sprintf("host-%d", i)}})
			time.Sleep(1 * time.Millisecond)
		}
		done <- true
	}()

	// Reader goroutines
	for r := 0; r < 3; r++ {
		go func() {
			for i := 0; i < 100; i++ {
				_ = rb.Latest()
				_ = rb.GetAll()
				time.Sleep(2 * time.Millisecond)
			}
			done <- true
		}()
	}

	for i := 0; i < 4; i++ {
		<-done
	}
}
