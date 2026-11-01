package app

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"hscc/internal/modules/tasks/infra"
	"hscc/internal/platform/config"
	"hscc/internal/platform/sqlite"
)

func TestTaskService_PresetsAndBackup(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	db, err := sqlite.Open(dbPath)
	if err != nil {
		t.Fatalf("Failed to open test db: %v", err)
	}
	defer db.Close()

	ctx := context.Background()
	_, _ = db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS task_executions (
			id TEXT PRIMARY KEY,
			preset_id TEXT NOT NULL,
			actor_id TEXT NOT NULL,
			actor_username TEXT NOT NULL,
			status TEXT NOT NULL,
			output TEXT NOT NULL DEFAULT '',
			exit_code INTEGER NOT NULL DEFAULT 0,
			started_at TEXT NOT NULL,
			completed_at TEXT,
			error_message TEXT
		);
	`)

	cfg := &config.Config{
		BackupDir:  filepath.Join(tmpDir, "backups"),
		BackupKeep: 3,
	}

	taskRepo := infra.NewTaskRepo(db)
	svc := NewTaskService(taskRepo, db, cfg, nil)

	// 1. Presets exist
	presets := svc.ListPresets()
	if len(presets) < 4 {
		t.Fatalf("Expected at least 4 presets, got %d", len(presets))
	}

	// 2. Trigger SQLite backup
	execRecord, err := svc.TriggerExecution(ctx, "u1", "admin", "backup-sqlite", "127.0.0.1", "req-1")
	if err != nil {
		t.Fatalf("Failed to trigger backup execution: %v", err)
	}

	// 3. Concurrency check: Triggering another task while running must return ErrTaskConcurrency
	_, err = svc.TriggerExecution(ctx, "u1", "admin", "backup-sqlite", "127.0.0.1", "req-2")
	if err == nil {
		t.Errorf("Expected concurrency rejection while task is running")
	}

	// Wait for async task to finish (timeout 5s)
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		record, err := svc.GetExecution(ctx, execRecord.ID)
		if err == nil && record.Status != "running" {
			if record.Status != "succeeded" {
				t.Fatalf("Task run failed: status=%s, err=%s, output=%s", record.Status, record.ErrorMessage, record.Output)
			}
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
}
