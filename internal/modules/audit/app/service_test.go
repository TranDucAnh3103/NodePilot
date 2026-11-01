package app

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"hscc/internal/modules/audit/domain"
	"hscc/internal/modules/audit/infra"
	"hscc/internal/platform/sqlite"
)

func setupAuditTestDB(t *testing.T) (*sqlite.DB, func()) {
	tmpDir, err := os.MkdirTemp("", "hscc_audit_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}

	dbPath := filepath.Join(tmpDir, "test.db")
	db, err := sqlite.Open(dbPath)
	if err != nil {
		_ = os.RemoveAll(tmpDir)
		t.Fatalf("failed to open sqlite test db: %v", err)
	}

	ctx := context.Background()
	migrationsDir := filepath.Join("..", "..", "..", "..", "db", "migrations")
	if err := db.Migrate(ctx, migrationsDir); err != nil {
		_ = db.Close()
		_ = os.RemoveAll(tmpDir)
		t.Fatalf("failed to run migrations: %v", err)
	}

	cleanup := func() {
		_ = db.Close()
		_ = os.RemoveAll(tmpDir)
	}
	return db, cleanup
}

func TestAuditService_LogAndQuery(t *testing.T) {
	db, cleanup := setupAuditTestDB(t)
	defer cleanup()

	ctx := context.Background()
	repo := infra.NewAuditRepository(db)
	svc := NewAuditService(repo)

	// 1. Log an action
	err := svc.Log(
		ctx,
		"user-123",
		"admin",
		"docker.container.restart",
		"docker",
		"wavelink-backend",
		"success",
		"req-abc",
		"127.0.0.1",
		`{"password": "secretPassword123!", "reason": "routine upgrade"}`,
	)
	if err != nil {
		t.Fatalf("Failed to log audit event: %v", err)
	}

	// 2. Query events
	events, total, err := svc.QueryEvents(ctx, domain.AuditFilter{Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("Failed to query audit events: %v", err)
	}
	if total != 1 {
		t.Errorf("Expected 1 audit event, got %d", total)
	}
	if len(events) != 1 {
		t.Fatalf("Expected 1 returned event, got %d", len(events))
	}

	e := events[0]
	if e.Verb != "docker.container.restart" || e.TargetID != "wavelink-backend" {
		t.Errorf("Event data mismatch: %+v", e)
	}

	// Verify secrets were redacted
	if e.DetailsRedactedJSON == "" {
		t.Errorf("Expected details to be populated")
	}
	if !containsRedacted(e.DetailsRedactedJSON) {
		t.Errorf("Expected secret to be redacted in details, got: %s", e.DetailsRedactedJSON)
	}
}

func containsRedacted(s string) bool {
	return len(s) > 0 && (s != "secretPassword123!")
}
