package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"
	"hscc/internal/modules/auth/domain"
	"hscc/internal/platform/security"
)

type AuthService struct {
	repo       AuthRepo
	jwtManager *security.JWTManager
}

type AuthRepo interface {
	CountAdmins(ctx context.Context) (int, error)
	CreateUser(ctx context.Context, u *domain.User) error
	GetUserByUsername(ctx context.Context, username string) (*domain.User, error)
	GetUserByID(ctx context.Context, id string) (*domain.User, error)
	UpdatePassword(ctx context.Context, username, newHash string) error
	UpdatePasswordByID(ctx context.Context, id, newHash string) error
	CreateSession(ctx context.Context, s *domain.Session) error
	GetSessionByTokenHash(ctx context.Context, hash string) (*domain.Session, error)
	RevokeSession(ctx context.Context, sessionID string) error
	RevokeAllUserSessions(ctx context.Context, userID string) error
	RotateSession(ctx context.Context, oldSessionID string, newSession *domain.Session) error
	ListUsers(ctx context.Context) ([]*domain.User, error)
	UpdateUserRole(ctx context.Context, id string, role domain.Role) error
	UpdateUserPermissions(ctx context.Context, id string, perms *domain.UserPermissions) error
	DeleteUser(ctx context.Context, id string) error
	ListEmailAllowlist(ctx context.Context) ([]string, error)
	AddEmailAllowlist(ctx context.Context, email string) error
	RemoveEmailAllowlist(ctx context.Context, email string) error
	GetSMTPConfig(ctx context.Context) (*domain.SMTPConfig, error)
	UpdateSMTPConfig(ctx context.Context, cfg *domain.SMTPConfig) error
}

func NewAuthService(repo AuthRepo, jwtManager *security.JWTManager) *AuthService {
	return &AuthService{
		repo:       repo,
		jwtManager: jwtManager,
	}
}

func (s *AuthService) Repo() AuthRepo {
	return s.repo
}

// Bootstrap initializes the primary administrator via local CLI only.
func (s *AuthService) Bootstrap(ctx context.Context, username, password string) (*domain.User, error) {
	if len(password) < 6 {
		return nil, domain.ErrWeakPassword
	}

	adminCount, err := s.repo.CountAdmins(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to check existing admins: %w", err)
	}
	if adminCount > 0 {
		return nil, domain.ErrAdminAlreadyExists
	}

	hash, err := security.HashPassword(password, security.DefaultArgon2Params)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	user := &domain.User{
		ID:           uuid.NewString(),
		Username:     username,
		PasswordHash: hash,
		Role:         domain.RoleAdmin,
		Enabled:      true,
		CreatedAt:    time.Now().UTC(),
	}

	if err := s.repo.CreateUser(ctx, user); err != nil {
		return nil, fmt.Errorf("failed to persist bootstrap admin: %w", err)
	}

	return user, nil
}

// EnsureDefaultAdmin guarantees that a given admin user exists with the desired password.
func (s *AuthService) EnsureDefaultAdmin(ctx context.Context, username, password string) error {
	hash, err := security.HashPassword(password, security.DefaultArgon2Params)
	if err != nil {
		return err
	}

	u, err := s.repo.GetUserByUsername(ctx, username)
	if err == nil && u != nil {
		return s.repo.UpdatePassword(ctx, username, hash)
	}

	newUser := &domain.User{
		ID:           uuid.NewString(),
		Username:     username,
		PasswordHash: hash,
		Role:         domain.RoleAdmin,
		Enabled:      true,
		CreatedAt:    time.Now().UTC(),
	}
	return s.repo.CreateUser(ctx, newUser)
}

// ListUsers returns all registered users in the database.
func (s *AuthService) ListUsers(ctx context.Context) ([]*domain.User, error) {
	return s.repo.ListUsers(ctx)
}

// CreateUserWithRole registers a new user with an explicit role and optional custom tab permissions.
func (s *AuthService) CreateUserWithRole(ctx context.Context, username, password string, role domain.Role, perms *domain.UserPermissions) (*domain.User, error) {
	if len(password) < 6 {
		return nil, domain.ErrWeakPassword
	}
	if role != domain.RoleRoot && role != domain.RoleAdmin && role != domain.RoleUser && role != domain.RoleOperator && role != domain.RoleViewer && role != domain.RoleView {
		role = domain.RoleView
	}

	existing, _ := s.repo.GetUserByUsername(ctx, username)
	if existing != nil {
		return nil, fmt.Errorf("tài khoản '%s' đã tồn tại", username)
	}

	hash, err := security.HashPassword(password, security.DefaultArgon2Params)
	if err != nil {
		return nil, fmt.Errorf("lỗi băm mật khẩu: %w", err)
	}

	user := &domain.User{
		ID:           uuid.NewString(),
		Username:     username,
		PasswordHash: hash,
		Role:         role,
		Permissions:  perms,
		Enabled:      true,
		CreatedAt:    time.Now().UTC(),
	}

	if err := s.repo.CreateUser(ctx, user); err != nil {
		return nil, err
	}
	return user, nil
}

// UpdateUserRole updates an existing user's role.
func (s *AuthService) UpdateUserRole(ctx context.Context, id string, role domain.Role) error {
	return s.repo.UpdateUserRole(ctx, id, role)
}

// UpdateUserPermissions updates custom tab permissions for a non-root user.
func (s *AuthService) UpdateUserPermissions(ctx context.Context, id string, perms *domain.UserPermissions) error {
	return s.repo.UpdateUserPermissions(ctx, id, perms)
}

// DeleteUser removes a user and their sessions.
func (s *AuthService) DeleteUser(ctx context.Context, id string) error {
	_ = s.repo.RevokeAllUserSessions(ctx, id)
	return s.repo.DeleteUser(ctx, id)
}

// ResetPassword allows administrators to reset a user's password.
func (s *AuthService) ResetPassword(ctx context.Context, username, newPassword string) error {
	if len(newPassword) < 6 {
		return domain.ErrWeakPassword
	}

	user, err := s.repo.GetUserByUsername(ctx, username)
	if err != nil {
		return domain.ErrUserNotFound
	}

	hash, err := security.HashPassword(newPassword, security.DefaultArgon2Params)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	if err := s.repo.UpdatePassword(ctx, user.Username, hash); err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}

	// Revoke all existing sessions to enforce re-login
	_ = s.repo.RevokeAllUserSessions(ctx, user.ID)

	return nil
}

// ResetPasswordByID allows administrators to reset a user's password by ID.
func (s *AuthService) ResetPasswordByID(ctx context.Context, id, newPassword string) error {
	if len(newPassword) < 6 {
		return domain.ErrWeakPassword
	}

	hash, err := security.HashPassword(newPassword, security.DefaultArgon2Params)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	if err := s.repo.UpdatePasswordByID(ctx, id, hash); err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}

	_ = s.repo.RevokeAllUserSessions(ctx, id)
	return nil
}

// Login authenticates credentials, returns an access JWT and a newly issued refresh token.
func (s *AuthService) Login(ctx context.Context, username, password string) (string, string, *domain.User, error) {
	user, err := s.repo.GetUserByUsername(ctx, username)
	if err != nil {
		return "", "", nil, domain.ErrInvalidCredentials
	}

	if !user.Enabled {
		return "", "", nil, domain.ErrUserDisabled
	}

	match, err := security.VerifyPassword(password, user.PasswordHash)
	if err != nil || !match {
		return "", "", nil, domain.ErrInvalidCredentials
	}

	accessToken, err := s.jwtManager.GenerateAccessToken(user.ID, user.Username, user.Role)
	if err != nil {
		return "", "", nil, fmt.Errorf("failed to generate access token: %w", err)
	}

	rawRefreshToken, session, err := s.createSession(user.ID)
	if err != nil {
		return "", "", nil, err
	}

	if err := s.repo.CreateSession(ctx, session); err != nil {
		return "", "", nil, fmt.Errorf("failed to save refresh session: %w", err)
	}

	return accessToken, rawRefreshToken, user, nil
}

// Refresh handles token rotation and detects session hijacking.
func (s *AuthService) Refresh(ctx context.Context, rawRefreshToken string) (string, string, *domain.User, error) {
	tokenHash := hashToken(rawRefreshToken)
	session, err := s.repo.GetSessionByTokenHash(ctx, tokenHash)
	if err != nil {
		return "", "", nil, domain.ErrSessionNotFound
	}

	// Token reuse detection: if a previously revoked token is presented, compromise is suspected!
	if session.RevokedAt != nil {
		_ = s.repo.RevokeAllUserSessions(ctx, session.UserID)
		return "", "", nil, domain.ErrTokenReuseDetected
	}

	now := time.Now().UTC()
	if session.ExpiresAt.Before(now) {
		return "", "", nil, domain.ErrSessionExpired
	}

	user, err := s.repo.GetUserByID(ctx, session.UserID)
	if err != nil || !user.Enabled {
		return "", "", nil, domain.ErrUserDisabled
	}

	accessToken, err := s.jwtManager.GenerateAccessToken(user.ID, user.Username, user.Role)
	if err != nil {
		return "", "", nil, fmt.Errorf("failed to generate new access token: %w", err)
	}

	newRawRefreshToken, newSession, err := s.createSession(user.ID)
	if err != nil {
		return "", "", nil, err
	}

	if err := s.repo.RotateSession(ctx, session.ID, newSession); err != nil {
		return "", "", nil, fmt.Errorf("failed to rotate refresh session: %w", err)
	}

	return accessToken, newRawRefreshToken, user, nil
}

// Logout revokes the active session.
func (s *AuthService) Logout(ctx context.Context, rawRefreshToken string) error {
	tokenHash := hashToken(rawRefreshToken)
	session, err := s.repo.GetSessionByTokenHash(ctx, tokenHash)
	if err != nil {
		return nil // idempotent logout
	}
	return s.repo.RevokeSession(ctx, session.ID)
}

// GetMe retrieves current user information.
func (s *AuthService) GetMe(ctx context.Context, userID string) (*domain.User, error) {
	return s.repo.GetUserByID(ctx, userID)
}

// IssueTokensForUser issues access token and persistent refresh session for a user.
func (s *AuthService) IssueTokensForUser(ctx context.Context, user *domain.User) (string, string, error) {
	accessToken, err := s.jwtManager.GenerateAccessToken(user.ID, user.Username, user.Role)
	if err != nil {
		return "", "", fmt.Errorf("failed to generate access token: %w", err)
	}

	refreshToken, session, err := s.createSession(user.ID)
	if err != nil {
		return "", "", fmt.Errorf("failed to create refresh session: %w", err)
	}

	if err := s.repo.CreateSession(ctx, session); err != nil {
		return "", "", fmt.Errorf("failed to save refresh session: %w", err)
	}

	return accessToken, refreshToken, nil
}

func (s *AuthService) createSession(userID string) (string, *domain.Session, error) {
	rawBytes := make([]byte, 32)
	if _, err := rand.Read(rawBytes); err != nil {
		return "", nil, fmt.Errorf("failed to generate random token: %w", err)
	}
	rawToken := hex.EncodeToString(rawBytes)
	tokenHash := hashToken(rawToken)

	now := time.Now().UTC()
	session := &domain.Session{
		ID:        uuid.NewString(),
		UserID:    userID,
		TokenHash: tokenHash,
		ExpiresAt: now.Add(7 * 24 * time.Hour), // 7 days refresh token validity
		CreatedAt: now,
	}

	return rawToken, session, nil
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
