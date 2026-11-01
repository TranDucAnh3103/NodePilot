package domain

import (
	"errors"
	"time"
)

var (
	ErrActionNotFound    = errors.New("action not found")
	ErrDuplicateAction   = errors.New("action with this idempotency key is already running or completed")
	ErrTargetProtected   = errors.New("target is hardcoded protected and cannot be mutated")
	ErrTargetUnauthorized = errors.New("target is not allowlisted for mutation")
)

type PortMapping struct {
	IP          string `json:"ip,omitempty"`
	PrivatePort uint16 `json:"privatePort"`
	PublicPort  uint16 `json:"publicPort,omitempty"`
	Type        string `json:"type"` // "tcp", "udp"
}

type Container struct {
	ID               string        `json:"id"`
	Name             string        `json:"name"`
	Image            string        `json:"image"`
	State            string        `json:"state"` // "running", "exited", "paused", "restarting"
	Status           string        `json:"status"`
	HealthStatus     string        `json:"healthStatus"` // "healthy", "unhealthy", "starting", "none"
	Project          string        `json:"project"`      // from label com.docker.compose.project
	Ports            []PortMapping `json:"ports"`
	CPUPercent       float64       `json:"cpuPercent"`
	MemoryUsageBytes int64         `json:"memoryUsageBytes"`
	MemoryLimitBytes int64         `json:"memoryLimitBytes"`
	RestartCount     int           `json:"restartCount"`
	Created          time.Time     `json:"created"`
	IsAllowlisted    bool          `json:"isAllowlisted"`
	IsProtected      bool          `json:"isProtected"`
	AllowedActions   []string      `json:"allowedActions"`
}

type ServiceUnit struct {
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	LoadState      string   `json:"loadState"`
	ActiveState    string   `json:"activeState"` // "active", "inactive", "failed"
	SubState       string   `json:"subState"`    // "running", "exited", "dead"
	MainPID        int      `json:"mainPid"`
	Category       string   `json:"category"` // "core_protected", "application", "system"
	IsProtected    bool     `json:"isProtected"`
	IsAllowlisted  bool     `json:"isAllowlisted"`
	AllowedActions []string `json:"allowedActions"`
}

type ActionRecord struct {
	ID             string     `json:"id"`
	ActorID        string     `json:"actorId"`
	Kind           string     `json:"kind"` // "docker", "systemd"
	Target         string     `json:"target"`
	Operation      string     `json:"operation"` // "start", "stop", "restart"
	IdempotencyKey string     `json:"idempotencyKey"`
	State          string     `json:"state"` // "queued", "running", "succeeded", "failed", "timed_out"
	RequestedAt    time.Time  `json:"requestedAt"`
	CompletedAt    *time.Time `json:"completedAt,omitempty"`
	ErrorCode      string     `json:"errorCode,omitempty"`
}

type WorkloadActionRequest struct {
	Operation string `json:"operation"` // "start", "stop", "restart"
	Reason    string `json:"reason,omitempty"`
}
