package telemetry

import (
	"sync"

	"hscc/internal/modules/system/domain"
)

type RingBuffer struct {
	mu       sync.RWMutex
	capacity int
	snapshots []*domain.HostSnapshot
	head     int
	count    int
}

func NewRingBuffer(capacity int) *RingBuffer {
	if capacity <= 0 {
		capacity = 120
	}
	return &RingBuffer{
		capacity:  capacity,
		snapshots: make([]*domain.HostSnapshot, capacity),
	}
}

// Push adds a new snapshot, overwriting the oldest when full.
func (r *RingBuffer) Push(s *domain.HostSnapshot) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.snapshots[r.head] = s
	r.head = (r.head + 1) % r.capacity
	if r.count < r.capacity {
		r.count++
	}
}

// Latest returns the most recently pushed snapshot.
func (r *RingBuffer) Latest() *domain.HostSnapshot {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if r.count == 0 {
		return nil
	}

	idx := (r.head - 1 + r.capacity) % r.capacity
	return r.snapshots[idx]
}

// GetAll returns snapshots in chronological order (oldest to newest).
func (r *RingBuffer) GetAll() []*domain.HostSnapshot {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if r.count == 0 {
		return nil
	}

	res := make([]*domain.HostSnapshot, r.count)
	start := (r.head - r.count + r.capacity) % r.capacity
	for i := 0; i < r.count; i++ {
		res[i] = r.snapshots[(start+i)%r.capacity]
	}
	return res
}
