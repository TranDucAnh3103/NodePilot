package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"hscc"
	authApp "hscc/internal/modules/auth/app"
	authInfra "hscc/internal/modules/auth/infra"
	systemInfra "hscc/internal/modules/system/infra"
	"hscc/internal/modules/telemetry"
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

	// 3. Initialize SQLite
	db, err := sqlite.Open(cfg.DBPath)
	if err != nil {
		slog.Error("failed to open database", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer db.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Run migrations
	if err := db.Migrate(ctx, "./db/migrations"); err != nil {
		slog.Error("failed to execute migrations", slog.String("error", err.Error()))
		os.Exit(1)
	}

	// 4. Initialize Auth Module
	authRepo := authInfra.NewAuthRepository(db)
	jwtMgr := security.NewJWTManager(cfg.JWTSecret, 10*time.Minute)
	authSvc := authApp.NewAuthService(authRepo, jwtMgr)

	// 5. Initialize Telemetry & Shared Collector
	collector := systemInfra.NewSystemCollector()
	telemetrySvc := telemetry.NewTelemetryService(collector, 120, cfg.MaxWSClients)
	telemetrySvc.Start(ctx, time.Duration(cfg.CollectIntervalS)*time.Second)

	// 6. Initialize HTTP & WS Server with Embedded Static Web UI
	webFS, err := hscc.GetWebFS()
	if err != nil {
		slog.Warn("embedded web UI not available", slog.String("error", err.Error()))
	}
	server := http.NewServer(cfg, db, telemetrySvc, jwtMgr, authSvc, webFS)

	// Handle Graceful Shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		sig := <-sigChan
		slog.Info("received shutdown signal", slog.String("signal", sig.String()))
		cancel()
		_ = server.Shutdown()
	}()

	if err := server.Listen(); err != nil {
		slog.Info("server stopped", slog.String("info", err.Error()))
	}
}
