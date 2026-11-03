package app

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"hscc/internal/modules/files/domain"
)

func TestFileService_CRUDAndPermissions(t *testing.T) {
	tmpDir := t.TempDir()
	svc := NewFileService(tmpDir, nil)
	ctx := context.Background()

	// 1. Path Traversal attempts for non-root MUST be rejected
	traversals := []string{"../../etc/shadow", "..\\windows\\system32"}
	for _, p := range traversals {
		_, err := svc.ReadFile(ctx, p, false, nil)
		if err != domain.ErrPathTraversal && err != domain.ErrPathBlacklisted {
			t.Errorf("Expected ErrPathTraversal or ErrPathBlacklisted for '%s', got %v", p, err)
		}
	}

	// 2. Create File & Write Content
	fileRel := filepath.Join(tmpDir, "sample.txt")
	saved, err := svc.SaveFile(ctx, fileRel, "hello nodepilot", "", true, nil, "root", "root")
	if err != nil {
		t.Fatalf("Failed to save file: %v", err)
	}
	if saved.Content != "hello nodepilot" {
		t.Errorf("Unexpected content: %s", saved.Content)
	}

	// 3. Read File
	readBack, err := svc.ReadFile(ctx, fileRel, true, nil)
	if err != nil {
		t.Fatalf("Failed to read file: %v", err)
	}
	if readBack.Content != "hello nodepilot" {
		t.Errorf("Content mismatch: %s", readBack.Content)
	}

	// 4. Create Subfolder
	subFolder := filepath.Join(tmpDir, "subproject")
	if err := svc.CreateFolder(ctx, subFolder, true, nil, "root", "root"); err != nil {
		t.Fatalf("Failed to create folder: %v", err)
	}

	// 5. List Directory
	items, curPath, err := svc.ListDirectory(ctx, tmpDir, true, nil)
	if err != nil {
		t.Fatalf("Failed to list directory: %v", err)
	}
	if len(items) != 2 || curPath == "" {
		t.Errorf("Expected 2 items in directory, got %d", len(items))
	}

	// 6. Delete File
	if err := svc.DeletePath(ctx, fileRel, true, nil, "root", "root"); err != nil {
		t.Fatalf("Failed to delete file: %v", err)
	}

	// 7. Verify file was deleted
	if _, err := os.Stat(fileRel); !os.IsNotExist(err) {
		t.Errorf("File should have been deleted")
	}
}
