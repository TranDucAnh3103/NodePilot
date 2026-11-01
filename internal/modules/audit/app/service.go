package app

import (
	"context"
	"time"

	"github.com/google/uuid"
	"hscc/internal/modules/audit/domain"
	"hscc/internal/platform/security"
)

type AuditService struct {
	repo AuditRepo
}

type AuditRepo interface {
	Insert(ctx context.Context, e *domain.AuditEvent) error
	Query(ctx context.Context, filter domain.AuditFilter) ([]*domain.AuditEvent, int, error)
}

func NewAuditService(repo AuditRepo) *AuditService {
	return &AuditService{repo: repo}
}

// Log records an audit event, automatically redacting any sensitive data before persisting.
func (s *AuditService) Log(ctx context.Context, actorID, actorUsername, verb, targetType, targetID, result, requestID, ipAddress, detailsJSON string) error {
	redactedDetails := security.RedactSecrets(detailsJSON)
	target := targetID
	if targetType != "" {
		target = targetType + ":" + targetID
	}

	event := &domain.AuditEvent{
		ID:                  uuid.NewString(),
		Timestamp:           time.Now().UTC(),
		ActorID:             actorID,
		ActorUsername:       actorUsername,
		Verb:                verb,
		Target:              target,
		TargetType:          targetType,
		TargetID:            targetID,
		Result:              result,
		RequestID:           requestID,
		IPAddress:           ipAddress,
		DetailsRedactedJSON: redactedDetails,
	}

	return s.repo.Insert(ctx, event)
}

// QueryEvents retrieves audit logs with filters and pagination.
func (s *AuditService) QueryEvents(ctx context.Context, filter domain.AuditFilter) ([]*domain.AuditEvent, int, error) {
	return s.repo.Query(ctx, filter)
}
