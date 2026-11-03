package http

import (
	"context"
	"fmt"
	"io/fs"
	"log/slog"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/gofiber/fiber/v3/middleware/static"
	"github.com/google/uuid"
	"hscc/internal/modules/alerts"
	auditApp "hscc/internal/modules/audit/app"
	auditTransport "hscc/internal/modules/audit/transport"
	authApp "hscc/internal/modules/auth/app"
	authTransport "hscc/internal/modules/auth/transport"
	filesApp "hscc/internal/modules/files/app"
	filesTransport "hscc/internal/modules/files/transport"
	"hscc/internal/modules/firewall"
	"hscc/internal/modules/nginx"
	systemInfra "hscc/internal/modules/system/infra"
	systemTransport "hscc/internal/modules/system/transport"
	tasksApp "hscc/internal/modules/tasks/app"
	tasksTransport "hscc/internal/modules/tasks/transport"
	"hscc/internal/modules/telemetry"
	"hscc/internal/modules/terminal"
	workloadApp "hscc/internal/modules/workloads/app"
	workloadTransport "hscc/internal/modules/workloads/transport"
	"hscc/internal/platform/config"
	"hscc/internal/platform/logging"
	"hscc/internal/platform/security"
	"hscc/internal/platform/sqlite"
	wsTransport "hscc/internal/transport/ws"
)

type Server struct {
	app           *fiber.App
	cfg           *config.Config
	db            *sqlite.DB
	telemetrySvc  *telemetry.TelemetryService
	jwtManager    *security.JWTManager
	authSvc       *authApp.AuthService
	auditSvc      *auditApp.AuditService
	workloadSvc   *workloadApp.WorkloadService
	taskSvc       *tasksApp.TaskService
	fileSvc       *filesApp.FileService
	historyStore  *telemetry.HistoryStore
	alertsEngine  *alerts.Engine
	procCollector *systemInfra.ProcessCollector
	webFS         fs.FS
}

func NewServer(
	cfg *config.Config,
	db *sqlite.DB,
	telemetrySvc *telemetry.TelemetryService,
	jwtManager *security.JWTManager,
	authSvc *authApp.AuthService,
	auditSvc *auditApp.AuditService,
	workloadSvc *workloadApp.WorkloadService,
	taskSvc *tasksApp.TaskService,
	fileSvc *filesApp.FileService,
	historyStore *telemetry.HistoryStore,
	alertsEngine *alerts.Engine,
	procCollector *systemInfra.ProcessCollector,
	webFS fs.FS,
) *Server {
	app := fiber.New(fiber.Config{
		AppName:      "Home Server Control Center",
		ServerHeader: "HSCC/1.0",
	})

	s := &Server{
		app:           app,
		cfg:           cfg,
		db:            db,
		telemetrySvc:  telemetrySvc,
		jwtManager:    jwtManager,
		authSvc:       authSvc,
		auditSvc:      auditSvc,
		workloadSvc:   workloadSvc,
		taskSvc:       taskSvc,
		fileSvc:       fileSvc,
		historyStore:  historyStore,
		alertsEngine:  alertsEngine,
		procCollector: procCollector,
		webFS:         webFS,
	}

	s.setupMiddlewares()
	s.setupRoutes()

	return s
}

func (s *Server) setupMiddlewares() {
	// 1. Recovery
	s.app.Use(recover.New())

	// 2. Request ID & Structured Logger Context
	s.app.Use(func(c fiber.Ctx) error {
		reqID := c.Get("X-Request-ID")
		if reqID == "" {
			reqID = uuid.NewString()
		}
		c.Set("X-Request-ID", reqID)
		c.Locals(string(logging.RequestIDKey), reqID)
		return c.Next()
	})

	// 3. CORS - Supports Vercel UI frontend & Localhost
	s.app.Use(cors.New(cors.Config{
		AllowOrigins:     s.cfg.AllowedOrigins,
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Request-ID", "Idempotency-Key"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowCredentials: true,
	}))
}

func (s *Server) setupRoutes() {
	// Auth middleware
	authMiddleware := func(c fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"data":  nil,
				"error": fiber.Map{"code": "AUTH_REQUIRED", "message": "Missing or invalid Authorization header"},
				"meta":  fiber.Map{"requestId": c.Locals(string(logging.RequestIDKey))},
			})
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		claims, err := s.jwtManager.ValidateAccessToken(tokenStr)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"data":  nil,
				"error": fiber.Map{"code": "INVALID_TOKEN", "message": err.Error()},
				"meta":  fiber.Map{"requestId": c.Locals(string(logging.RequestIDKey))},
			})
		}

		c.Locals("userId", claims.UserID)
		c.Locals("username", claims.Username)
		c.Locals("role", claims.Role)

		return c.Next()
	}

	api := s.app.Group("/api/v1")

	// Liveness & Readiness probes (FR-OPS-01)
	api.Get("/health/live", func(c fiber.Ctx) error {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"status": "alive",
			"time":   time.Now().UTC(),
		})
	})

	api.Get("/health/ready", func(c fiber.Ctx) error {
		if err := s.db.PingContext(context.Background()); err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"status": "degraded",
				"error":  "database unavailable",
			})
		}
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"status": "ready",
			"time":   time.Now().UTC(),
		})
	})

	// Register Auth Routes
	authH := authTransport.NewAuthHandler(s.authSvc, s.cfg)
	authH.RegisterRoutes(api, authMiddleware)

	// Register System Routes (History, Processes, Alerts, Power-status)
	updateSvc := systemInfra.NewUpdateService(s.cfg, s.db)
	sysH := systemTransport.NewSystemHandler(s.telemetrySvc, updateSvc, s.procCollector, s.historyStore, s.alertsEngine)
	sysH.RegisterRoutes(api, authMiddleware, s.requireEditTab("processes"))

	// Register Audit Routes (Immutable Audit Trail)
	if s.auditSvc != nil {
		auditH := auditTransport.NewAuditHandler(s.auditSvc)
		auditH.RegisterRoutes(api, authMiddleware)
	}

	// Register Workloads Routes (100% Docker & systemd Observability & Guardrail Execution)
	if s.workloadSvc != nil {
		workloadH := workloadTransport.NewWorkloadsHandler(s.workloadSvc)
		workloadH.RegisterRoutes(api, authMiddleware, s.requireEditTab("docker"), s.requireEditTab("services"))
	}

	// Register Tasks Routes (Preset Tasks & Safe SQLite Backup)
	if s.taskSvc != nil {
		tasksH := tasksTransport.NewTasksHandler(s.taskSvc)
		tasksH.RegisterRoutes(api, authMiddleware, s.requireEditTab("tasks"))
	}

	// Register Scoped File Manager Routes
	if s.fileSvc != nil {
		filesH := filesTransport.NewFilesHandler(s.fileSvc)
		filesH.RegisterRoutes(api, authMiddleware, s.requireEditTab("files"))
	}

	// Register Firewall (UFW) Routes
	firewallSvc := firewall.NewService()
	firewallH := firewall.NewHandler(firewallSvc, s.auditSvc)
	firewallH.RegisterRoutes(api, authMiddleware, s.requireEditTab("firewall"))

	// Register Web Server & Reverse Proxy (Nginx) Routes
	nginxSvc := nginx.NewService()
	nginxH := nginx.NewHandler(nginxSvc, s.auditSvc)
	nginxH.RegisterRoutes(api, authMiddleware, s.requireEditTab("nginx"))

	// Register Realtime WebSocket Route with alerts integration
	wsH := wsTransport.NewMetricsWSHandler(s.telemetrySvc, s.alertsEngine, s.jwtManager, s.cfg.AllowedOrigins)
	s.app.Get("/ws/metrics", wsH.UpgradeMiddleware(), wsH.HandleWS())

	// Register Interactive Web Terminal Console Route (Root only)
	terminalH := terminal.NewTerminalHandler(s.jwtManager)
	s.app.Get("/ws/terminal", terminalH.UpgradeMiddleware(), terminalH.HandleWS())

	// Top-level friendly navigation redirects for browser address bar
	s.app.Get("/login", func(c fiber.Ctx) error {
		return c.Redirect().To("/")
	})
	s.app.Get("/auth/login", func(c fiber.Ctx) error {
		return c.Redirect().To("/")
	})

	// Serve Static Single-Page Application (SPA)
	if s.webFS != nil {
		s.app.Use("/", static.New("", static.Config{
			FS:         s.webFS,
			IndexNames: []string{"index.html"},
			NotFoundHandler: func(c fiber.Ctx) error {
				// If requested from a browser address bar (HTML request), fallback to SPA index.html
				if c.Method() == fiber.MethodGet && strings.Contains(c.Get("Accept"), "text/html") {
					indexData, err := fs.ReadFile(s.webFS, "index.html")
					if err == nil {
						c.Set("Content-Type", "text/html; charset=utf-8")
						return c.Send(indexData)
					}
					return c.Redirect().To("/")
				}

				if strings.HasPrefix(c.Path(), "/api/") || strings.HasPrefix(c.Path(), "/ws/") {
					return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
						"data":  nil,
						"error": fiber.Map{"code": "NOT_FOUND", "message": "Endpoint not found"},
					})
				}

				indexData, err := fs.ReadFile(s.webFS, "index.html")
				if err != nil {
					return c.Status(fiber.StatusNotFound).SendString("404 Not Found")
				}
				c.Set("Content-Type", "text/html; charset=utf-8")
				return c.Send(indexData)
			},
		}))
	}
}

func (s *Server) requireEditTab(tab string) fiber.Handler {
	return func(c fiber.Ctx) error {
		userID, _ := c.Locals("userId").(string)
		username, _ := c.Locals("username").(string)
		role, _ := c.Locals("role").(string)

		// Root / Admin / Primary admin accounts always bypass
		if strings.EqualFold(role, "root") || strings.EqualFold(role, "admin") ||
			username == "stephen3103" || username == "tranducanh31032006@gmail.com" || username == "piganh408@gmail.com" {
			return c.Next()
		}

		// Non-root: verify granular edit permission from database
		if s.authSvc != nil && userID != "" {
			user, err := s.authSvc.GetMe(c.Context(), userID)
			if err == nil && user != nil {
				if user.IsRoot() || user.CanEditTab(tab) {
					return c.Next()
				}
			}
		}

		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"data": nil,
			"error": fiber.Map{
				"code":    "PERMISSION_DENIED",
				"message": fmt.Sprintf("Tài khoản của bạn chỉ có quyền quan sát, không được phép thực hiện thao tác tại mục '%s'.", tab),
			},
			"meta": fiber.Map{"requestId": c.Locals(string(logging.RequestIDKey))},
		})
	}
}

func (s *Server) Listen() error {
	addr := fmt.Sprintf("%s:%d", s.cfg.Host, s.cfg.Port)
	slog.Info("starting HSCC API server", slog.String("address", addr))
	return s.app.Listen(addr)
}

func (s *Server) Shutdown() error {
	return s.app.Shutdown()
}
