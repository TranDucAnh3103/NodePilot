package ws

import (
	"encoding/json"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"github.com/gofiber/contrib/v3/websocket"
	"github.com/gofiber/fiber/v3"
	"hscc/internal/modules/telemetry"
	"hscc/internal/platform/security"
)

type MetricsWSHandler struct {
	telemetrySvc   *telemetry.TelemetryService
	jwtManager     *security.JWTManager
	allowedOrigins []string
}

func NewMetricsWSHandler(
	telemetrySvc *telemetry.TelemetryService,
	jwtManager *security.JWTManager,
	allowedOrigins []string,
) *MetricsWSHandler {
	return &MetricsWSHandler{
		telemetrySvc:   telemetrySvc,
		jwtManager:     jwtManager,
		allowedOrigins: allowedOrigins,
	}
}

// UpgradeMiddleware validates Origin header and upgrade eligibility.
func (h *MetricsWSHandler) UpgradeMiddleware() fiber.Handler {
	return func(c fiber.Ctx) error {
		if !websocket.IsWebSocketUpgrade(c) {
			return fiber.ErrUpgradeRequired
		}

		origin := c.Get("Origin")
		if origin != "" && !h.isOriginAllowed(origin) {
			slog.Warn("rejected websocket handshake from disallowed origin", slog.String("origin", origin))
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"data":  nil,
				"error": fiber.Map{"code": "FORBIDDEN_ORIGIN", "message": "Origin not allowed"},
			})
		}

		return c.Next()
	}
}

func (h *MetricsWSHandler) isOriginAllowed(origin string) bool {
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	host := parsed.Host

	// Allow localhost / tailscale domain
	for _, allowed := range h.allowedOrigins {
		if strings.Contains(allowed, host) || strings.EqualFold(origin, allowed) {
			return true
		}
	}
	return false
}

type wsControlMsg struct {
	Type        string `json:"type"`
	AccessToken string `json:"accessToken,omitempty"`
}

// HandleWS executes the authenticated real-time stream.
func (h *MetricsWSHandler) HandleWS() fiber.Handler {
	return websocket.New(func(conn *websocket.Conn) {
		defer conn.Close()

		// 1. Auth First Message within 5 seconds (ADR-007)
		_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		_, msgBytes, err := conn.ReadMessage()
		if err != nil {
			slog.Warn("websocket closed: auth first message timeout", slog.String("err", err.Error()))
			return
		}

		var authMsg wsControlMsg
		if err := json.Unmarshal(msgBytes, &authMsg); err != nil || authMsg.Type != "auth" || authMsg.AccessToken == "" {
			_ = conn.WriteJSON(fiber.Map{
				"type":  "error",
				"code":  "AUTH_REQUIRED",
				"error": "First message must be {type: 'auth', accessToken: '...'}",
			})
			return
		}

		claims, err := h.jwtManager.ValidateAccessToken(authMsg.AccessToken)
		if err != nil {
			_ = conn.WriteJSON(fiber.Map{
				"type":  "error",
				"code":  "TOKEN_INVALID",
				"error": "Invalid or expired access token",
			})
			return
		}

		// Auth success
		_ = conn.WriteJSON(fiber.Map{
			"type":           "auth.ok",
			"serverTime":     time.Now().UTC(),
			"streamInterval": 3,
			"user":           claims.Username,
			"role":           claims.Role,
		})

		// Reset deadline for normal streaming & heartbeat
		_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		conn.SetPongHandler(func(string) error {
			_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
			return nil
		})

		// 2. Subscribe to Telemetry Stream
		subCh, err := h.telemetrySvc.Subscribe()
		if err != nil {
			_ = conn.WriteJSON(fiber.Map{
				"type":  "error",
				"code":  "MAX_CLIENTS_REACHED",
				"error": err.Error(),
			})
			return
		}
		defer h.telemetrySvc.Unsubscribe(subCh)

		// Goroutine to handle client disconnection & ping responses
		closeCh := make(chan struct{})
		go func() {
			defer close(closeCh)
			for {
				if _, _, err := conn.ReadMessage(); err != nil {
					return
				}
			}
		}()

		pingTicker := time.NewTicker(30 * time.Second)
		defer pingTicker.Stop()

		for {
			select {
			case <-closeCh:
				return
			case <-pingTicker.C:
				_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			case snap, ok := <-subCh:
				if !ok {
					return
				}
				_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
				err := conn.WriteJSON(fiber.Map{
					"type":       "metrics.snapshot",
					"capturedAt": snap.CapturedAt,
					"payload":    snap,
				})
				if err != nil {
					return
				}
			}
		}
	}, websocket.Config{
		ReadBufferSize:  16 * 1024,
		WriteBufferSize: 16 * 1024,
	})
}
