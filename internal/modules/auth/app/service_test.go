package app

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"hscc/internal/modules/auth/domain"
	"hscc/internal/modules/auth/infra"
	"hscc/internal/platform/security"
	"hscc/internal/platform/sqlite"
)

func setupTestDB(t *testing.T) (*sqlite.DB, func()) {
	tmpDir, err := os.MkdirTemp("", "hscc_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}

	dbPath := filepath.Join(tmpDir, "test.db")
	db, err := sqlite.Open(dbPath)
	if err != nil {
		_ = os.RemoveAll(tmpDir)
		t.Fatalf("failed to open sqlite test db: %v", err)
	}

	ctx := context.Background()
	// Run migrations
	migrationsDir := filepath.Join("..", "..", "..", "..", "db", "migrations")
	if err := db.Migrate(ctx, migrationsDir); err != nil {
		_ = db.Close()
		_ = os.RemoveAll(tmpDir)
		t.Fatalf("failed to run migrations: %v", err)
	}

	cleanup := func() {
		_ = db.Close()
		_ = os.RemoveAll(tmpDir)
	}

	return db, cleanup
}

func TestAuthService_FullLifecycle(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	repo := infra.NewAuthRepository(db)
	jwtMgr := security.NewJWTManager("test-secret-key-at-least-32-bytes-long!", 10*time.Minute)
	authSvc := NewAuthService(repo, jwtMgr)

	// 1. Test Bootstrap
	admin, err := authSvc.Bootstrap(ctx, "admin", "SecureAdminPass123!")
	if err != nil {
		t.Fatalf("Bootstrap failed: %v", err)
	}
	if admin.Username != "admin" || admin.Role != domain.RoleAdmin {
		t.Errorf("unexpected admin created: %+v", admin)
	}

	// 2. Test Second Bootstrap Must Fail
	_, err = authSvc.Bootstrap(ctx, "admin2", "AnotherSecurePass123!")
	if err != domain.ErrAdminAlreadyExists {
		t.Errorf("expected ErrAdminAlreadyExists, got %v", err)
	}

	// 3. Test Login Success
	accessToken, refreshToken, user, err := authSvc.Login(ctx, "admin", "SecureAdminPass123!")
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}
	if accessToken == "" || refreshToken == "" || user.ID != admin.ID {
		t.Errorf("invalid login response: token=%s, user=%+v", accessToken, user)
	}

	// 4. Test Login Bad Password
	_, _, _, err = authSvc.Login(ctx, "admin", "WrongPassword!")
	if err != domain.ErrInvalidCredentials {
		t.Errorf("expected ErrInvalidCredentials, got %v", err)
	}

	// 5. Test Refresh Token Rotation
	newAccessToken, newRefreshToken, refreshUser, err := authSvc.Refresh(ctx, refreshToken)
	if err != nil {
		t.Fatalf("Refresh failed: %v", err)
	}
	if newAccessToken == "" || newRefreshToken == "" || newRefreshToken == refreshToken {
		t.Errorf("refresh token was not properly rotated: old=%s, new=%s", refreshToken, newRefreshToken)
	}
	if refreshUser.ID != admin.ID {
		t.Errorf("user mismatch in refresh: %+v", refreshUser)
	}

	// 6. Test Token Reuse Attack Detection (Reusing old refreshToken)
	_, _, _, err = authSvc.Refresh(ctx, refreshToken)
	if err != domain.ErrTokenReuseDetected {
		t.Errorf("expected ErrTokenReuseDetected when presenting revoked token, got %v", err)
	}

	// 7. Verify all sessions were revoked as consequence of reuse detection
	_, _, _, err = authSvc.Refresh(ctx, newRefreshToken)
	if err != domain.ErrTokenReuseDetected {
		t.Errorf("expected all tokens to be revoked, got %v", err)
	}

	// 8. Test Clean Login & Logout
	_, freshRefresh, _, err := authSvc.Login(ctx, "admin", "SecureAdminPass123!")
	if err != nil {
		t.Fatalf("re-login failed: %v", err)
	}

	if err := authSvc.Logout(ctx, freshRefresh); err != nil {
		t.Fatalf("Logout failed: %v", err)
	}

	// Attempting to refresh after logout should fail with reuse detection
	_, _, _, err = authSvc.Refresh(ctx, freshRefresh)
	if err != domain.ErrTokenReuseDetected {
		t.Errorf("expected revoked session error after logout, got %v", err)
	}
}
