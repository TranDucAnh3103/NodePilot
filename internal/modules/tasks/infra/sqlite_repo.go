package infra

import (
	"context"
	"database/sql"
	"time"

	"hscc/internal/modules/tasks/domain"
	"hscc/internal/platform/sqlite"
)

type TaskRepo struct {
	db *sqlite.DB
}

func NewTaskRepo(db *sqlite.DB) *TaskRepo {
	return &TaskRepo{db: db}
}

func (r *TaskRepo) Save(ctx context.Context, e *domain.TaskExecution) error {
	var completedAt sql.NullString
	if e.CompletedAt != nil {
		completedAt.String = e.CompletedAt.Format(time.RFC3339)
		completedAt.Valid = true
	}

	query := `
		INSERT INTO task_executions (id, preset_id, actor_id, actor_username, status, output, exit_code, started_at, completed_at, error_message)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			status = excluded.status,
			output = excluded.output,
			exit_code = excluded.exit_code,
			completed_at = excluded.completed_at,
			error_message = excluded.error_message
	`
	_, err := r.db.ExecContext(ctx, query,
		e.ID, e.PresetID, e.ActorID, e.ActorUsername, e.Status, e.Output, e.ExitCode,
		e.StartedAt.Format(time.RFC3339), completedAt, e.ErrorMessage,
	)
	return err
}

func (r *TaskRepo) GetByID(ctx context.Context, id string) (*domain.TaskExecution, error) {
	query := `SELECT id, preset_id, actor_id, actor_username, status, output, exit_code, started_at, completed_at, error_message FROM task_executions WHERE id = ?`
	row := r.db.QueryRowContext(ctx, query, id)

	var e domain.TaskExecution
	var startedAt string
	var completedAt sql.NullString
	var errMsg sql.NullString

	if err := row.Scan(&e.ID, &e.PresetID, &e.ActorID, &e.ActorUsername, &e.Status, &e.Output, &e.ExitCode, &startedAt, &completedAt, &errMsg); err != nil {
		if err == sql.ErrNoRows {
			return nil, domain.ErrExecutionNotFound
		}
		return nil, err
	}

	if t, err := time.Parse(time.RFC3339, startedAt); err == nil {
		e.StartedAt = t
	}
	if completedAt.Valid {
		if t, err := time.Parse(time.RFC3339, completedAt.String); err == nil {
			e.CompletedAt = &t
		}
	}
	if errMsg.Valid {
		e.ErrorMessage = errMsg.String
	}
	return &e, nil
}

func (r *TaskRepo) List(ctx context.Context, limit int) ([]*domain.TaskExecution, error) {
	if limit <= 0 {
		limit = 20
	}
	query := `SELECT id, preset_id, actor_id, actor_username, status, output, exit_code, started_at, completed_at, error_message FROM task_executions ORDER BY started_at DESC LIMIT ?`
	rows, err := r.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*domain.TaskExecution
	for rows.Next() {
		var e domain.TaskExecution
		var startedAt string
		var completedAt sql.NullString
		var errMsg sql.NullString

		if err := rows.Scan(&e.ID, &e.PresetID, &e.ActorID, &e.ActorUsername, &e.Status, &e.Output, &e.ExitCode, &startedAt, &completedAt, &errMsg); err != nil {
			return nil, err
		}
		if t, err := time.Parse(time.RFC3339, startedAt); err == nil {
			e.StartedAt = t
		}
		if completedAt.Valid {
			if t, err := time.Parse(time.RFC3339, completedAt.String); err == nil {
				e.CompletedAt = &t
			}
		}
		if errMsg.Valid {
			e.ErrorMessage = errMsg.String
		}
		result = append(result, &e)
	}
	return result, nil
}
