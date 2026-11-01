package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	auditApp "hscc/internal/modules/audit/app"
	"hscc/internal/modules/files/domain"
)

const MaxFileSize = 1024 * 1024 // 1 MiB

type FileService struct {
	rootDir  string
	auditSvc *auditApp.AuditService
}

func NewFileService(rootDir string, auditSvc *auditApp.AuditService) *FileService {
	// Parse rootDir if in name=path format
	if idx := strings.Index(rootDir, "="); idx != -1 {
		rootDir = rootDir[idx+1:]
	}
	abs, err := filepath.Abs(rootDir)
	if err == nil {
		rootDir = abs
	}
	_ = os.MkdirAll(rootDir, 0750)

	return &FileService{
		rootDir:  rootDir,
		auditSvc: auditSvc,
	}
}

// sanitizePath ensures no path traversal outside rootDir and blocks sensitive folders (BUG-3.1, AT-10).
func (s *FileService) sanitizePath(rel string) (string, error) {
	rel = filepath.Clean(rel)
	if rel == "." || rel == "/" || rel == "\\" {
		return s.rootDir, nil
	}

	// Reject explicit traversal patterns
	if strings.HasPrefix(rel, "..") || strings.Contains(rel, "../") || strings.Contains(rel, "..\\") {
		return "", domain.ErrPathTraversal
	}

	target := filepath.Join(s.rootDir, rel)
	cleanTarget := filepath.Clean(target)

	// If target exists, evaluate symlinks to block TOCTOU symlink breakouts
	if fi, err := os.Lstat(cleanTarget); err == nil {
		if fi.Mode()&os.ModeSymlink != 0 {
			resolved, err := filepath.EvalSymlinks(cleanTarget)
			if err != nil {
				return "", domain.ErrPathTraversal
			}
			cleanTarget = resolved
		}
	}

	// Verify prefix matches rootDir
	cleanRoot := filepath.Clean(s.rootDir)
	if !strings.HasPrefix(cleanTarget, cleanRoot) {
		return "", domain.ErrPathTraversal
	}

	// Check sensitive blacklisted paths
	lower := strings.ToLower(filepath.ToSlash(cleanTarget))
	blacklists := []string{"/etc/shadow", "/etc/passwd", "/root", "/.ssh", "/proc", "/sys", "/dev"}
	for _, b := range blacklists {
		if strings.Contains(lower, b) {
			return "", domain.ErrPathBlacklisted
		}
	}

	return cleanTarget, nil
}

func (s *FileService) ListDirectory(ctx context.Context, relPath string) ([]domain.FileItem, error) {
	target, err := s.sanitizePath(relPath)
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(target)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, domain.ErrFileNotFound
		}
		return nil, err
	}

	var items []domain.FileItem
	for _, entry := range entries {
		name := entry.Name()
		// Hide internal backup files and temp files
		if strings.HasPrefix(name, ".") {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		itemRel := filepath.ToSlash(filepath.Join(relPath, name))
		items = append(items, domain.FileItem{
			Name:    name,
			RelPath: itemRel,
			IsDir:   entry.IsDir(),
			Size:    info.Size(),
			ModTime: info.ModTime().UTC(),
		})
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].IsDir != items[j].IsDir {
			return items[i].IsDir // Directories first
		}
		return items[i].Name < items[j].Name
	})

	return items, nil
}

func (s *FileService) ReadFile(ctx context.Context, relPath string) (*domain.FileContent, error) {
	target, err := s.sanitizePath(relPath)
	if err != nil {
		return nil, err
	}

	info, err := os.Stat(target)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, domain.ErrFileNotFound
		}
		return nil, err
	}

	if info.IsDir() {
		return nil, domain.ErrIsDirectory
	}

	if info.Size() > MaxFileSize {
		return nil, domain.ErrFileTooLarge
	}

	data, err := os.ReadFile(target)
	if err != nil {
		return nil, err
	}

	hasher := sha256.New()
	hasher.Write(data)
	hashHex := hex.EncodeToString(hasher.Sum(nil))

	return &domain.FileContent{
		RelPath:    filepath.ToSlash(relPath),
		Content:    string(data),
		SHA256:     hashHex,
		Size:       info.Size(),
		ModTime:    info.ModTime().UTC(),
		IsEditable: true,
	}, nil
}

// WriteFile performs atomic save via temp file, creates backup, and verifies optimistic locking (BUG-3.5, FR-FILE-03).
func (s *FileService) WriteFile(ctx context.Context, actorID, actorUsername string, req domain.SaveFileRequest, ip, requestID string) (*domain.FileContent, error) {
	target, err := s.sanitizePath(req.RelPath)
	if err != nil {
		return nil, err
	}

	// Verify optimistic lock if expected SHA256 was provided
	if info, err := os.Stat(target); err == nil {
		if info.IsDir() {
			return nil, domain.ErrIsDirectory
		}

		if req.ExpectedSHA256 != "" {
			currentData, err := os.ReadFile(target)
			if err == nil {
				hasher := sha256.New()
				hasher.Write(currentData)
				currentHash := hex.EncodeToString(hasher.Sum(nil))
				if currentHash != req.ExpectedSHA256 {
					return nil, domain.ErrVersionConflict
				}
			}
		}

		// Create auto-backup before overwrite
		dir := filepath.Dir(target)
		base := filepath.Base(target)
		bakPath := filepath.Join(dir, fmt.Sprintf(".%s.bak_%d", base, time.Now().Unix()))
		_ = copyFile(target, bakPath)
	}

	// Atomic write: write to temp file, sync, then rename
	dir := filepath.Dir(target)
	base := filepath.Base(target)
	tmpPath := filepath.Join(dir, fmt.Sprintf(".%s.tmp_%d", base, time.Now().UnixNano()))

	tmpFile, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0640)
	if err != nil {
		return nil, fmt.Errorf("failed to create temporary file: %w", err)
	}

	if _, err := tmpFile.WriteString(req.Content); err != nil {
		tmpFile.Close()
		_ = os.Remove(tmpPath)
		return nil, fmt.Errorf("failed to write content: %w", err)
	}

	if err := tmpFile.Sync(); err != nil {
		tmpFile.Close()
		_ = os.Remove(tmpPath)
		return nil, fmt.Errorf("failed to sync file: %w", err)
	}
	tmpFile.Close()

	if err := os.Rename(tmpPath, target); err != nil {
		_ = os.Remove(tmpPath)
		return nil, fmt.Errorf("failed to atomic rename file: %w", err)
	}

	// Re-read saved content
	content, err := s.ReadFile(ctx, req.RelPath)
	if err != nil {
		return nil, err
	}

	if s.auditSvc != nil {
		_ = s.auditSvc.Log(ctx, actorID, actorUsername, "FILE_WRITE", "sandbox_file", req.RelPath, "success", requestID, ip,
			fmt.Sprintf(`{"size":%d,"sha256":"%s"}`, content.Size, content.SHA256))
	}

	return content, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}
