package transport

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v3"
	"hscc/internal/modules/files/app"
	"hscc/internal/modules/files/domain"
	"hscc/internal/platform/logging"
)

type FilesHandler struct {
	svc *app.FileService
}

func NewFilesHandler(svc *app.FileService) *FilesHandler {
	return &FilesHandler{svc: svc}
}

func (h *FilesHandler) getUserInfo(c fiber.Ctx) (isRoot bool, canEdit bool, allowedPaths []string, userID, username string) {
	role, _ := c.Locals("role").(string)
	username, _ = c.Locals("username").(string)
	userID, _ = c.Locals("userId").(string)

	isRoot = strings.EqualFold(role, "root") || strings.EqualFold(role, "admin") ||
		username == "stephen3103" || username == "tranducanh31032006@gmail.com" || username == "piganh408@gmail.com"

	isViewer := strings.EqualFold(role, "viewer") || strings.EqualFold(role, "view")
	canEdit = !isViewer

	return isRoot, canEdit, nil, userID, username
}

func (h *FilesHandler) RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler, editMiddleware fiber.Handler) {
	files := router.Group("/files", authMiddleware)

	files.Get("/bookmarks", h.Bookmarks)
	files.Get("/list", h.List)
	files.Get("/content", h.GetContent)
	files.Put("/content", editMiddleware, h.SaveContent)
	files.Post("/folder", editMiddleware, h.CreateFolder)
	files.Post("/file", editMiddleware, h.CreateFile)
	files.Delete("/path", editMiddleware, h.DeletePath)
	files.Post("/rename", editMiddleware, h.RenamePath)
	files.Post("/upload", editMiddleware, h.Upload)
	files.Get("/download", h.Download)
}

func (h *FilesHandler) Bookmarks(c fiber.Ctx) error {
	isRoot, _, _, _, _ := h.getUserInfo(c)
	bookmarks := h.svc.GetBookmarks(isRoot)
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  bookmarks,
		"error": nil,
	})
}

func (h *FilesHandler) List(c fiber.Ctx) error {
	path := c.Query("path", "")
	isRoot, _, allowedPaths, _, _ := h.getUserInfo(c)

	items, resolvedPath, err := h.svc.ListDirectory(c.Context(), path, isRoot, allowedPaths)
	if err != nil {
		if errors.Is(err, domain.ErrPathTraversal) || errors.Is(err, domain.ErrPathBlacklisted) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"data":  nil,
				"error": fiber.Map{"code": "FORBIDDEN_PATH", "message": err.Error()},
			})
		}
		if errors.Is(err, domain.ErrFileNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"data":  nil,
				"error": fiber.Map{"code": "NOT_FOUND", "message": "Thư mục không tồn tại"},
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "LIST_FAILED", "message": err.Error()},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data": fiber.Map{
			"currentPath": resolvedPath,
			"items":       items,
		},
		"error": nil,
	})
}

func (h *FilesHandler) GetContent(c fiber.Ctx) error {
	path := c.Query("path", "")
	if path == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_PATH", "message": "Tham số path là bắt buộc"},
		})
	}

	isRoot, _, allowedPaths, _, _ := h.getUserInfo(c)
	content, err := h.svc.ReadFile(c.Context(), path, isRoot, allowedPaths)
	if err != nil {
		if errors.Is(err, domain.ErrPathTraversal) || errors.Is(err, domain.ErrPathBlacklisted) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"data":  nil,
				"error": fiber.Map{"code": "FORBIDDEN_PATH", "message": err.Error()},
			})
		}
		if errors.Is(err, domain.ErrFileNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"data":  nil,
				"error": fiber.Map{"code": "NOT_FOUND", "message": "Tệp không tồn tại"},
			})
		}
		if errors.Is(err, domain.ErrFileTooLarge) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"data":  nil,
				"error": fiber.Map{"code": "FILE_TOO_LARGE", "message": "Tệp quá lớn để mở trong trình biên tập web (tối đa 2 MiB)"},
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "READ_FAILED", "message": err.Error()},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  content,
		"error": nil,
	})
}

type SaveFileReq struct {
	Path           string `json:"path"`
	Content        string `json:"content"`
	ExpectedSHA256 string `json:"expectedSha256,omitempty"`
}

func (h *FilesHandler) SaveContent(c fiber.Ctx) error {
	isRoot, canEdit, allowedPaths, userID, username := h.getUserInfo(c)
	if !canEdit {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "FORBIDDEN", "message": "Tài khoản của bạn chỉ có quyền quan sát, không được phép sửa tệp"},
		})
	}

	var req SaveFileReq
	if err := c.Bind().JSON(&req); err != nil || req.Path == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "Đường dẫn path và nội dung tệp là bắt buộc"},
		})
	}

	saved, err := h.svc.SaveFile(c.Context(), req.Path, req.Content, req.ExpectedSHA256, isRoot, allowedPaths, userID, username)
	if err != nil {
		if errors.Is(err, domain.ErrVersionConflict) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"data":  nil,
				"error": fiber.Map{"code": "CONFLICT", "message": "Tệp đã bị thay đổi trên đĩa bởi tiến trình khác"},
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "SAVE_FAILED", "message": err.Error()},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  saved,
		"error": nil,
	})
}

type FolderReq struct {
	Path string `json:"path"`
}

func (h *FilesHandler) CreateFolder(c fiber.Ctx) error {
	isRoot, canEdit, allowedPaths, userID, username := h.getUserInfo(c)
	if !canEdit {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "FORBIDDEN", "message": "Quyền xem không được phép tạo thư mục"},
		})
	}

	var req FolderReq
	if err := c.Bind().JSON(&req); err != nil || req.Path == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "Đường dẫn thư mục là bắt buộc"},
		})
	}

	if err := h.svc.CreateFolder(c.Context(), req.Path, isRoot, allowedPaths, userID, username); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "CREATE_FAILED", "message": err.Error()},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"success": true, "message": "Tạo thư mục thành công"},
		"error": nil,
	})
}

type FileReq struct {
	Path string `json:"path"`
}

func (h *FilesHandler) CreateFile(c fiber.Ctx) error {
	isRoot, canEdit, allowedPaths, userID, username := h.getUserInfo(c)
	if !canEdit {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "FORBIDDEN", "message": "Quyền xem không được phép tạo tệp"},
		})
	}

	var req FileReq
	if err := c.Bind().JSON(&req); err != nil || req.Path == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "Đường dẫn tệp là bắt buộc"},
		})
	}

	if err := h.svc.CreateFile(c.Context(), req.Path, isRoot, allowedPaths, userID, username); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "CREATE_FAILED", "message": err.Error()},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"success": true, "message": "Tạo tệp thành công"},
		"error": nil,
	})
}

func (h *FilesHandler) DeletePath(c fiber.Ctx) error {
	isRoot, canEdit, allowedPaths, userID, username := h.getUserInfo(c)
	if !canEdit {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "FORBIDDEN", "message": "Quyền xem không được phép xóa dữ liệu"},
		})
	}

	path := c.Query("path", "")
	if path == "" {
		var req struct {
			Path string `json:"path"`
		}
		_ = c.Bind().JSON(&req)
		path = req.Path
	}

	if path == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "Đường dẫn path là bắt buộc"},
		})
	}

	if err := h.svc.DeletePath(c.Context(), path, isRoot, allowedPaths, userID, username); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "DELETE_FAILED", "message": err.Error()},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"success": true, "message": "Đã xóa thành công"},
		"error": nil,
	})
}

type RenameReq struct {
	OldPath string `json:"oldPath"`
	NewPath string `json:"newPath"`
}

func (h *FilesHandler) RenamePath(c fiber.Ctx) error {
	isRoot, canEdit, allowedPaths, userID, username := h.getUserInfo(c)
	if !canEdit {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "FORBIDDEN", "message": "Quyền xem không được phép đổi tên tệp"},
		})
	}

	var req RenameReq
	if err := c.Bind().JSON(&req); err != nil || req.OldPath == "" || req.NewPath == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "OldPath và NewPath là bắt buộc"},
		})
	}

	if err := h.svc.RenamePath(c.Context(), req.OldPath, req.NewPath, isRoot, allowedPaths, userID, username); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "RENAME_FAILED", "message": err.Error()},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"success": true, "message": "Đổi tên thành công"},
		"error": nil,
	})
}

func (h *FilesHandler) Upload(c fiber.Ctx) error {
	isRoot, canEdit, _, _, _ := h.getUserInfo(c)
	if !canEdit {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "FORBIDDEN", "message": "Quyền xem không được phép tải lên tệp"},
		})
	}

	destDir := c.FormValue("destination", ".")
	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_FILE", "message": "Không tìm thấy file tải lên"},
		})
	}

	// Read destination
	targetPath := filepath.Join(destDir, file.Filename)
	if !isRoot && strings.Contains(destDir, "..") {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "FORBIDDEN_PATH", "message": "Đường dẫn không hợp lệ"},
		})
	}

	src, err := file.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "OPEN_FAILED", "message": err.Error()},
		})
	}
	defer src.Close()

	dst, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "SAVE_FAILED", "message": err.Error()},
		})
	}
	defer dst.Close()

	if _, err = io.Copy(dst, src); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "COPY_FAILED", "message": err.Error()},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"success": true, "filename": file.Filename},
		"error": nil,
	})
}

func (h *FilesHandler) Download(c fiber.Ctx) error {
	path := c.Query("path", "")
	if path == "" {
		return c.Status(fiber.StatusBadRequest).SendString("Path query required")
	}

	clean := filepath.Clean(path)
	info, err := os.Stat(clean)
	if err != nil || info.IsDir() {
		return c.Status(fiber.StatusNotFound).SendString("File not found")
	}

	return c.Download(clean)
}

func getReqID(c fiber.Ctx) string {
	if id, ok := c.Locals(string(logging.RequestIDKey)).(string); ok && id != "" {
		return id
	}
	return c.Get("X-Request-ID", "unknown")
}
