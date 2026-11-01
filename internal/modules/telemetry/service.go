package telemetry

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"

	"hscc/internal/modules/system/domain"
	"hscc/internal/modules/system/infra"
)

var (
	ErrNoSnapshotYet = errors.New("system metrics snapshot warming up")
)

type Subscriber chan *domain.HostSnapshot

type TelemetryService struct {
	collector   *infra.SystemCollector
	ringBuffer  *RingBuffer
	subscribers map[Subscriber]struct{}
	subMu       sync.RWMutex
	maxSubs     int
}

func NewTelemetryService(collector *infra.SystemCollector, ringCapacity, maxSubs int) *TelemetryService {
	if maxSubs <= 0 {
		maxSubs = 3
	}
	return &TelemetryService{
		collector:   collector,
		ringBuffer:  NewRingBuffer(ringCapacity),
		subscribers: make(map[Subscriber]struct{}),
		maxSubs:     maxSubs,
	}
}

// Start runs the periodic single shared collector goroutine.
func (s *TelemetryService) Start(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = 3 * time.Second
	}

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		slog.Info("starting shared system telemetry collector", slog.Duration("interval", interval))

		// First collection immediately
		snap, err := s.collector.Collect(ctx)
		if err == nil && snap != nil {
			s.ringBuffer.Push(snap)
			s.broadcast(snap)
		}

		for {
			select {
			case <-ctx.Done():
				slog.Info("system telemetry collector stopped")
				return
			case <-ticker.C:
				snap, err := s.collector.Collect(ctx)
				if err != nil {
					slog.Warn("collector failed to sample host metrics", slog.String("error", err.Error()))
					continue
				}
				s.ringBuffer.Push(snap)
				s.broadcast(snap)
			}
		}
	}()
}

// Subscribe registers a new subscriber channel (capacity 2).
func (s *TelemetryService) Subscribe() (Subscriber, error) {
	s.subMu.Lock()
	defer s.subMu.Unlock()

	if len(s.subscribers) >= s.maxSubs {
		return nil, errors.New("maximum concurrent websocket clients reached (3)")
	}

	ch := make(Subscriber, 2)
	s.subscribers[ch] = struct{}{}

	// Send current snapshot immediately if available
	if latest := s.ringBuffer.Latest(); latest != nil {
		ch <- latest
	}

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

// GetSummary returns the latest snapshot or waits for first tick.
func (s *TelemetryService) GetSummary() (*domain.HostSnapshot, error) {
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
	return s.ringBuffer.GetAll()
}
