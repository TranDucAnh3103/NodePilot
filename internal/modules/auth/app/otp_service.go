package app

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net"
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
	SMTPHost string
	SMTPPort int
	SMTPUser string
	SMTPPass string
	FromName string
	AppName  string
}

type OTPService struct {
	mu      sync.RWMutex
	otps    map[string]*OTPItem
	authSvc *AuthService
}

func NewOTPService(authSvc *AuthService) *OTPService {
	return &OTPService{
		otps:    make(map[string]*OTPItem),
		authSvc: authSvc,
	}
}

// GetConfig returns the active SMTP configuration (from DB or env fallback)
func (s *OTPService) GetConfig(ctx context.Context) OTPConfig {
	cfg := OTPConfig{
		SMTPHost: "smtp.gmail.com",
		SMTPPort: 587,
		SMTPUser: "piganh408@gmail.com",
		SMTPPass: "agkdvggtiijyfmhb",
		FromName: "ELMS-Ekila-Academy",
		AppName:  "NodePilot HSCC",
	}

	if s.authSvc != nil && s.authSvc.repo != nil {
		c, err := s.authSvc.repo.GetSMTPConfig(ctx)
		if err == nil && c != nil && c.Host != "" && c.Username != "stevejohn0174@gmail.com" {
			cfg.SMTPHost = c.Host
			cfg.SMTPPort = c.Port
			cfg.SMTPUser = c.Username
			cfg.SMTPPass = c.Password
			cfg.FromName = c.FromName
			cfg.AppName = c.AppName
			return cfg
		}
	}

	// Environment overrides
	if host := os.Getenv("HSCC_SMTP_HOST"); host != "" {
		cfg.SMTPHost = host
	}
	if user := os.Getenv("HSCC_SMTP_USER"); user != "" {
		cfg.SMTPUser = user
	}
	if pass := os.Getenv("HSCC_SMTP_PASS"); pass != "" {
		cfg.SMTPPass = pass
	}
	if fn := os.Getenv("HSCC_SMTP_FROM_NAME"); fn != "" {
		cfg.FromName = fn
	}
	if an := os.Getenv("HSCC_SMTP_APP_NAME"); an != "" {
		cfg.AppName = an
	}

	return cfg
}

// IsEmailAllowed checks if the given email is in the authorized whitelist
func (s *OTPService) IsEmailAllowed(ctx context.Context, email string) bool {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return false
	}

	// Always allow designated system admins
	if email == "piganh408@gmail.com" || email == "tranducanh31032006@gmail.com" {
		return true
	}

	// Check if this email corresponds to a registered user
	if s.authSvc != nil && s.authSvc.repo != nil {
		if u, err := s.authSvc.repo.GetUserByUsername(ctx, email); err == nil && u != nil && u.Enabled {
			return true
		}
	}

	// Check DB allowlist if available
	if s.authSvc != nil && s.authSvc.repo != nil {
		emails, err := s.authSvc.repo.ListEmailAllowlist(ctx)
		if err == nil {
			for _, allowed := range emails {
				if strings.ToLower(strings.TrimSpace(allowed)) == email {
					return true
				}
			}
		}
	}

	// Environment fallback
	rawAllowlist := os.Getenv("HSCC_AUTH_EMAIL_ALLOWLIST")
	if rawAllowlist != "" {
		for _, e := range strings.Split(rawAllowlist, ",") {
			if strings.ToLower(strings.TrimSpace(e)) == email {
				return true
			}
		}
	}

	return false
}

// GenerateAndSendOTP creates a 6-digit OTP, stores it for 5 minutes, and delivers via Gmail SMTP
func (s *OTPService) GenerateAndSendOTP(ctx context.Context, email string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if !s.IsEmailAllowed(ctx, email) {
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

	cfg := s.GetConfig(ctx)
	// Asynchronously deliver email
	go s.deliverEmail(cfg, email, code)

	return code, nil
}

// TestSMTPConnection tests the active SMTP settings and delivers a test verification email
func (s *OTPService) TestSMTPConnection(ctx context.Context, recipient string) error {
	cfg := s.GetConfig(ctx)
	if recipient == "" {
		recipient = cfg.SMTPUser
	}
	return s.sendSMTPMail(cfg, recipient, "123456", true)
}

func (s *OTPService) deliverEmail(cfg OTPConfig, recipient, code string) {
	err := s.sendSMTPMail(cfg, recipient, code, false)
	if err != nil {
		slog.Warn("SMTP delivery encountered error; fallback OTP code logged",
			slog.String("email", recipient),
			slog.String("otp_fallback", code),
			slog.String("error", err.Error()),
		)
	} else {
		slog.Info("OTP email successfully delivered via SMTP",
			slog.String("recipient", recipient),
			slog.String("host", cfg.SMTPHost),
		)
	}
}

func (s *OTPService) sendSMTPMail(cfg OTPConfig, recipient, code string, isTest bool) error {
	subject := fmt.Sprintf("[%s] Mã xác thực đăng nhập NodePilot HSCC: %s", cfg.AppName, code)
	if isTest {
		subject = fmt.Sprintf("[%s] Thử nghiệm kết nối SMTP thành công", cfg.AppName)
	}

	htmlContent := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>%s</title>
</head>
<body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f8fafc;">
  <table width="100%%" border="0" cellspacing="0" cellpadding="0" style="background-color: #020617; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #1e293b; background: linear-gradient(180deg, rgba(79, 70, 229, 0.08) 0%%, rgba(15, 23, 42, 0) 100%%);">
              <div style="display: inline-block; padding: 10px 16px; background: rgba(79, 70, 229, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 12px; margin-bottom: 12px;">
                <span style="font-size: 20px; font-weight: 800; color: #818cf8; letter-spacing: -0.5px;">NodePilot HSCC</span>
              </div>
              <p style="margin: 0; font-size: 13px; color: #94a3b8; font-weight: 500;">Home Server Control Center • %s</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #e2e8f0; line-height: 1.6;">
                Xin chào <strong>%s</strong>,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                Hệ thống nhận được yêu cầu đăng nhập máy chủ Home Server Control Center từ ứng dụng <strong>%s</strong>. Dưới đây là mã xác thực OTP của bạn:
              </p>
              
              <!-- OTP Box -->
              <div style="background-color: #020617; border: 1px solid #312e81; border-radius: 14px; padding: 22px 16px; text-align: center; margin: 24px 0;">
                <div style="font-family: 'JetBrains Mono', 'Courier New', monospace; font-size: 38px; font-weight: 800; color: #818cf8; letter-spacing: 12px; text-shadow: 0 0 20px rgba(129, 140, 248, 0.4);">
                  %s
                </div>
                <p style="margin: 10px 0 0 0; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600;">
                  Mã có hiệu lực trong 5 phút
                </p>
              </div>

              <!-- Security Notice -->
              <div style="background-color: rgba(245, 158, 11, 0.08); border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 6px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 12px; color: #fcd34d; line-height: 1.5;">
                  <strong>Cảnh báo bảo mật:</strong> Tuyệt đối không cung cấp mã OTP này cho bất kỳ ai. Quản trị viên hệ thống không bao giờ yêu cầu cung cấp mã xác thực.
                </p>
              </div>

              <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.6;">
                Nếu bạn không thực hiện yêu cầu đăng nhập này, vui lòng bỏ qua thư này hoặc đăng nhập tài khoản Quản trị để kiểm tra Nhật ký Kiểm toán (Audit Log).
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #090d16; padding: 20px 32px; text-align: center; border-top: 1px solid #1e293b;">
              <p style="margin: 0; font-size: 11px; color: #475569;">
                NodePilot Home Server Control Center • Tự vận hành bảo mật đa tầng
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`, subject, cfg.FromName, recipient, cfg.AppName, code)

	boundary := "nodepilot_boundary_sep_hscc"
	rawMsg := fmt.Sprintf("From: %s <%s>\r\n"+
		"To: %s\r\n"+
		"Subject: =?UTF-8?B?%s?=\r\n"+
		"MIME-Version: 1.0\r\n"+
		"Content-Type: multipart/alternative; boundary=\"%s\"\r\n\r\n"+
		"--%s\r\n"+
		"Content-Type: text/plain; charset=UTF-8\r\n"+
		"Content-Transfer-Encoding: base64\r\n\r\n"+
		"%s\r\n\r\n"+
		"--%s\r\n"+
		"Content-Type: text/html; charset=UTF-8\r\n"+
		"Content-Transfer-Encoding: base64\r\n\r\n"+
		"%s\r\n\r\n"+
		"--%s--\r\n",
		cfg.FromName, cfg.SMTPUser,
		recipient,
		base64.StdEncoding.EncodeToString([]byte(subject)),
		boundary,
		boundary,
		base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("Mã OTP đăng nhập NodePilot HSCC của bạn là: %s (Hiệu lực trong 5 phút).", code))),
		boundary,
		base64.StdEncoding.EncodeToString([]byte(htmlContent)),
		boundary,
	)

	// Clean password of any spaces
	cleanPass := strings.ReplaceAll(cfg.SMTPPass, " ", "")

	// 1. Try STARTTLS port 587
	err587 := s.sendViaStartTLS(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cleanPass, recipient, rawMsg)
	if err587 == nil {
		return nil
	}

	// 2. Try SSL port 465
	err465 := s.sendViaSSL465(cfg.SMTPHost, 465, cfg.SMTPUser, cleanPass, recipient, rawMsg)
	if err465 == nil {
		return nil
	}

	return fmt.Errorf("cả cổng 587 (%v) và cổng 465 (%v) đều không thể gửi email", err587, err465)
}

func (s *OTPService) sendViaStartTLS(host string, port int, user, pass, recipient, msg string) error {
	addr := fmt.Sprintf("%s:%d", host, port)
	conn, err := net.DialTimeout("tcp", addr, 6*time.Second)
	if err != nil {
		return err
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return err
	}
	defer client.Quit()

	tlsConfig := &tls.Config{ServerName: host}
	if err = client.StartTLS(tlsConfig); err != nil {
		return err
	}

	auth := smtp.PlainAuth("", user, pass, host)
	if err = client.Auth(auth); err != nil {
		return err
	}

	if err = client.Mail(user); err != nil {
		return err
	}
	if err = client.Rcpt(recipient); err != nil {
		return err
	}

	w, err := client.Data()
	if err != nil {
		return err
	}
	if _, err = w.Write([]byte(msg)); err != nil {
		return err
	}
	return w.Close()
}

func (s *OTPService) sendViaSSL465(host string, port int, user, pass, recipient, msg string) error {
	addr := fmt.Sprintf("%s:%d", host, port)
	tlsConfig := &tls.Config{ServerName: host}
	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 6 * time.Second}, "tcp", addr, tlsConfig)
	if err != nil {
		return err
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return err
	}
	defer client.Quit()

	auth := smtp.PlainAuth("", user, pass, host)
	if err = client.Auth(auth); err != nil {
		return err
	}

	if err = client.Mail(user); err != nil {
		return err
	}
	if err = client.Rcpt(recipient); err != nil {
		return err
	}

	w, err := client.Data()
	if err != nil {
		return err
	}
	if _, err = w.Write([]byte(msg)); err != nil {
		return err
	}
	return w.Close()
}

// VerifyOTP validates the code entered by the user
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

	// Authenticate target user
	var targetUser *domain.User
	// 1. Check if user with username == email exists
	if u, err := s.authSvc.repo.GetUserByUsername(ctx, email); err == nil && u != nil && u.Enabled {
		targetUser = u
	} else {
		// Prefer root/admin users for admin emails
		targetUser, _ = s.authSvc.repo.GetUserByUsername(ctx, "root")
		if targetUser == nil {
			targetUser, _ = s.authSvc.repo.GetUserByUsername(ctx, "stephen3103")
		}
		if targetUser == nil {
			targetUser, _ = s.authSvc.repo.GetUserByUsername(ctx, "admin")
		}
	}

	if targetUser == nil {
		return "", "", nil, errors.New("tài khoản hệ thống chưa sẵn sàng")
	}

	accessToken, refreshToken, err := s.authSvc.IssueTokensForUser(ctx, targetUser)
	if err != nil {
		return "", "", nil, err
	}

	return accessToken, refreshToken, targetUser, nil
}
