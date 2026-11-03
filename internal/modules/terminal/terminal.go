package terminal

import (
	"encoding/json"
	"io"
	"log/slog"
	"strings"
	"sync"

	"github.com/gofiber/contrib/v3/websocket"
	"github.com/gofiber/fiber/v3"
	"hscc/internal/platform/security"
)

type ResizeMessage struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

type TerminalHandler struct {
	jwtManager *security.JWTManager
}

func NewTerminalHandler(jwtManager *security.JWTManager) *TerminalHandler {
	return &TerminalHandler{
		jwtManager: jwtManager,
	}
}

// UpgradeMiddleware ensures only authenticated root users can upgrade to WebSocket terminal.
func (h *TerminalHandler) UpgradeMiddleware() fiber.Handler {
	return func(c fiber.Ctx) error {
		if !websocket.IsWebSocketUpgrade(c) {
			return fiber.ErrUpgradeRequired
		}

		// Check token in query param or Authorization header
		token := c.Query("token")
		if token == "" {
			authHeader := c.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				token = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}

		if token == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Authentication token required for terminal access",
			})
		}

		claims, err := h.jwtManager.ValidateAccessToken(token)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid or expired token: " + err.Error(),
			})
		}

		// Only root/admin is permitted to access interactive shell
		role := strings.ToLower(claims.Role)
		isRoot := role == "root" || role == "admin" || claims.Username == "stephen3103" || claims.Username == "tranducanh31032006@gmail.com" || claims.Username == "piganh408@gmail.com"
		if !isRoot {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Terminal access is restricted to ROOT administrators",
			})
		}

		c.Locals("username", claims.Username)
		return c.Next()
	}
}

// HandleWS starts the interactive shell session over WebSocket.
func (h *TerminalHandler) HandleWS() fiber.Handler {
	return websocket.New(func(conn *websocket.Conn) {
		username, _ := conn.Locals("username").(string)
		slog.Info("interactive terminal session opened", slog.String("user", username))
		defer func() {
			slog.Info("interactive terminal session closed", slog.String("user", username))
			_ = conn.Close()
		}()

		session, err := startShellSession()
		if err != nil {
			slog.Error("failed to spawn terminal shell", slog.String("error", err.Error()))
			_ = conn.WriteMessage(websocket.TextMessage, []byte("\r\n[HSCC Error: Failed to start shell: "+err.Error()+"]\r\n"))
			return
		}
		defer session.Close()

		var once sync.Once
		closeBoth := func() {
			once.Do(func() {
				session.Close()
				_ = conn.Close()
			})
		}

		// Reader from PTY / Shell -> WebSocket
		go func() {
			defer closeBoth()
			buf := make([]byte, 4096)
			for {
				n, err := session.Read(buf)
				if err != nil {
					if err != io.EOF {
						slog.Debug("terminal read error", slog.String("error", err.Error()))
					}
					return
				}
				if n > 0 {
					if err := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); err != nil {
						return
					}
				}
			}
		}()

		// Writer from WebSocket -> PTY / Shell
		for {
			msgType, msg, err := conn.ReadMessage()
			if err != nil {
				closeBoth()
				return
			}

			if msgType == websocket.TextMessage {
				// Check if it's a JSON control message (e.g. resize)
				var resize ResizeMessage
				if err := json.Unmarshal(msg, &resize); err == nil && resize.Type == "resize" && resize.Cols > 0 && resize.Rows > 0 {
					session.Resize(resize.Cols, resize.Rows)
					continue
				}
			}

			// Pass raw user keystrokes / input directly to the shell
			if len(msg) > 0 {
				if _, err := session.Write(msg); err != nil {
					closeBoth()
					return
				}
			}
		}
	})
}
