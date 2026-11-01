package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"runtime/debug"
	"syscall"
	"time"

	"hscc"
	"hscc/internal/modules/alerts"
	auditApp "hscc/internal/modules/audit/app"
	auditInfra "hscc/internal/modules/audit/infra"
	authApp "hscc/internal/modules/auth/app"
	authInfra "hscc/internal/modules/auth/infra"
	filesApp "hscc/internal/modules/files/app"
	"hscc/internal/modules/guardrail"
	systemInfra "hscc/internal/modules/system/infra"
	tasksApp "hscc/internal/modules/tasks/app"
	tasksInfra "hscc/internal/modules/tasks/infra"
	"hscc/internal/modules/telemetry"
	workloadApp "hscc/internal/modules/workloads/app"
	workloadInfra "hscc/internal/modules/workloads/infra"
	"hscc/internal/platform/config"
	"hscc/internal/platform/logging"
	"hscc/internal/platform/security"
	"hscc/internal/platform/sqlite"
	"hscc/internal/transport/http"
)

func main() {
	// 1. Initialize Logger
	logging.InitLogger(os.Stdout, slog.LevelInfo)
	slog.Info("initializing Home Server Control Center (HSCC) API...")

	// 2. Load Config
	cfg := config.LoadConfig()

	// 3. Set soft memory limit if configured to protect hardware budget
	if cfg.MemoryLimitMiB > 0 {
		debug.SetMemoryLimit(int64(cfg.MemoryLimitMiB) * 1024 * 1024)
		slog.Info("configured runtime memory limit", slog.Int("limit_mib", cfg.MemoryLimitMiB))
	}

	// 4. Initialize SQLite
	db, err := sqlite.Open(cfg.DBPath)
	if err != nil {
		slog.Error("failed to open database", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer db.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Run migrations (using embedded filesystem with fallback to disk)
	migrationsFS, err := hscc.GetMigrationsFS()
	if err == nil {
		if err := db.MigrateFS(ctx, migrationsFS); err != nil {
			slog.Error("failed to execute embedded migrations", slog.String("error", err.Error()))
			os.Exit(1)
		}
	} else {
		if err := db.Migrate(ctx, "./db/migrations"); err != nil {
			slog.Error("failed to execute disk migrations", slog.String("error", err.Error()))
			os.Exit(1)
		}
	}

	// 5. Initialize Auth Module
	authRepo := authInfra.NewAuthRepository(db)
	jwtMgr := security.NewJWTManager(cfg.JWTSecret, 10*time.Minute)
	authSvc := authApp.NewAuthService(authRepo, jwtMgr)

	// 6. Initialize Audit Trail Module
	auditRepo := auditInfra.NewAuditRepository(db)
	auditSvc := auditApp.NewAuditService(auditRepo)

	// 7. Initialize Downsampling History Store & Alert Engine (Sprint 3)
	historyStore := telemetry.NewHistoryStore(db.DB)
	alertsEngine := alerts.NewEngine(alerts.DefaultConfig())

	// 8. Initialize Demand-Driven Telemetry Collector
	collector := systemInfra.NewSystemCollector()
	telemetrySvc := telemetry.NewTelemetryService(collector, 120, cfg.MaxWSClients)
	telemetrySvc.SetPowerPolicy(
		time.Duration(cfg.IdleCollectIntervalS)*time.Second,
		time.Duration(cfg.ActiveGraceS)*time.Second,
	)
	telemetrySvc.AddSink(historyStore.Observe)
	telemetrySvc.AddSink(alertsEngine.Observe)
	telemetrySvc.Start(ctx, time.Duration(cfg.CollectIntervalS)*time.Second)

	// 9. Initialize Workloads & Guardrail Policy Engine
	policyPath := "/etc/hscc/helper-policy.yaml"
	if _, err := os.Stat("/etc/hscc"); os.IsNotExist(err) {
		policyPath = "./data/helper-policy.yaml"
	}
	policyEngine := guardrail.NewPolicyEngine(policyPath)

	dockerClient := workloadInfra.NewDockerClient("")
	systemdClient := workloadInfra.NewSystemdClient()
	actionRepo := workloadInfra.NewActionRepository(db)
	workloadSvc := workloadApp.NewWorkloadService(dockerClient, systemdClient, policyEngine, actionRepo, auditSvc)

	// 10. Initialize Task Automation & Safe Backup (Sprint 3)
	taskRepo := tasksInfra.NewTaskRepo(db)
	taskSvc := tasksApp.NewTaskService(taskRepo, db, cfg, auditSvc)

	// 11. Initialize Scoped File Manager Sandbox (Sprint 3)
	fileSvc := filesApp.NewFileService(cfg.FileRoots, auditSvc)

	// 12. Initialize Process Explorer
	procCollector := systemInfra.NewProcessCollector()

	// 13. Initialize HTTP & WS Server with Embedded Static Web UI
	webFS, err := hscc.GetWebFS()
	if err != nil {
		slog.Warn("embedded web UI not available", slog.String("error", err.Error()))
	}
	server := http.NewServer(
		cfg, db, telemetrySvc, jwtMgr, authSvc, auditSvc, workloadSvc,
		taskSvc, fileSvc, historyStore, alertsEngine, procCollector, webFS,
	)

	// Handle Graceful Shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		sig := <-sigChan
		slog.Info("received shutdown signal", slog.String("signal", sig.String()))
		cancel()

		// Disconnect active WS clients and flush downsampling metrics before exit
		telemetrySvc.CloseAll()
		flushCtx, flushCancel := context.WithTimeout(context.Background(), 3*time.Second)
		_ = historyStore.Flush(flushCtx)
		flushCancel()

		_ = server.Shutdown()
	}()

	if err := server.Listen(); err != nil {
		slog.Info("server stopped", slog.String("info", err.Error()))
	}
}
