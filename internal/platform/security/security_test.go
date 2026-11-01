package security

import (
	"testing"
	"time"
)

func TestArgon2PasswordHashAndVerify(t *testing.T) {
	password := "SecretAdminPassword123!"

	hash, err := HashPassword(password, DefaultArgon2Params)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}

	if hash == "" || len(hash) < 30 {
		t.Fatalf("unexpected hash output: %s", hash)
	}

	// Verify with correct password
	match, err := VerifyPassword(password, hash)
	if err != nil {
		t.Fatalf("VerifyPassword failed with error: %v", err)
	}
	if !match {
		t.Errorf("expected password to match hash")
	}

	// Verify with incorrect password
	match, err = VerifyPassword("WrongPassword!", hash)
	if err != nil {
		t.Fatalf("VerifyPassword failed: %v", err)
	}
	if match {
		t.Errorf("expected incorrect password to not match")
	}
}

func TestJWTManager(t *testing.T) {
	jwtMgr := NewJWTManager("super-secret-key-1234567890123456", 1*time.Minute)

	token, err := jwtMgr.GenerateAccessToken("user-1", "admin", "admin")
	if err != nil {
		t.Fatalf("GenerateAccessToken failed: %v", err)
	}

	claims, err := jwtMgr.ValidateAccessToken(token)
	if err != nil {
		t.Fatalf("ValidateAccessToken failed: %v", err)
	}

	if claims.UserID != "user-1" || claims.Username != "admin" || claims.Role != "admin" {
		t.Errorf("claims mismatch: %+v", claims)
	}

	// Test invalid token
	_, err = jwtMgr.ValidateAccessToken("invalid.token.string")
	if err == nil {
		t.Errorf("expected error for invalid token, got nil")
	}
}
