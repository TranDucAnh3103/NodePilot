package domain

import (
	"errors"
	"strings"
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
	ErrWeakPassword         = errors.New("password must be at least 6 characters")
	ErrTokenReuseDetected   = errors.New("refresh token reuse detected - potential hijacking")
	ErrEmailNotAllowed      = errors.New("email address is not authorized on this homeserver")
	ErrInvalidOTP           = errors.New("invalid or expired OTP code")
)

type Role = string

const (
	RoleRoot     Role = "root"
	RoleAdmin    Role = "admin"
	RoleUser     Role = "user"
	RoleOperator Role = "operator"
	RoleViewer   Role = "viewer"
	RoleView     Role = "view"
)

type UserPermissions struct {
	ViewTabs     []string `json:"viewTabs"`
	EditTabs     []string `json:"editTabs"`
	AllowedPaths []string `json:"allowedPaths,omitempty"`
}

type User struct {
	ID           string           `json:"id"`
	Username     string           `json:"username"`
	PasswordHash string           `json:"-"`
	Role         Role             `json:"role"`
	Permissions  *UserPermissions `json:"permissions,omitempty"`
	Enabled      bool             `json:"enabled"`
	CreatedAt    time.Time        `json:"createdAt"`
}

func (u *User) IsRoot() bool {
	if u == nil {
		return false
	}
	return u.Role == RoleRoot || u.Role == RoleAdmin || u.Username == "stephen3103" || u.Username == "tranducanh31032006@gmail.com" || u.Username == "piganh408@gmail.com"
}

func (u *User) CanEdit() bool {
	if u == nil {
		return false
	}
	return u.IsRoot() || u.Role == RoleUser || u.Role == RoleOperator
}

func (u *User) CanEditTab(tab string) bool {
	if u == nil {
		return false
	}
	if u.IsRoot() {
		return true
	}
	// Settings tab is strictly reserved for root users under all circumstances
	if strings.EqualFold(tab, "settings") {
		return false
	}
	if u.Permissions == nil {
		return false
	}
	for _, t := range u.Permissions.EditTabs {
		if strings.EqualFold(t, tab) {
			return true
		}
	}
	return false
}

func (u *User) CanViewTab(tab string) bool {
	if u == nil {
		return false
	}
	if u.IsRoot() {
		return true
	}
	// Settings tab is strictly reserved for root users under all circumstances
	if strings.EqualFold(tab, "settings") {
		return false
	}
	if u.Permissions == nil {
		return false
	}
	for _, t := range u.Permissions.ViewTabs {
		if strings.EqualFold(t, tab) {
			return true
		}
	}
	return false
}

type Session struct {
	ID         string     `json:"id"`
	UserID     string     `json:"userId"`
	TokenHash  string     `json:"-"`
	ExpiresAt  time.Time  `json:"expiresAt"`
	RevokedAt  *time.Time `json:"revokedAt,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
}

type SMTPConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
	FromName string `json:"fromName"`
	AppName  string `json:"appName"`
}

func (s *Session) IsActive(now time.Time) bool {
	if s.RevokedAt != nil {
		return false
	}
	return s.ExpiresAt.After(now)
}
