package domain

import (
	"errors"
	"time"
)

var (
	ErrPresetNotFound  = errors.New("task preset not found")
	ErrTaskConcurrency = errors.New("another task is already currently running")
	ErrExecutionNotFound = errors.New("task execution not found")
	ErrExecutionNotRunning = errors.New("task execution is not running")
)

type TaskPreset struct {
	ID             string        `json:"id"`
	Name           string        `json:"name"`
	Description    string        `json:"description"`
	Category       string        `json:"category"` // "maintenance", "backup", "diagnostics"
	Timeout        time.Duration `json:"timeout"`
	AllowedRoles   []string      `json:"allowedRoles"`
	DangerLevel    string        `json:"dangerLevel"` // "safe", "moderate", "high"
	ConfirmationMsg string       `json:"confirmationMsg,omitempty"`
}

type TaskExecution struct {
	ID            string     `json:"id"`
	PresetID      string     `json:"presetId"`
	PresetName    string     `json:"presetName,omitempty"`
	ActorID       string     `json:"actorId"`
	ActorUsername string     `json:"actorUsername"`
	Status        string     `json:"status"` // "queued", "running", "succeeded", "failed", "cancelled", "timed_out"
	Output        string     `json:"output"` // Bounded to 500 lines / 512 KiB
	ExitCode      int        `json:"exitCode"`
	StartedAt     time.Time  `json:"startedAt"`
	CompletedAt   *time.Time `json:"completedAt,omitempty"`
	ErrorMessage  string     `json:"errorMessage,omitempty"`
}
