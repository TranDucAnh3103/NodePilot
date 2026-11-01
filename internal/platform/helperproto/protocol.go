package helperproto

import (
	"encoding/json"
	"errors"
)

const CurrentProtocolVersion = 1

// Operations supported by hscc-helper
const (
	OpDockerContainerList    = "docker.container.list"
	OpDockerContainerInspect = "docker.container.inspect"
	OpDockerContainerStats   = "docker.container.stats"
	OpDockerContainerLogs    = "docker.container.logs"
	OpDockerContainerAction  = "docker.container.action"

	OpSystemdUnitList   = "systemd.unit.list"
	OpSystemdUnitAction = "systemd.unit.action"
	OpSystemdUnitLogs   = "systemd.unit.logs"

	OpPing = "system.ping"
)

// Standard Error Codes
const (
	ErrCodeProtectedTargetDenied = "PROTECTED_TARGET_DENIED"
	ErrCodeTargetNotAllowlisted  = "TARGET_NOT_ALLOWLISTED"
	ErrCodeTargetNotFound        = "TARGET_NOT_FOUND"
	ErrCodeOperationFailed       = "OPERATION_FAILED"
	ErrCodeInvalidProtocol       = "INVALID_PROTOCOL"
	ErrCodeDeadlineExceeded      = "DEADLINE_EXCEEDED"
	ErrCodeUnauthorizedCaller   = "UNAUTHORIZED_CALLER"
)

// Request encapsulates a typed message sent from hscc-api to hscc-helper.
type Request struct {
	ProtocolVersion int    `json:"protocolVersion"`
	RequestID       string `json:"requestId"`
	Operation       string `json:"operation"`
	TargetID        string `json:"targetId,omitempty"`
	Action          string `json:"action,omitempty"` // "start", "stop", "restart"
	TailLines       int    `json:"tailLines,omitempty"`
	DeadlineMs      int    `json:"deadlineMs,omitempty"`
	ActorID         string `json:"actorId,omitempty"`
	Reason          string `json:"reason,omitempty"`
}

// Response encapsulates a typed response returned from hscc-helper.
type Response struct {
	RequestID    string          `json:"requestId"`
	Success      bool            `json:"success"`
	ErrorCode    string          `json:"errorCode,omitempty"`
	ErrorMessage string          `json:"errorMessage,omitempty"`
	Data         json.RawMessage `json:"data,omitempty"`
}

// Common error representations
var (
	ErrProtectedTarget = errors.New("target is hardcoded protected and cannot be mutated")
	ErrNotAllowlisted  = errors.New("target is not in the managed allowlist")
	ErrNotFound        = errors.New("target not found")
)
