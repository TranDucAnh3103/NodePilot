package domain

import (
	"errors"
	"time"
)

var (
	ErrUserNotFound         = errors.New("user not found")
	ErrUserAlreadyExists    = errors.New("user already exists")
	ErrInvalidCredentials   = errors.New("invalid username or password")
	ErrUserDisabled         = errors.New("user account is disabled")
	ErrSessionNotFound      = errors.New("session not found")
	ErrSessionExpired       = errors.New("session has expired")
	ErrSessionRevoked       = errors.New("session has been revoked")
	ErrAdminAlreadyExists   = errors.New("initial admin has already been bootstrapped")
	ErrWeakPassword         = errors.New("password must be at least 8 characters")
	ErrTokenReuseDetected   = errors.New("refresh token reuse detected - potential hijacking")
)

const (
	RoleAdmin  = "admin"
	RoleViewer = "viewer"
)

type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"`
	Enabled      bool      `json:"enabled"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Session struct {
	ID         string     `json:"id"`
	UserID     string     `json:"userId"`
	TokenHash  string     `json:"-"`
	ExpiresAt  time.Time  `json:"expiresAt"`
	RevokedAt  *time.Time `json:"revokedAt,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
}

func (s *Session) IsActive(now time.Time) bool {
	if s.RevokedAt != nil {
		return false
	}
	return s.ExpiresAt.After(now)
}
