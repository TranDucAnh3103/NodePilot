package infra

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"hscc/internal/modules/workloads/domain"
	"hscc/internal/platform/sqlite"
)

type ActionRepository struct {
	db *sqlite.DB
}

func NewActionRepository(db *sqlite.DB) *ActionRepository {
	return &ActionRepository{db: db}
}

// Create inserts a new action record. If (actor_id, idempotency_key) already exists, returns ErrDuplicateAction.
func (r *ActionRepository) Create(ctx context.Context, a *domain.ActionRecord) error {
	query := `
		INSERT INTO actions (id, actor_id, kind, exact_target, operation, idempotency_key, state, requested_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`
	_, err := r.db.ExecContext(ctx, query,
		a.ID,
		a.ActorID,
		a.Kind,
		a.Target,
		a.Operation,
		a.IdempotencyKey,
		a.State,
		a.RequestedAt.UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		if stringsContainsConstraint(err) {
			return domain.ErrDuplicateAction
		}
		return fmt.Errorf("failed to create action: %w", err)
	}
	return nil
}

// GetByIdempotencyKey retrieves an action by actor and key.
func (r *ActionRepository) GetByIdempotencyKey(ctx context.Context, actorID, key string) (*domain.ActionRecord, error) {
	query := `
		SELECT id, actor_id, kind, exact_target, operation, idempotency_key, state, requested_at, completed_at, error_code
		FROM actions
		WHERE actor_id = ? AND idempotency_key = ?
	`
	row := r.db.QueryRowContext(ctx, query, actorID, key)

	var a domain.ActionRecord
	var reqAtStr string
	var compAtStr sql.NullString
	var errCode sql.NullString

	err := row.Scan(&a.ID, &a.ActorID, &a.Kind, &a.Target, &a.Operation, &a.IdempotencyKey, &a.State, &reqAtStr, &compAtStr, &errCode)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrActionNotFound
		}
		return nil, fmt.Errorf("failed to query action by idempotency key: %w", err)
	}

	a.RequestedAt, _ = time.Parse(time.RFC3339Nano, reqAtStr)
	if compAtStr.Valid {
		t, _ := time.Parse(time.RFC3339Nano, compAtStr.String)
		a.CompletedAt = &t
	}
	if errCode.Valid {
		a.ErrorCode = errCode.String
	}

	return &a, nil
}

// UpdateState updates the state and completion of an action.
func (r *ActionRepository) UpdateState(ctx context.Context, id, state, errorCode string) error {
	nowStr := time.Now().UTC().Format(time.RFC3339Nano)
	query := `
		UPDATE actions
		SET state = ?, completed_at = ?, error_code = ?
		WHERE id = ?
	`
	_, err := r.db.ExecContext(ctx, query, state, nowStr, errorCode, id)
	if err != nil {
		return fmt.Errorf("failed to update action state: %w", err)
	}
	return nil
}

func stringsContainsConstraint(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return len(msg) > 0 && (contains(msg, "UNIQUE constraint") || contains(msg, "constraint failed"))
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) > 0 && indexOf(s, substr) >= 0)
}

func indexOf(s, substr string) int {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
