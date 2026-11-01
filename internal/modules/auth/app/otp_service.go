package app

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net/smtp"
	"os"
	"strings"
	"sync"
	"time"

	"hscc/internal/modules/auth/domain"
)

type OTPItem struct {
	Code      string
	ExpiresAt time.Time
	Attempts  int
}

type OTPConfig struct {
	Allowlist []string
	SMTPHost  string
	SMTPPort  int
	SMTPUser  string
	SMTPPass  string
	FromName  string
	AppName   string
}

type OTPService struct {
	mu        sync.RWMutex
	otps      map[string]*OTPItem
	allowlist map[string]bool
	cfg       OTPConfig
	authSvc   *AuthService
}

func NewOTPService(authSvc *AuthService) *OTPService {
	// Parse allowlist with default tranducanh31032006@gmail.com
	allowlistMap := map[string]bool{
		"tranducanh31032006@gmail.com": true,
	}

	rawAllowlist := os.Getenv("HSCC_AUTH_EMAIL_ALLOWLIST")
	if rawAllowlist != "" {
		for _, e := range strings.Split(rawAllowlist, ",") {
			e = strings.ToLower(strings.TrimSpace(e))
			if e != "" {
				allowlistMap[e] = true
			}
		}
	}

	smtpHost := os.Getenv("HSCC_SMTP_HOST")
	if smtpHost == "" {
		smtpHost = "smtp.gmail.com"
	}

	smtpUser := os.Getenv("HSCC_SMTP_USER")
	if smtpUser == "" {
		smtpUser = "tranducanh31032006@gmail.com"
	}

	smtpPass := os.Getenv("HSCC_SMTP_PASS")
	if smtpPass == "" {
		smtpPass = "obmfifcvenlomxvh"
	}

	fromName := os.Getenv("HSCC_SMTP_FROM_NAME")
	if fromName == "" {
		fromName = "stephen lab"
	}

	appName := os.Getenv("HSCC_SMTP_APP_NAME")
	if appName == "" {
		appName = "badminton"
	}

	return &OTPService{
		otps:      make(map[string]*OTPItem),
		allowlist: allowlistMap,
		cfg: OTPConfig{
			SMTPHost: smtpHost,
			SMTPPort: 587,
			SMTPUser: smtpUser,
			SMTPPass: smtpPass,
			FromName: fromName,
			AppName:  appName,
		},
		authSvc: authSvc,
	}
}

// IsEmailAllowed checks if the given email is in the authorized whitelist
func (s *OTPService) IsEmailAllowed(email string) bool {
	email = strings.ToLower(strings.TrimSpace(email))
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.allowlist[email]
}

// GenerateAndSendOTP creates a 6-digit OTP, stores it for 5 minutes, and delivers via Gmail SMTP
func (s *OTPService) GenerateAndSendOTP(ctx context.Context, email string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if !s.IsEmailAllowed(email) {
		return "", domain.ErrEmailNotAllowed
	}

	// Generate 6-digit random number
	num, err := rand.Int(rand.Reader, big.NewInt(900000))
	if err != nil {
		return "", fmt.Errorf("failed to generate secure random OTP: %w", err)
	}
	code := fmt.Sprintf("%06d", num.Int64()+100000)

	s.mu.Lock()
	s.otps[email] = &OTPItem{
		Code:      code,
		ExpiresAt: time.Now().Add(5 * time.Minute),
		Attempts:  0,
	}
	s.mu.Unlock()

	// Asynchronously or synchronously send via SMTP
	go s.deliverEmail(email, code)

	return code, nil
}

func (s *OTPService) deliverEmail(recipient, code string) {
	addr := fmt.Sprintf("%s:%d", s.cfg.SMTPHost, s.cfg.SMTPPort)
	auth := smtp.PlainAuth("", s.cfg.SMTPUser, s.cfg.SMTPPass, s.cfg.SMTPHost)

	subject := fmt.Sprintf("[%s] Ma xac thuc dang nhap NodePilot HSCC: %s", s.cfg.AppName, code)
	body := fmt.Sprintf("From: %s <%s>\r\n"+
		"To: %s\r\n"+
		"Subject: %s\r\n"+
		"MIME-Version: 1.0\r\n"+
		"Content-Type: text/plain; charset=UTF-8\r\n\r\n"+
		"Xin chao,\r\n\r\n"+
		"Ma xac thuc (OTP) dang nhap NodePilot Home Server Control Center cua ban la:\r\n\r\n"+
		"    %s\r\n\r\n"+
		"Ma co hieu luc trong 5 phut. Vui long khong chia se ma nay cho bat ky ai.\r\n\r\n"+
		"Tran trong,\r\n"+
		"%s\r\n", s.cfg.FromName, s.cfg.SMTPUser, recipient, subject, code, s.cfg.FromName)

	// Try sending via SMTP
	err := smtp.SendMail(addr, auth, s.cfg.SMTPUser, []string{recipient}, []byte(body))
	if err != nil {
		slog.Warn("SMTP send failed (bad credentials or network block); logging OTP fallback",
			slog.String("email", recipient),
			slog.String("otp_fallback", code),
			slog.String("error", err.Error()),
		)
		// Try port 465 SSL as fallback
		s.tryPort465(recipient, code, body)
		return
	}

	slog.Info("OTP email successfully sent", slog.String("recipient", recipient))
}

func (s *OTPService) tryPort465(recipient, code, body string) {
	tlsconfig := &tls.Config{ServerName: s.cfg.SMTPHost}
	conn, err := tls.Dial("tcp", fmt.Sprintf("%s:465", s.cfg.SMTPHost), tlsconfig)
	if err != nil {
		return
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, s.cfg.SMTPHost)
	if err != nil {
		return
	}
	defer client.Quit()

	auth := smtp.PlainAuth("", s.cfg.SMTPUser, s.cfg.SMTPPass, s.cfg.SMTPHost)
	if err = client.Auth(auth); err != nil {
		return
	}

	if err = client.Mail(s.cfg.SMTPUser); err != nil {
		return
	}
	if err = client.Rcpt(recipient); err != nil {
		return
	}

	w, err := client.Data()
	if err != nil {
		return
	}
	_, _ = w.Write([]byte(body))
	_ = w.Close()
	slog.Info("OTP email successfully sent via port 465 TLS", slog.String("recipient", recipient))
}

// VerifyOTP checks the OTP and logs in as the primary admin user (stephen3103)
func (s *OTPService) VerifyOTP(ctx context.Context, email, code string) (string, string, *domain.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	code = strings.TrimSpace(code)

	s.mu.Lock()
	item, exists := s.otps[email]
	if !exists {
		s.mu.Unlock()
		return "", "", nil, domain.ErrInvalidOTP
	}

	if time.Now().After(item.ExpiresAt) {
		delete(s.otps, email)
		s.mu.Unlock()
		return "", "", nil, domain.ErrInvalidOTP
	}

	if item.Attempts >= 5 {
		delete(s.otps, email)
		s.mu.Unlock()
		return "", "", nil, errors.New("quá nhiều lần nhập sai OTP, vui lòng gửi lại mã mới")
	}

	if item.Code != code {
		item.Attempts++
		s.mu.Unlock()
		return "", "", nil, domain.ErrInvalidOTP
	}

	// OTP matched: consume it immediately
	delete(s.otps, email)
	s.mu.Unlock()

	// Ensure stephen3103 admin exists and log in
	_ = s.authSvc.EnsureDefaultAdmin(ctx, "stephen3103", "310306")
	user, err := s.authSvc.repo.GetUserByUsername(ctx, "stephen3103")
	if err != nil {
		return "", "", nil, fmt.Errorf("failed to retrieve admin user: %w", err)
	}

	accessToken, refreshToken, err := s.authSvc.IssueTokensForUser(ctx, user)
	if err != nil {
		return "", "", nil, err
	}

	slog.Info("user successfully authenticated via Gmail OTP", slog.String("email", email), slog.String("user", user.Username))
	return accessToken, refreshToken, user, nil
}
