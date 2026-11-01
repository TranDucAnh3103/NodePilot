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

func (r *AuthRepository) UpdatePassword(ctx context.Context, username, newHash string) error {
	query := `UPDATE users SET password_hash = ? WHERE username = ?`
	res, err := r.db.ExecContext(ctx, query, newHash, username)
	if err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return domain.ErrUserNotFound
	}
	return nil
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

func (r *AuthRepository) InitAuthTables(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS auth_email_allowlist (
			email TEXT PRIMARY KEY,
			created_at TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS smtp_config (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			host TEXT,
			port INTEGER,
			username TEXT,
			password TEXT,
			from_name TEXT,
			app_name TEXT,
			updated_at TIMESTAMP
		);
		INSERT OR IGNORE INTO auth_email_allowlist (email, created_at)
		VALUES ('tranducanh31032006@gmail.com', CURRENT_TIMESTAMP);
		INSERT OR IGNORE INTO smtp_config (id, host, port, username, password, from_name, app_name, updated_at)
		VALUES (1, 'smtp.gmail.com', 587, 'tranducanh31032006@gmail.com', 'obmfifcvenlomxvh', 'stephen lab', 'badminton', CURRENT_TIMESTAMP);
	`)
	return err
}

func (r *AuthRepository) ListUsers(ctx context.Context) ([]*domain.User, error) {
	query := `SELECT id, username, password_hash, role, enabled, created_at FROM users ORDER BY created_at ASC`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query users: %w", err)
	}
	defer rows.Close()

	var users []*domain.User
	for rows.Next() {
		var u domain.User
		var enabledInt int
		var createdAtStr string
		if err := rows.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &enabledInt, &createdAtStr); err != nil {
			return nil, err
		}
		u.Enabled = enabledInt == 1
		u.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
		users = append(users, &u)
	}
	return users, nil
}

func (r *AuthRepository) UpdateUserRole(ctx context.Context, id string, role domain.Role) error {
	query := `UPDATE users SET role = ? WHERE id = ?`
	_, err := r.db.ExecContext(ctx, query, string(role), id)
	return err
}

func (r *AuthRepository) DeleteUser(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, id)
	return err
}

func (r *AuthRepository) ListEmailAllowlist(ctx context.Context) ([]string, error) {
	_ = r.InitAuthTables(ctx)
	rows, err := r.db.QueryContext(ctx, `SELECT email FROM auth_email_allowlist ORDER BY email ASC`)
	if err != nil {
		return []string{"tranducanh31032006@gmail.com"}, nil
	}
	defer rows.Close()

	var emails []string
	for rows.Next() {
		var em string
		if err := rows.Scan(&em); err == nil && em != "" {
			emails = append(emails, em)
		}
	}
	if len(emails) == 0 {
		emails = append(emails, "tranducanh31032006@gmail.com")
	}
	return emails, nil
}

func (r *AuthRepository) AddEmailAllowlist(ctx context.Context, email string) error {
	_ = r.InitAuthTables(ctx)
	_, err := r.db.ExecContext(ctx, `INSERT OR REPLACE INTO auth_email_allowlist (email, created_at) VALUES (?, CURRENT_TIMESTAMP)`, email)
	return err
}

func (r *AuthRepository) RemoveEmailAllowlist(ctx context.Context, email string) error {
	_ = r.InitAuthTables(ctx)
	_, err := r.db.ExecContext(ctx, `DELETE FROM auth_email_allowlist WHERE email = ?`, email)
	return err
}

func (r *AuthRepository) GetSMTPConfig(ctx context.Context) (*domain.SMTPConfig, error) {
	_ = r.InitAuthTables(ctx)
	var rec domain.SMTPConfig
	err := r.db.QueryRowContext(ctx, `SELECT host, port, username, password, from_name, app_name FROM smtp_config WHERE id = 1`).
		Scan(&rec.Host, &rec.Port, &rec.Username, &rec.Password, &rec.FromName, &rec.AppName)
	if err != nil {
		return &domain.SMTPConfig{
			Host:     "smtp.gmail.com",
			Port:     587,
			Username: "tranducanh31032006@gmail.com",
			Password: "obmfifcvenlomxvh",
			FromName: "stephen lab",
			AppName:  "badminton",
		}, nil
	}
	return &rec, nil
}

func (r *AuthRepository) UpdateSMTPConfig(ctx context.Context, cfg *domain.SMTPConfig) error {
	_ = r.InitAuthTables(ctx)
	query := `INSERT OR REPLACE INTO smtp_config (id, host, port, username, password, from_name, app_name, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
	_, err := r.db.ExecContext(ctx, query, cfg.Host, cfg.Port, cfg.Username, cfg.Password, cfg.FromName, cfg.AppName)
	return err
}
