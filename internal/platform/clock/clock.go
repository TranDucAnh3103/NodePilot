package clock

import "time"

// Clock provides an interface for time operations, allowing easy mocking in unit tests.
type Clock interface {
	Now() time.Time
	NowUTC() time.Time
	Since(t time.Time) time.Duration
}

// RealClock implements Clock using the standard time package.
type RealClock struct{}

func NewRealClock() Clock {
	return &RealClock{}
}

func (r *RealClock) Now() time.Time {
	return time.Now()
}

func (r *RealClock) NowUTC() time.Time {
	return time.Now().UTC()
}

func (r *RealClock) Since(t time.Time) time.Duration {
	return time.Since(t)
}
