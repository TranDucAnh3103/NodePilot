package infra

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"hscc/internal/modules/auth/domain"
	"hscc/internal/platform/sqlite"
)

type AuthRepository struct {
	db *sqlite.DB
}

func NewAuthRepository(db *sqlite.DB) *AuthRepository {
	return &AuthRepository{db: db}
}

func (r *AuthRepository) CountAdmins(ctx context.Context) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, "SELECT COUNT(1) FROM users WHERE role = ?", domain.RoleAdmin).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count admins: %w", err)
	}
	return count, nil
}

func (r *AuthRepository) CreateUser(ctx context.Context, u *domain.User) error {
	query := `
		INSERT INTO users (id, username, password_hash, role, enabled, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`
	enabledInt := 0
	if u.Enabled {
		enabledInt = 1
	}
	_, err := r.db.ExecContext(ctx, query,
		u.ID,
		u.Username,
		u.PasswordHash,
		u.Role,
		enabledInt,
		u.CreatedAt.Format(time.RFC3339),
	)
	if err != nil {
		return fmt.Errorf("failed to insert user: %w", err)
	}
	return nil
}

func (r *AuthRepository) GetUserByUsername(ctx context.Context, username string) (*domain.User, error) {
	query := `SELECT id, username, password_hash, role, enabled, created_at FROM users WHERE username = ?`
	row := r.db.QueryRowContext(ctx, query, username)

	var u domain.User
	var enabledInt int
	var createdAtStr string

	err := row.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &enabledInt, &createdAtStr)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrUserNotFound
		}
		return nil, fmt.Errorf("failed to get user by username: %w", err)
	}

	u.Enabled = enabledInt == 1
	u.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
	return &u, nil
}

func (r *AuthRepository) GetUserByID(ctx context.Context, id string) (*domain.User, error) {
	query := `SELECT id, username, password_hash, role, enabled, created_at FROM users WHERE id = ?`
	row := r.db.QueryRowContext(ctx, query, id)

	var u domain.User
	var enabledInt int
	var createdAtStr string

	err := row.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &enabledInt, &createdAtStr)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrUserNotFound
		}
		return nil, fmt.Errorf("failed to get user by id: %w", err)
	}

	u.Enabled = enabledInt == 1
	u.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
	return &u, nil
}

func (r *AuthRepository) CreateSession(ctx context.Context, s *domain.Session) error {
	query := `
		INSERT INTO refresh_sessions (id, user_id, token_hash, expires_at, revoked_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`
	var revokedAtStr *string
	if s.RevokedAt != nil {
		t := s.RevokedAt.Format(time.RFC3339)
		revokedAtStr = &t
	}

	_, err := r.db.ExecContext(ctx, query,
		s.ID,
		s.UserID,
		s.TokenHash,
		s.ExpiresAt.Format(time.RFC3339),
		revokedAtStr,
		s.CreatedAt.Format(time.RFC3339),
	)
	if err != nil {
		return fmt.Errorf("failed to create session: %w", err)
	}
	return nil
}

func (r *AuthRepository) GetSessionByTokenHash(ctx context.Context, hash string) (*domain.Session, error) {
	query := `SELECT id, user_id, token_hash, expires_at, revoked_at, created_at FROM refresh_sessions WHERE token_hash = ?`
	row := r.db.QueryRowContext(ctx, query, hash)

	var s domain.Session
	var expiresAtStr, createdAtStr string
	var revokedAtStr sql.NullString

	err := row.Scan(&s.ID, &s.UserID, &s.TokenHash, &expiresAtStr, &revokedAtStr, &createdAtStr)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, domain.ErrSessionNotFound
		}
		return nil, fmt.Errorf("failed to get session by hash: %w", err)
	}

	s.ExpiresAt, _ = time.Parse(time.RFC3339, expiresAtStr)
	s.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
	if revokedAtStr.Valid {
		t, _ := time.Parse(time.RFC3339, revokedAtStr.String)
		s.RevokedAt = &t
	}

	return &s, nil
}

func (r *AuthRepository) RevokeSession(ctx context.Context, sessionID string) error {
	nowStr := time.Now().UTC().Format(time.RFC3339)
	query := `UPDATE refresh_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`
	_, err := r.db.ExecContext(ctx, query, nowStr, sessionID)
	if err != nil {
		return fmt.Errorf("failed to revoke session: %w", err)
	}
	return nil
}

func (r *AuthRepository) RevokeAllUserSessions(ctx context.Context, userID string) error {
	nowStr := time.Now().UTC().Format(time.RFC3339)
	query := `UPDATE refresh_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`
	_, err := r.db.ExecContext(ctx, query, nowStr, userID)
	if err != nil {
		return fmt.Errorf("failed to revoke all user sessions: %w", err)
	}
	return nil
}

func (r *AuthRepository) RotateSession(ctx context.Context, oldSessionID string, newSession *domain.Session) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin tx for session rotation: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	nowStr := time.Now().UTC().Format(time.RFC3339)
	// Revoke old session
	_, err = tx.ExecContext(ctx, `UPDATE refresh_sessions SET revoked_at = ? WHERE id = ?`, nowStr, oldSessionID)
	if err != nil {
		return fmt.Errorf("failed to revoke old session: %w", err)
	}

	// Insert new session
	query := `
		INSERT INTO refresh_sessions (id, user_id, token_hash, expires_at, revoked_at, created_at)
		VALUES (?, ?, ?, ?, NULL, ?)
	`
	_, err = tx.ExecContext(ctx, query,
		newSession.ID,
		newSession.UserID,
		newSession.TokenHash,
		newSession.ExpiresAt.Format(time.RFC3339),
		newSession.CreatedAt.Format(time.RFC3339),
	)
	if err != nil {
		return fmt.Errorf("failed to insert rotated session: %w", err)
	}

	return tx.Commit()
}
