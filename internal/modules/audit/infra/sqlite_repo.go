package infra

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"hscc/internal/modules/audit/domain"
	"hscc/internal/platform/sqlite"
)

type AuditRepository struct {
	db *sqlite.DB
}

func NewAuditRepository(db *sqlite.DB) *AuditRepository {
	return &AuditRepository{db: db}
}

// Insert writes an immutable audit record to audit_events.
// NOTE: By design, there are NO update or delete methods in this repository.
func (r *AuditRepository) Insert(ctx context.Context, e *domain.AuditEvent) error {
	details := map[string]interface{}{
		"actorUsername": e.ActorUsername,
		"ipAddress":     e.IPAddress,
		"targetType":    e.TargetType,
		"targetId":      e.TargetID,
	}
	if e.DetailsRedactedJSON != "" {
		var extra map[string]interface{}
		if err := json.Unmarshal([]byte(e.DetailsRedactedJSON), &extra); err == nil {
			for k, v := range extra {
				details[k] = v
			}
		} else {
			details["raw"] = e.DetailsRedactedJSON
		}
	}

	detailsBytes, _ := json.Marshal(details)

	query := `
		INSERT INTO audit_events (id, ts, actor_id, verb, target, result, request_id, details_redacted_json)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`
	_, err := r.db.ExecContext(ctx, query,
		e.ID,
		e.Timestamp.UTC().Format(time.RFC3339Nano),
		e.ActorID,
		e.Verb,
		e.Target,
		e.Result,
		e.RequestID,
		string(detailsBytes),
	)
	if err != nil {
		return fmt.Errorf("failed to insert audit event: %w", err)
	}
	return nil
}

// Query retrieves audit events with optional keyword filtering, result filtering, and pagination.
func (r *AuditRepository) Query(ctx context.Context, filter domain.AuditFilter) ([]*domain.AuditEvent, int, error) {
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.PageSize < 1 || filter.PageSize > 100 {
		filter.PageSize = 25
	}
	offset := (filter.Page - 1) * filter.PageSize

	var conditions []string
	var args []interface{}

	if filter.Keyword != "" {
		conditions = append(conditions, "(verb LIKE ? OR target LIKE ? OR details_redacted_json LIKE ?)")
		kw := "%" + strings.TrimSpace(filter.Keyword) + "%"
		args = append(args, kw, kw, kw)
	}
	if filter.Verb != "" {
		conditions = append(conditions, "verb = ?")
		args = append(args, filter.Verb)
	}
	if filter.Result != "" {
		conditions = append(conditions, "result = ?")
		args = append(args, filter.Result)
	}
	if !filter.From.IsZero() {
		conditions = append(conditions, "ts >= ?")
		args = append(args, filter.From.UTC().Format(time.RFC3339Nano))
	}
	if !filter.To.IsZero() {
		conditions = append(conditions, "ts <= ?")
		args = append(args, filter.To.UTC().Format(time.RFC3339Nano))
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// 1. Total count
	countQuery := fmt.Sprintf("SELECT COUNT(1) FROM audit_events %s", whereClause)
	var total int
	err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count audit events: %w", err)
	}

	// 2. Paginated rows
	selectQuery := fmt.Sprintf(`
		SELECT id, ts, actor_id, verb, target, result, request_id, details_redacted_json
		FROM audit_events
		%s
		ORDER BY ts DESC
		LIMIT ? OFFSET ?
	`, whereClause)

	rowsArgs := append(args, filter.PageSize, offset)
	rows, err := r.db.QueryContext(ctx, selectQuery, rowsArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to select audit events: %w", err)
	}
	defer rows.Close()

	var events []*domain.AuditEvent
	for rows.Next() {
		var e domain.AuditEvent
		var tsStr string
		var detailsStr string

		err := rows.Scan(&e.ID, &tsStr, &e.ActorID, &e.Verb, &e.Target, &e.Result, &e.RequestID, &detailsStr)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan audit event: %w", err)
		}

		e.Timestamp, _ = time.Parse(time.RFC3339Nano, tsStr)
		if e.Timestamp.IsZero() {
			e.Timestamp, _ = time.Parse(time.RFC3339, tsStr)
		}
		e.DetailsRedactedJSON = detailsStr

		// Extract metadata if available
		if detailsStr != "" {
			var details map[string]interface{}
			if err := json.Unmarshal([]byte(detailsStr), &details); err == nil {
				if u, ok := details["actorUsername"].(string); ok {
					e.ActorUsername = u
				}
				if ip, ok := details["ipAddress"].(string); ok {
					e.IPAddress = ip
				}
				if tt, ok := details["targetType"].(string); ok {
					e.TargetType = tt
				}
				if tid, ok := details["targetId"].(string); ok {
					e.TargetID = tid
				}
			}
		}

		events = append(events, &e)
	}

	return events, total, nil
}
