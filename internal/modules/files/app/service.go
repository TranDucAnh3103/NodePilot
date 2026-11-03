package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	auditApp "hscc/internal/modules/audit/app"
	"hscc/internal/modules/files/domain"
)

const MaxFileSize = 2 * 1024 * 1024 // 2 MiB for web editor

type FileService struct {
	defaultRoot string
	auditSvc    *auditApp.AuditService
}

func NewFileService(defaultRoot string, auditSvc *auditApp.AuditService) *FileService {
	// Parse defaultRoot if in name=path format
	if idx := strings.Index(defaultRoot, "="); idx != -1 {
		defaultRoot = defaultRoot[idx+1:]
	}
	abs, err := filepath.Abs(defaultRoot)
	if err == nil {
		defaultRoot = abs
	}
	_ = os.MkdirAll(defaultRoot, 0750)

	return &FileService{
		defaultRoot: defaultRoot,
		auditSvc:    auditSvc,
	}
}

// GetBookmarks returns quick bookmarks for navigation
func (s *FileService) GetBookmarks(isRoot bool) []domain.Bookmark {
	if runtime.GOOS == "windows" {
		return []domain.Bookmark{
			{Name: "Project Root", Path: ".", Icon: "folder"},
			{Name: "Data Directory", Path: "./data", Icon: "database"},
			{Name: "Web Source", Path: "./web", Icon: "code"},
		}
	}

	bookmarks := []domain.Bookmark{
		{Name: "Stephen Home", Path: "/home/stephen", Icon: "home"},
		{Name: "NodePilot HSCC", Path: "/home/stephen/nodepilot", Icon: "cpu"},
		{Name: "Nginx Configs", Path: "/etc/nginx", Icon: "globe"},
		{Name: "Web Root (/var/www)", Path: "/var/www", Icon: "server"},
		{Name: "System Logs", Path: "/var/log", Icon: "scroll"},
		{Name: "Root (/)", Path: "/", Icon: "shield"},
	}

	if !isRoot {
		return []domain.Bookmark{
			{Name: "Stephen Home", Path: "/home/stephen", Icon: "home"},
			{Name: "NodePilot HSCC", Path: "/home/stephen/nodepilot", Icon: "cpu"},
		}
	}

	return bookmarks
}

// resolvePath validates and normalizes the target path based on user permissions
func (s *FileService) resolvePath(rawPath string, isRoot bool, allowedPaths []string) (string, error) {
	rawPath = strings.TrimSpace(rawPath)
	if rawPath == "" || rawPath == "." {
		if isRoot {
			if runtime.GOOS == "windows" {
				return filepath.Abs(".")
			}
			if _, err := os.Stat("/home/stephen"); err == nil {
				return "/home/stephen", nil
			}
			return "/", nil
		}
		return s.defaultRoot, nil
	}

	var target string
	if filepath.IsAbs(rawPath) {
		target = filepath.Clean(rawPath)
	} else {
		base := s.defaultRoot
		if isRoot {
			if runtime.GOOS != "windows" && strings.HasPrefix(rawPath, "home") {
				base = "/"
			} else {
				base, _ = filepath.Abs(".")
			}
		}
		target = filepath.Clean(filepath.Join(base, rawPath))
	}

	// Always block critical credential leaks
	lower := strings.ToLower(filepath.ToSlash(target))
	blacklists := []string{"/etc/shadow", "/etc/gshadow", "/.ssh/id_rsa", "/.ssh/id_ed25519"}
	for _, b := range blacklists {
		if strings.HasSuffix(lower, b) {
			return "", domain.ErrPathBlacklisted
		}
	}

	// If root, unrestricted
	if isRoot {
		return target, nil
	}

	// For regular users, verify target is inside one of their allowedPaths or defaultRoot
	checkPaths := append([]string{s.defaultRoot}, allowedPaths...)
	allowed := false
	for _, p := range checkPaths {
		cleanP := filepath.Clean(p)
		if strings.HasPrefix(target, cleanP) {
			allowed = true
			break
		}
	}

	if !allowed {
		return "", domain.ErrPathTraversal
	}

	return target, nil
}

func (s *FileService) ListDirectory(ctx context.Context, rawPath string, isRoot bool, allowedPaths []string) ([]domain.FileItem, string, error) {
	target, err := s.resolvePath(rawPath, isRoot, allowedPaths)
	if err != nil {
		return nil, "", err
	}

	entries, err := os.ReadDir(target)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, target, domain.ErrFileNotFound
		}
		return nil, target, err
	}

	var items []domain.FileItem
	for _, entry := range entries {
		name := entry.Name()
		info, err := entry.Info()
		if err != nil {
			continue
		}

		itemRel := filepath.ToSlash(filepath.Join(target, name))
		modeStr := info.Mode().String()
		ext := strings.TrimPrefix(filepath.Ext(name), ".")

		items = append(items, domain.FileItem{
			Name:      name,
			RelPath:   itemRel,
			IsDir:     entry.IsDir(),
			Size:      info.Size(),
			ModTime:   info.ModTime().UTC(),
			Mode:      modeStr,
			Extension: ext,
		})
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].IsDir != items[j].IsDir {
			return items[i].IsDir // Directories first
		}
		return strings.ToLower(items[i].Name) < strings.ToLower(items[j].Name)
	})

	return items, filepath.ToSlash(target), nil
}

func (s *FileService) ReadFile(ctx context.Context, rawPath string, isRoot bool, allowedPaths []string) (*domain.FileContent, error) {
	target, err := s.resolvePath(rawPath, isRoot, allowedPaths)
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

	f, err := os.Open(target)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	hasher := sha256.New()
	contentBytes, err := io.ReadAll(io.TeeReader(f, hasher))
	if err != nil {
		return nil, err
	}

	isEditable := isTextFile(contentBytes)
	displayContent := ""
	if isEditable {
		displayContent = string(contentBytes)
	}

	return &domain.FileContent{
		RelPath:    filepath.ToSlash(target),
		Content:    displayContent,
		SHA256:     hex.EncodeToString(hasher.Sum(nil)),
		Size:       info.Size(),
		ModTime:    info.ModTime().UTC(),
		IsEditable: isEditable,
	}, nil
}

func (s *FileService) SaveFile(ctx context.Context, rawPath, content, expectedSHA string, isRoot bool, allowedPaths []string, actorID, actorUsername string) (*domain.FileContent, error) {
	target, err := s.resolvePath(rawPath, isRoot, allowedPaths)
	if err != nil {
		return nil, err
	}

	info, err := os.Stat(target)
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}

	if err == nil {
		if info.IsDir() {
			return nil, domain.ErrIsDirectory
		}
		// Conflict detection
		if expectedSHA != "" {
			existingBytes, err := os.ReadFile(target)
			if err == nil {
				curHash := sha256.Sum256(existingBytes)
				if hex.EncodeToString(curHash[:]) != expectedSHA {
					return nil, domain.ErrVersionConflict
				}
			}
		}
	}

	// Atomic write via temp file in same directory
	dir := filepath.Dir(target)
	_ = os.MkdirAll(dir, 0755)

	tmpFile, err := os.CreateTemp(dir, ".hscc_tmp_*")
	if err != nil {
		// Fallback to direct write
		if errWrite := os.WriteFile(target, []byte(content), 0644); errWrite != nil {
			return nil, fmt.Errorf("failed to write file: %w", errWrite)
		}
	} else {
		tmpName := tmpFile.Name()
		_, errWrite := tmpFile.Write([]byte(content))
		_ = tmpFile.Close()
		if errWrite != nil {
			_ = os.Remove(tmpName)
			return nil, errWrite
		}
		if errRename := os.Rename(tmpName, target); errRename != nil {
			_ = os.Remove(tmpName)
			_ = os.WriteFile(target, []byte(content), 0644)
		}
	}

	hash := sha256.Sum256([]byte(content))
	shaStr := hex.EncodeToString(hash[:])

	if s.auditSvc != nil {
		_ = s.auditSvc.Log(ctx, actorID, actorUsername, "file_save", "file", target, "SUCCESS", "", "", "")
	}

	return &domain.FileContent{
		RelPath:    filepath.ToSlash(target),
		Content:    content,
		SHA256:     shaStr,
		Size:       int64(len(content)),
		ModTime:    time.Now().UTC(),
		IsEditable: true,
	}, nil
}

func (s *FileService) CreateFolder(ctx context.Context, rawPath string, isRoot bool, allowedPaths []string, actorID, actorUsername string) error {
	target, err := s.resolvePath(rawPath, isRoot, allowedPaths)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(target, 0755); err != nil {
		return fmt.Errorf("không thể tạo thư mục: %w", err)
	}

	if s.auditSvc != nil {
		_ = s.auditSvc.Log(ctx, actorID, actorUsername, "folder_create", "folder", target, "SUCCESS", "", "", "")
	}
	return nil
}

func (s *FileService) CreateFile(ctx context.Context, rawPath string, isRoot bool, allowedPaths []string, actorID, actorUsername string) error {
	target, err := s.resolvePath(rawPath, isRoot, allowedPaths)
	if err != nil {
		return err
	}

	dir := filepath.Dir(target)
	_ = os.MkdirAll(dir, 0755)

	f, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("file đã tồn tại hoặc không thể tạo: %w", err)
	}
	_ = f.Close()

	if s.auditSvc != nil {
		_ = s.auditSvc.Log(ctx, actorID, actorUsername, "file_create", "file", target, "SUCCESS", "", "", "")
	}
	return nil
}

func (s *FileService) DeletePath(ctx context.Context, rawPath string, isRoot bool, allowedPaths []string, actorID, actorUsername string) error {
	target, err := s.resolvePath(rawPath, isRoot, allowedPaths)
	if err != nil {
		return err
	}

	clean := filepath.Clean(target)
	if clean == "/" || clean == "/home" || clean == "/home/stephen" || clean == "C:\\" {
		return errors.New("không được phép xóa thư mục gốc hệ thống")
	}

	if err := os.RemoveAll(target); err != nil {
		return fmt.Errorf("xóa tệp/thư mục thất bại: %w", err)
	}

	if s.auditSvc != nil {
		_ = s.auditSvc.Log(ctx, actorID, actorUsername, "path_delete", "file", target, "SUCCESS", "", "", "")
	}
	return nil
}

func (s *FileService) RenamePath(ctx context.Context, oldRaw, newRaw string, isRoot bool, allowedPaths []string, actorID, actorUsername string) error {
	oldTarget, err := s.resolvePath(oldRaw, isRoot, allowedPaths)
	if err != nil {
		return err
	}

	newTarget, err := s.resolvePath(newRaw, isRoot, allowedPaths)
	if err != nil {
		return err
	}

	if err := os.Rename(oldTarget, newTarget); err != nil {
		return fmt.Errorf("đổi tên thất bại: %w", err)
	}

	if s.auditSvc != nil {
		_ = s.auditSvc.Log(ctx, actorID, actorUsername, "path_rename", "file", oldTarget+" -> "+newTarget, "SUCCESS", "", "", "")
	}
	return nil
}

func isTextFile(data []byte) bool {
	if len(data) == 0 {
		return true
	}
	checkLen := len(data)
	if checkLen > 512 {
		checkLen = 512
	}
	for i := 0; i < checkLen; i++ {
		if data[i] == 0 {
			return false
		}
	}
	return true
}
