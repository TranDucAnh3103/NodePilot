package transport

import (
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"hscc/internal/modules/auth/app"
	"hscc/internal/modules/auth/domain"
	"hscc/internal/platform/config"
	"hscc/internal/platform/logging"
)

const RefreshCookieName = "hscc_refresh_token"

type AuthHandler struct {
	authSvc *app.AuthService
	otpSvc  *app.OTPService
	cfg     *config.Config
}

func NewAuthHandler(authSvc *app.AuthService, cfg *config.Config) *AuthHandler {
	return &AuthHandler{
		authSvc: authSvc,
		otpSvc:  app.NewOTPService(authSvc),
		cfg:     cfg,
	}
}

func (h *AuthHandler) getCookieSettings(c fiber.Ctx) (bool, string) {
	secure := false
	sameSite := "Strict"
	if h.cfg != nil {
		secure = h.cfg.CookieSecure
		sameSite = h.cfg.CookieSameSite
	}

	origin := c.Get("Origin")
	if origin != "" && (strings.Contains(origin, "vercel.app") || c.Protocol() == "https") {
		secure = true
		sameSite = "None"
	}

	return secure, sameSite
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type SendOTPRequest struct {
	Email string `json:"email"`
}

type VerifyOTPRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

func (h *AuthHandler) RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler) {
	authGroup := router.Group("/auth")
	authGroup.Post("/login", h.Login)
	authGroup.Get("/login", func(c fiber.Ctx) error {
		// Friendly redirect: if user navigates to /api/v1/auth/login in browser, redirect to Web UI root
		return c.Redirect().To("/")
	})
	authGroup.Post("/refresh", h.Refresh)
	authGroup.Post("/logout", h.Logout)
	authGroup.Post("/otp/send", h.SendOTP)
	authGroup.Post("/otp/verify", h.VerifyOTP)

	router.Get("/me", authMiddleware, h.Me)

	// User & Account Management (Admin only)
	authGroup.Get("/accounts", authMiddleware, h.ListAccounts)
	authGroup.Post("/accounts", authMiddleware, h.CreateAccount)
	authGroup.Put("/accounts/:id/role", authMiddleware, h.UpdateAccountRole)
	authGroup.Delete("/accounts/:id", authMiddleware, h.DeleteAccount)

	// Gmail Allowlist (Admin only)
	authGroup.Get("/otp/allowlist", authMiddleware, h.ListEmailAllowlist)
	authGroup.Post("/otp/allowlist", authMiddleware, h.AddEmailAllowlist)
	authGroup.Delete("/otp/allowlist/:email", authMiddleware, h.RemoveEmailAllowlist)

	// SMTP Configuration & Test (Admin only)
	authGroup.Get("/smtp/config", authMiddleware, h.GetSMTPConfig)
	authGroup.Put("/smtp/config", authMiddleware, h.UpdateSMTPConfig)
	authGroup.Post("/smtp/test", authMiddleware, h.TestSMTP)
}

func (h *AuthHandler) Login(c fiber.Ctx) error {
	var req LoginRequest
	if err := c.Bind().JSON(&req); err != nil || req.Username == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "Username and password are required"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	ctx := c.Context()
	accessToken, refreshToken, user, err := h.authSvc.Login(ctx, req.Username, req.Password)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidCredentials) || errors.Is(err, domain.ErrUserDisabled) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"data":  nil,
				"error": fiber.Map{"code": "AUTH_FAILED", "message": "Invalid username or password"},
				"meta":  fiber.Map{"requestId": getReqID(c)},
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INTERNAL_ERROR", "message": "Login failed"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	// Set HttpOnly, Secure, SameSite refresh cookie (auto-adapts for Vercel cross-origin)
	secure, sameSite := h.getCookieSettings(c)
	cookie := fiber.Cookie{
		Name:     RefreshCookieName,
		Value:    refreshToken,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
		HTTPOnly: true,
		Secure:   secure,
		SameSite: sameSite,
		Path:     "/api/v1/auth",
	}
	c.Cookie(&cookie)

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data": fiber.Map{
			"accessToken": accessToken,
			"user": fiber.Map{
				"id":       user.ID,
				"username": user.Username,
				"role":     user.Role,
			},
		},
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

func (h *AuthHandler) Refresh(c fiber.Ctx) error {
	refreshToken := c.Cookies(RefreshCookieName)
	if refreshToken == "" {
		// Fallback check authorization or JSON body
		type tokenReq struct {
			RefreshToken string `json:"refreshToken"`
		}
		var b tokenReq
		_ = c.Bind().JSON(&b)
		refreshToken = b.RefreshToken
	}

	if refreshToken == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "MISSING_TOKEN", "message": "Refresh token is missing"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	ctx := c.Context()
	newAccessToken, newRefreshToken, user, err := h.authSvc.Refresh(ctx, refreshToken)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "TOKEN_INVALID", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	// Set rotated cookie
	secure, sameSite := h.getCookieSettings(c)
	cookie := fiber.Cookie{
		Name:     RefreshCookieName,
		Value:    newRefreshToken,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
		HTTPOnly: true,
		Secure:   secure,
		SameSite: sameSite,
		Path:     "/api/v1/auth",
	}
	c.Cookie(&cookie)

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data": fiber.Map{
			"accessToken": newAccessToken,
			"user": fiber.Map{
				"id":       user.ID,
				"username": user.Username,
				"role":     user.Role,
			},
		},
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

func (h *AuthHandler) Logout(c fiber.Ctx) error {
	refreshToken := c.Cookies(RefreshCookieName)
	if refreshToken != "" {
		_ = h.authSvc.Logout(c.Context(), refreshToken)
	}

	// Clear cookie
	c.ClearCookie(RefreshCookieName)

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"success": true},
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

func (h *AuthHandler) SendOTP(c fiber.Ctx) error {
	var req SendOTPRequest
	if err := c.Bind().JSON(&req); err != nil || strings.TrimSpace(req.Email) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "Email is required"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if !h.otpSvc.IsEmailAllowed(c.Context(), email) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "EMAIL_NOT_ALLOWED", "message": "Email này không nằm trong danh sách được phép truy cập hệ thống."},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	code, err := h.otpSvc.GenerateAndSendOTP(c.Context(), email)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "OTP_SEND_FAILED", "message": "Không thể tạo mã xác thực: " + err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data": fiber.Map{
			"sent":    true,
			"message": "Mã xác thực (OTP) đã được gửi đến " + email,
			// Debug helper preview for dev
			"code": code,
		},
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

func (h *AuthHandler) VerifyOTP(c fiber.Ctx) error {
	var req VerifyOTPRequest
	if err := c.Bind().JSON(&req); err != nil || strings.TrimSpace(req.Email) == "" || strings.TrimSpace(req.Code) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "Email và mã OTP là bắt buộc"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	accessToken, refreshToken, user, err := h.otpSvc.VerifyOTP(c.Context(), req.Email, req.Code)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_OTP", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	secure, sameSite := h.getCookieSettings(c)
	cookie := fiber.Cookie{
		Name:     RefreshCookieName,
		Value:    refreshToken,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
		HTTPOnly: true,
		Secure:   secure,
		SameSite: sameSite,
		Path:     "/api/v1/auth",
	}
	c.Cookie(&cookie)

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data": fiber.Map{
			"accessToken": accessToken,
			"user": fiber.Map{
				"id":       user.ID,
				"username": user.Username,
				"role":     user.Role,
			},
		},
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

func (h *AuthHandler) Me(c fiber.Ctx) error {
	userID, _ := c.Locals("userId").(string)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "UNAUTHORIZED", "message": "Authentication required"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	user, err := h.authSvc.GetMe(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "USER_NOT_FOUND", "message": "User profile not found"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data": fiber.Map{
			"id":        user.ID,
			"username":  user.Username,
			"role":      user.Role,
			"createdAt": user.CreatedAt,
		},
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

func (h *AuthHandler) requireAdmin(c fiber.Ctx) error {
	role, _ := c.Locals("role").(string)
	if role != string(domain.RoleAdmin) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "FORBIDDEN", "message": "Chỉ quản trị viên (ADMIN) mới có quyền thực hiện thao tác này"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	return nil
}

func (h *AuthHandler) ListAccounts(c fiber.Ctx) error {
	users, err := h.authSvc.ListUsers(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INTERNAL_ERROR", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  users,
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

type CreateAccountRequest struct {
	Username string      `json:"username"`
	Password string      `json:"password"`
	Role     domain.Role `json:"role"`
}

func (h *AuthHandler) CreateAccount(c fiber.Ctx) error {
	if err := h.requireAdmin(c); err != nil {
		return err
	}
	var req CreateAccountRequest
	if err := c.Bind().JSON(&req); err != nil || strings.TrimSpace(req.Username) == "" || strings.TrimSpace(req.Password) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "Tên đăng nhập và mật khẩu không được để trống"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	user, err := h.authSvc.CreateUserWithRole(c.Context(), strings.TrimSpace(req.Username), req.Password, req.Role)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "CREATE_USER_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"data":  user,
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

type UpdateRoleRequest struct {
	Role domain.Role `json:"role"`
}

func (h *AuthHandler) UpdateAccountRole(c fiber.Ctx) error {
	if err := h.requireAdmin(c); err != nil {
		return err
	}
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "ID người dùng là bắt buộc"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	var req UpdateRoleRequest
	if err := c.Bind().JSON(&req); err != nil || req.Role == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "Role là bắt buộc"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	if err := h.authSvc.UpdateUserRole(c.Context(), id, req.Role); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "UPDATE_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"success": true},
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

func (h *AuthHandler) DeleteAccount(c fiber.Ctx) error {
	if err := h.requireAdmin(c); err != nil {
		return err
	}
	id := c.Params("id")
	currUserID, _ := c.Locals("userId").(string)
	if id == currUserID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "CANNOT_DELETE_SELF", "message": "Không thể xóa chính tài khoản bạn đang đăng nhập"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	if err := h.authSvc.DeleteUser(c.Context(), id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "DELETE_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"success": true},
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

func (h *AuthHandler) ListEmailAllowlist(c fiber.Ctx) error {
	list, err := h.authSvc.Repo().ListEmailAllowlist(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INTERNAL_ERROR", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  list,
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

func (h *AuthHandler) AddEmailAllowlist(c fiber.Ctx) error {
	if err := h.requireAdmin(c); err != nil {
		return err
	}
	var req struct {
		Email string `json:"email"`
	}
	if err := c.Bind().JSON(&req); err != nil || strings.TrimSpace(req.Email) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "Email không được để trống"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	cleanEmail := strings.ToLower(strings.TrimSpace(req.Email))
	if err := h.authSvc.Repo().AddEmailAllowlist(c.Context(), cleanEmail); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "ADD_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"email": cleanEmail, "success": true},
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

func (h *AuthHandler) RemoveEmailAllowlist(c fiber.Ctx) error {
	if err := h.requireAdmin(c); err != nil {
		return err
	}
	email := c.Params("email")
	if email == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "Email parameter is required"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	if err := h.authSvc.Repo().RemoveEmailAllowlist(c.Context(), email); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "REMOVE_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"email": email, "success": true},
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

func (h *AuthHandler) GetSMTPConfig(c fiber.Ctx) error {
	cfg, err := h.authSvc.Repo().GetSMTPConfig(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INTERNAL_ERROR", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data": fiber.Map{
			"host":     cfg.Host,
			"port":     cfg.Port,
			"username": cfg.Username,
			"password": "••••••••••••••••",
			"fromName": cfg.FromName,
			"appName":  cfg.AppName,
			"hasPass":  cfg.Password != "",
		},
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

func (h *AuthHandler) UpdateSMTPConfig(c fiber.Ctx) error {
	if err := h.requireAdmin(c); err != nil {
		return err
	}
	var req domain.SMTPConfig
	if err := c.Bind().JSON(&req); err != nil || req.Host == "" || req.Username == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "Host và Username là bắt buộc"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	if req.Port <= 0 {
		req.Port = 587
	}
	if req.Password == "" || strings.Contains(req.Password, "•••") {
		current, _ := h.authSvc.Repo().GetSMTPConfig(c.Context())
		if current != nil {
			req.Password = current.Password
		}
	}
	if err := h.authSvc.Repo().UpdateSMTPConfig(c.Context(), &req); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "UPDATE_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"success": true},
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

func (h *AuthHandler) TestSMTP(c fiber.Ctx) error {
	if err := h.requireAdmin(c); err != nil {
		return err
	}
	var req struct {
		TargetEmail string `json:"targetEmail"`
	}
	_ = c.Bind().JSON(&req)
	target := strings.TrimSpace(req.TargetEmail)

	if err := h.otpSvc.TestSMTPConnection(c.Context(), target); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "SMTP_TEST_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"success": true, "message": "Kết nối và gửi email kiểm tra thành công!"},
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

func getReqID(c fiber.Ctx) string {
	if id, ok := c.Locals(string(logging.RequestIDKey)).(string); ok && id != "" {
		return id
	}
	return c.Get("X-Request-ID", "unknown")
}
