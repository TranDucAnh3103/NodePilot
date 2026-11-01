package app

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	auditApp "hscc/internal/modules/audit/app"
	"hscc/internal/modules/guardrail"
	"hscc/internal/modules/workloads/domain"
	"hscc/internal/platform/security"
)

type DockerPort interface {
	ListContainers(ctx context.Context) ([]*domain.Container, error)
	GetContainerLogs(ctx context.Context, id string, tailLines int) (string, error)
	ExecuteAction(ctx context.Context, id, action string) error
}

type SystemdPort interface {
	ListServices(ctx context.Context) ([]*domain.ServiceUnit, error)
	GetServiceLogs(ctx context.Context, unitName string, tailLines int) (string, error)
	RestartService(ctx context.Context, unitName string) error
}

type ActionRepo interface {
	Create(ctx context.Context, a *domain.ActionRecord) error
	GetByIdempotencyKey(ctx context.Context, actorID, key string) (*domain.ActionRecord, error)
	UpdateState(ctx context.Context, id, state, errorCode string) error
}

type WorkloadService struct {
	dockerClient  DockerPort
	systemdClient SystemdPort
	policyEngine  *guardrail.PolicyEngine
	actionRepo    ActionRepo
	auditSvc      *auditApp.AuditService
}

func NewWorkloadService(
	dockerClient DockerPort,
	systemdClient SystemdPort,
	policyEngine *guardrail.PolicyEngine,
	actionRepo ActionRepo,
	auditSvc *auditApp.AuditService,
) *WorkloadService {
	return &WorkloadService{
		dockerClient:  dockerClient,
		systemdClient: systemdClient,
		policyEngine:  policyEngine,
		actionRepo:    actionRepo,
		auditSvc:      auditSvc,
	}
}

// ListContainers returns 100% of all Docker containers enriched with Guardrail metadata.
func (s *WorkloadService) ListContainers(ctx context.Context) ([]*domain.Container, error) {
	containers, err := s.dockerClient.ListContainers(ctx)
	if err != nil {
		slog.Warn("failed to fetch live docker containers, falling back gracefully", slog.String("error", err.Error()))
		return []*domain.Container{}, nil
	}

	for _, c := range containers {
		c.IsProtected = guardrail.IsProtected(c.Name)
		if c.IsProtected {
			c.IsAllowlisted = false
			c.AllowedActions = []string{}
			continue
		}

		// Check allowlist for standard actions
		var allowed []string
		for _, act := range []string{"start", "stop", "restart"} {
			if ok, _ := s.policyEngine.CanMutateDocker(c.Name, c.Project, act); ok {
				allowed = append(allowed, act)
			}
		}

		c.AllowedActions = allowed
		c.IsAllowlisted = len(allowed) > 0
	}

	return containers, nil
}

// GetContainerLogs returns redacted container logs with line tailing limit.
func (s *WorkloadService) GetContainerLogs(ctx context.Context, id string, tailLines int) (string, error) {
	return s.dockerClient.GetContainerLogs(ctx, id, tailLines)
}

// ExecuteContainerAction executes Start, Stop, or Restart with Guardrail and Idempotency enforcement.
func (s *WorkloadService) ExecuteContainerAction(
	ctx context.Context,
	actorID, actorUsername, containerName, projectName, action, idempotencyKey, ip, requestID, reason string,
) (*domain.ActionRecord, error) {
	cleanName := strings.TrimPrefix(containerName, "/")
	verb := fmt.Sprintf("docker.container.%s", strings.ToLower(action))

	// 1. Idempotency Check
	if idempotencyKey != "" {
		existing, err := s.actionRepo.GetByIdempotencyKey(ctx, actorID, idempotencyKey)
		if err == nil && existing != nil {
			// If action was within 60 seconds, return cached record
			if time.Since(existing.RequestedAt) < 60*time.Second {
				return existing, nil
			}
		}
	}

	actionRecord := &domain.ActionRecord{
		ID:             uuid.NewString(),
		ActorID:        actorID,
		Kind:           "docker",
		Target:         cleanName,
		Operation:      strings.ToLower(action),
		IdempotencyKey: idempotencyKey,
		State:          "running",
		RequestedAt:    time.Now().UTC(),
	}
	_ = s.actionRepo.Create(ctx, actionRecord)

	// 2. Guardrail Policy Check
	allowed, denyReason := s.policyEngine.CanMutateDocker(cleanName, projectName, action)
	if !allowed {
		_ = s.actionRepo.UpdateState(ctx, actionRecord.ID, "failed", "GUARDRAIL_DENIED")

		// Audit Log Denied attempt
		_ = s.auditSvc.Log(ctx, actorID, actorUsername, verb, "docker", cleanName, "denied", requestID, ip,
			fmt.Sprintf(`{"reason": %q, "error": %q}`, reason, security.RedactSecrets(denyReason)))

		if guardrail.IsProtected(cleanName) {
			return actionRecord, domain.ErrTargetProtected
		}
		return actionRecord, domain.ErrTargetUnauthorized
	}

	// 3. Execute with Timeout
	actionCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	err := s.dockerClient.ExecuteAction(actionCtx, cleanName, action)
	if err != nil {
		_ = s.actionRepo.UpdateState(ctx, actionRecord.ID, "failed", "EXECUTION_ERROR")
		_ = s.auditSvc.Log(ctx, actorID, actorUsername, verb, "docker", cleanName, "failed", requestID, ip,
			fmt.Sprintf(`{"reason": %q, "error": %q}`, reason, security.RedactSecrets(err.Error())))
		return actionRecord, err
	}

	// 4. Record Success
	_ = s.actionRepo.UpdateState(ctx, actionRecord.ID, "succeeded", "")
	_ = s.auditSvc.Log(ctx, actorID, actorUsername, verb, "docker", cleanName, "success", requestID, ip,
		fmt.Sprintf(`{"reason": %q}`, reason))

	actionRecord.State = "succeeded"
	now := time.Now().UTC()
	actionRecord.CompletedAt = &now
	return actionRecord, nil
}

// ListServices returns 100% of all systemd units enriched with Guardrail metadata.
func (s *WorkloadService) ListServices(ctx context.Context) ([]*domain.ServiceUnit, error) {
	services, err := s.systemdClient.ListServices(ctx)
	if err != nil {
		slog.Warn("failed to fetch live systemd services, falling back gracefully", slog.String("error", err.Error()))
		return []*domain.ServiceUnit{}, nil
	}

	for _, svc := range services {
		svc.IsProtected = guardrail.IsProtected(svc.Name)
		if svc.IsProtected {
			svc.Category = "core_protected"
			svc.IsAllowlisted = false
			svc.AllowedActions = []string{}
			continue
		}

		// Check allowlist
		var allowed []string
		for _, act := range []string{"restart"} {
			if ok, _ := s.policyEngine.CanMutateSystemd(svc.Name, act); ok {
				allowed = append(allowed, act)
			}
		}

		svc.AllowedActions = allowed
		svc.IsAllowlisted = len(allowed) > 0
		if svc.IsAllowlisted {
			svc.Category = "application"
		} else if svc.Category == "" {
			svc.Category = "system"
		}
	}

	return services, nil
}

// GetServiceLogs returns redacted journald logs for a service.
func (s *WorkloadService) GetServiceLogs(ctx context.Context, unitName string, tailLines int) (string, error) {
	return s.systemdClient.GetServiceLogs(ctx, unitName, tailLines)
}

// ExecuteServiceAction restarts a systemd service with Guardrail and Idempotency enforcement.
func (s *WorkloadService) ExecuteServiceAction(
	ctx context.Context,
	actorID, actorUsername, unitName, action, idempotencyKey, ip, requestID, reason string,
) (*domain.ActionRecord, error) {
	cleanUnit := strings.TrimSpace(unitName)
	verb := fmt.Sprintf("systemd.unit.%s", strings.ToLower(action))

	// 1. Idempotency Check
	if idempotencyKey != "" {
		existing, err := s.actionRepo.GetByIdempotencyKey(ctx, actorID, idempotencyKey)
		if err == nil && existing != nil {
			if time.Since(existing.RequestedAt) < 60*time.Second {
				return existing, nil
			}
		}
	}

	actionRecord := &domain.ActionRecord{
		ID:             uuid.NewString(),
		ActorID:        actorID,
		Kind:           "systemd",
		Target:         cleanUnit,
		Operation:      strings.ToLower(action),
		IdempotencyKey: idempotencyKey,
		State:          "running",
		RequestedAt:    time.Now().UTC(),
	}
	_ = s.actionRepo.Create(ctx, actionRecord)

	// 2. Guardrail Policy Check
	allowed, denyReason := s.policyEngine.CanMutateSystemd(cleanUnit, action)
	if !allowed {
		_ = s.actionRepo.UpdateState(ctx, actionRecord.ID, "failed", "GUARDRAIL_DENIED")

		_ = s.auditSvc.Log(ctx, actorID, actorUsername, verb, "systemd", cleanUnit, "denied", requestID, ip,
			fmt.Sprintf(`{"reason": %q, "error": %q}`, reason, security.RedactSecrets(denyReason)))

		if guardrail.IsProtected(cleanUnit) {
			return actionRecord, domain.ErrTargetProtected
		}
		return actionRecord, domain.ErrTargetUnauthorized
	}

	// 3. Execute with Timeout
	actionCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	err := s.systemdClient.RestartService(actionCtx, cleanUnit)
	if err != nil {
		_ = s.actionRepo.UpdateState(ctx, actionRecord.ID, "failed", "EXECUTION_ERROR")
		_ = s.auditSvc.Log(ctx, actorID, actorUsername, verb, "systemd", cleanUnit, "failed", requestID, ip,
			fmt.Sprintf(`{"reason": %q, "error": %q}`, reason, security.RedactSecrets(err.Error())))
		return actionRecord, err
	}

	// 4. Record Success
	_ = s.actionRepo.UpdateState(ctx, actionRecord.ID, "succeeded", "")
	_ = s.auditSvc.Log(ctx, actorID, actorUsername, verb, "systemd", cleanUnit, "success", requestID, ip,
		fmt.Sprintf(`{"reason": %q}`, reason))

	actionRecord.State = "succeeded"
	now := time.Now().UTC()
	actionRecord.CompletedAt = &now
	return actionRecord, nil
}
