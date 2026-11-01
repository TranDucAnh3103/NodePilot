package transport

import (
	"errors"

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

func (h *FilesHandler) RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler) {
	files := router.Group("/files", authMiddleware)
	files.Get("/list", h.List)
	files.Get("/content", h.GetContent)
	files.Put("/content", h.SaveContent)
}

func (h *FilesHandler) List(c fiber.Ctx) error {
	path := c.Query("path", ".")
	items, err := h.svc.ListDirectory(c.Context(), path)
	if err != nil {
		if errors.Is(err, domain.ErrPathTraversal) || errors.Is(err, domain.ErrPathBlacklisted) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"data":  nil,
				"error": fiber.Map{"code": "FORBIDDEN_PATH", "message": err.Error()},
				"meta":  fiber.Map{"requestId": getReqID(c)},
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "LIST_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  items,
		"error": nil,
		"meta":  fiber.Map{"requestId": getReqID(c), "path": path},
	})
}

func (h *FilesHandler) GetContent(c fiber.Ctx) error {
	path := c.Query("path", "")
	if path == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_PATH", "message": "Query parameter path is required"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	content, err := h.svc.ReadFile(c.Context(), path)
	if err != nil {
		if errors.Is(err, domain.ErrPathTraversal) || errors.Is(err, domain.ErrPathBlacklisted) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"data":  nil,
				"error": fiber.Map{"code": "FORBIDDEN_PATH", "message": err.Error()},
				"meta":  fiber.Map{"requestId": getReqID(c)},
			})
		}
		if errors.Is(err, domain.ErrFileNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"data":  nil,
				"error": fiber.Map{"code": "NOT_FOUND", "message": "File not found"},
				"meta":  fiber.Map{"requestId": getReqID(c)},
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "READ_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  content,
		"error": nil,
		"meta":  fiber.Map{"requestId": getReqID(c)},
	})
}

func (h *FilesHandler) SaveContent(c fiber.Ctx) error {
	var req domain.SaveFileRequest
	if err := c.Bind().JSON(&req); err != nil || req.RelPath == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "relPath and content are required"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	actorID, _ := c.Locals("userId").(string)
	actorUsername, _ := c.Locals("username").(string)
	ip := c.IP()
	reqID := getReqID(c)

	saved, err := h.svc.WriteFile(c.Context(), actorID, actorUsername, req, ip, reqID)
	if err != nil {
		if errors.Is(err, domain.ErrPathTraversal) || errors.Is(err, domain.ErrPathBlacklisted) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"data":  nil,
				"error": fiber.Map{"code": "FORBIDDEN_PATH", "message": err.Error()},
				"meta":  fiber.Map{"requestId": reqID},
			})
		}
		if errors.Is(err, domain.ErrVersionConflict) {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"data":  nil,
				"error": fiber.Map{"code": "CONFLICT", "message": err.Error()},
				"meta":  fiber.Map{"requestId": reqID},
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "WRITE_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": reqID},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  saved,
		"error": nil,
		"meta":  fiber.Map{"requestId": reqID},
	})
}

func getReqID(c fiber.Ctx) string {
	if id, ok := c.Locals(string(logging.RequestIDKey)).(string); ok && id != "" {
		return id
	}
	return c.Get("X-Request-ID", "unknown")
}
