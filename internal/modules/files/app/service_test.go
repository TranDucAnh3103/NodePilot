package app

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"hscc/internal/modules/files/domain"
)

func TestFileService_PathTraversalAndAtomicWrite(t *testing.T) {
	tmpDir := t.TempDir()
	svc := NewFileService(tmpDir, nil)
	ctx := context.Background()

	// 1. Path Traversal attempts MUST be rejected with ErrPathTraversal
	traversals := []string{"../secret.txt", "../../etc/passwd", "foo/../../bar", "..\\windows\\system32"}
	for _, p := range traversals {
		_, err := svc.ReadFile(ctx, p)
		if err != domain.ErrPathTraversal {
			t.Errorf("Expected ErrPathTraversal for '%s', got %v", p, err)
		}
	}

	// 2. Write initial file (atomic write)
	initial, err := svc.WriteFile(ctx, "u1", "admin", domain.SaveFileRequest{
		RelPath: "config.yaml",
		Content: "host: 127.0.0.1\nport: 17880\n",
	}, "127.0.0.1", "req-1")
	if err != nil {
		t.Fatalf("Failed to write initial file: %v", err)
	}
	if initial.SHA256 == "" || initial.Size == 0 {
		t.Errorf("Invalid initial file content metadata: %+v", initial)
	}

	// Verify file exists on disk
	diskPath := filepath.Join(tmpDir, "config.yaml")
	data, err := os.ReadFile(diskPath)
	if err != nil || string(data) != "host: 127.0.0.1\nport: 17880\n" {
		t.Fatalf("File content on disk does not match: %s (err: %v)", string(data), err)
	}

	// 3. Write with matching SHA256 (optimistic lock success)
	updated, err := svc.WriteFile(ctx, "u1", "admin", domain.SaveFileRequest{
		RelPath:        "config.yaml",
		Content:        "host: 0.0.0.0\nport: 17880\n",
		ExpectedSHA256: initial.SHA256,
	}, "127.0.0.1", "req-2")
	if err != nil {
		t.Fatalf("Failed optimistic write: %v", err)
	}
	if updated.SHA256 == initial.SHA256 {
		t.Errorf("Expected SHA256 to change after update")
	}

	// 4. Write with mismatched SHA256 (optimistic lock conflict)
	_, err = svc.WriteFile(ctx, "u1", "admin", domain.SaveFileRequest{
		RelPath:        "config.yaml",
		Content:        "malicious overwrite\n",
		ExpectedSHA256: "stale_hash_12345",
	}, "127.0.0.1", "req-3")
	if err != domain.ErrVersionConflict {
		t.Errorf("Expected ErrVersionConflict for stale hash, got %v", err)
	}

	// 5. Verify backup file was created
	entries, _ := os.ReadDir(tmpDir)
	var foundBackup bool
	for _, e := range entries {
		if len(e.Name()) > 10 && e.Name()[:16] == ".config.yaml.bak" {
			foundBackup = true
			break
		}
	}
	if !foundBackup {
		t.Errorf("Expected automatic backup file to be created in sandbox")
	}
}
