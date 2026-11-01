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
	if !h.otpSvc.IsEmailAllowed(email) {
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

func getReqID(c fiber.Ctx) string {
	if id, ok := c.Locals(string(logging.RequestIDKey)).(string); ok && id != "" {
		return id
	}
	return c.Get("X-Request-ID", "unknown")
}
