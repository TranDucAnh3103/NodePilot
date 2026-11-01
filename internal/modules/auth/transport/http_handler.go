package transport

import (
	"errors"
	"time"

	"github.com/gofiber/fiber/v3"
	"hscc/internal/modules/auth/app"
	"hscc/internal/modules/auth/domain"
	"hscc/internal/platform/logging"
)

const RefreshCookieName = "hscc_refresh_token"

type AuthHandler struct {
	authSvc *app.AuthService
}

func NewAuthHandler(authSvc *app.AuthService) *AuthHandler {
	return &AuthHandler{authSvc: authSvc}
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (h *AuthHandler) RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler) {
	authGroup := router.Group("/auth")
	authGroup.Post("/login", h.Login)
	authGroup.Post("/refresh", h.Refresh)
	authGroup.Post("/logout", h.Logout)

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

	// Set HttpOnly, Secure, SameSite=Strict refresh cookie
	cookie := fiber.Cookie{
		Name:     RefreshCookieName,
		Value:    refreshToken,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
		HTTPOnly: true,
		Secure:   false, // Set to true behind Tailscale Serve HTTPS
		SameSite: "Strict",
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
	cookie := fiber.Cookie{
		Name:     RefreshCookieName,
		Value:    newRefreshToken,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
		HTTPOnly: true,
		Secure:   false,
		SameSite: "Strict",
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
