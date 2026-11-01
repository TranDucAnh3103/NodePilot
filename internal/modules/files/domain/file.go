package domain

import (
	"errors"
	"time"
)

var (
	ErrPathTraversal   = errors.New("path traversal detected: access outside managed root is denied")
	ErrPathBlacklisted = errors.New("access to system sensitive path is forbidden")
	ErrFileNotFound    = errors.New("file or directory not found")
	ErrFileTooLarge    = errors.New("file is too large for web editor (maximum 1 MiB)")
	ErrVersionConflict = errors.New("file has been modified on disk by another process (conflict)")
	ErrIsDirectory     = errors.New("target is a directory, not a file")
)

type FileItem struct {
	Name    string    `json:"name"`
	RelPath string    `json:"relPath"`
	IsDir   bool      `json:"isDir"`
	Size    int64     `json:"size"`
	ModTime time.Time `json:"modTime"`
}

type FileContent struct {
	RelPath   string    `json:"relPath"`
	Content   string    `json:"content"`
	SHA256    string    `json:"sha256"`
	Size      int64     `json:"size"`
	ModTime   time.Time `json:"modTime"`
	IsEditable bool     `json:"isEditable"`
}

type SaveFileRequest struct {
	RelPath        string `json:"relPath"`
	Content        string `json:"content"`
	ExpectedSHA256 string `json:"expectedSha256,omitempty"` // For optimistic locking
}
