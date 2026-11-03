package nginx

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	auditApp "hscc/internal/modules/audit/app"
)

type Handler struct {
	svc      *Service
	auditSvc *auditApp.AuditService
}

func NewHandler(svc *Service, auditSvc *auditApp.AuditService) *Handler {
	return &Handler{
		svc:      svc,
		auditSvc: auditSvc,
	}
}

func (h *Handler) requireRoot(c fiber.Ctx) error {
	role, _ := c.Locals("role").(string)
	user, _ := c.Locals("username").(string)
	isRoot := strings.EqualFold(role, "root") || strings.EqualFold(role, "admin") ||
		user == "stephen3103" || user == "tranducanh31032006@gmail.com" || user == "piganh408@gmail.com"

	if !isRoot {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "FORBIDDEN", "message": "Chỉ tài khoản ROOT mới có quyền quản trị máy chủ Web Nginx"},
		})
	}
	return nil
}

func (h *Handler) RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler, editMiddleware fiber.Handler) {
	group := router.Group("/nginx", authMiddleware)

	group.Get("/status", h.GetStatus)
	group.Get("/sites", h.ListSites)
	group.Get("/sites/:name", h.GetSite)
	group.Put("/sites/:name", editMiddleware, h.SaveSite)
	group.Post("/sites/:name/toggle", editMiddleware, h.ToggleSite)
	group.Delete("/sites/:name", editMiddleware, h.DeleteSite)
	group.Post("/test", h.TestConfig)
	group.Post("/reload", editMiddleware, h.Reload)
}

func (h *Handler) GetStatus(c fiber.Ctx) error {
	status, err := h.svc.GetStatus(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "NGINX_STATUS_FAILED", "message": err.Error()},
		})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  status,
		"error": nil,
	})
}

func (h *Handler) ListSites(c fiber.Ctx) error {
	sites, err := h.svc.ListSites(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "NGINX_LIST_FAILED", "message": err.Error()},
		})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  sites,
		"error": nil,
	})
}

func (h *Handler) GetSite(c fiber.Ctx) error {
	name := c.Params("name")
	content, enabled, err := h.svc.GetSiteContent(c.Context(), name)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "SITE_NOT_FOUND", "message": err.Error()},
		})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data": fiber.Map{
			"name":    name,
			"content": content,
			"enabled": enabled,
		},
		"error": nil,
	})
}

type SaveSiteRequest struct {
	Content string `json:"content"`
}

func (h *Handler) SaveSite(c fiber.Ctx) error {
	if err := h.requireRoot(c); err != nil {
		return err
	}

	name := c.Params("name")
	var req SaveSiteRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "Nội dung cấu hình không hợp lệ"},
		})
	}

	if err := h.svc.SaveSiteContent(c.Context(), name, req.Content); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "SAVE_SITE_FAILED", "message": err.Error()},
		})
	}

	userID, _ := c.Locals("userId").(string)
	user, _ := c.Locals("username").(string)
	if h.auditSvc != nil {
		_ = h.auditSvc.Log(c.Context(), userID, user, "save", "nginx_site", name, "SUCCESS", "", c.IP(), "")
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"success": true, "message": "Lưu file cấu hình site thành công"},
		"error": nil,
	})
}

type ToggleSiteRequest struct {
	Enable bool `json:"enable"`
}

func (h *Handler) ToggleSite(c fiber.Ctx) error {
	if err := h.requireRoot(c); err != nil {
		return err
	}

	name := c.Params("name")
	var req ToggleSiteRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "Trạng thái bật/tắt là bắt buộc"},
		})
	}

	if err := h.svc.ToggleSite(c.Context(), name, req.Enable); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "TOGGLE_SITE_FAILED", "message": err.Error()},
		})
	}

	userID, _ := c.Locals("userId").(string)
	user, _ := c.Locals("username").(string)
	stateStr := "disable"
	if req.Enable {
		stateStr = "enable"
	}
	if h.auditSvc != nil {
		_ = h.auditSvc.Log(c.Context(), userID, user, stateStr, "nginx_site", name, "SUCCESS", "", c.IP(), "")
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"success": true, "enabled": req.Enable},
		"error": nil,
	})
}

func (h *Handler) DeleteSite(c fiber.Ctx) error {
	if err := h.requireRoot(c); err != nil {
		return err
	}

	name := c.Params("name")
	if strings.EqualFold(name, "default") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "CANNOT_DELETE_DEFAULT", "message": "Không thể xóa cấu hình default của nginx"},
		})
	}

	if err := h.svc.DeleteSite(c.Context(), name); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "DELETE_SITE_FAILED", "message": err.Error()},
		})
	}

	userID, _ := c.Locals("userId").(string)
	user, _ := c.Locals("username").(string)
	if h.auditSvc != nil {
		_ = h.auditSvc.Log(c.Context(), userID, user, "delete", "nginx_site", name, "SUCCESS", "", c.IP(), "")
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"success": true, "message": "Đã xóa site " + name},
		"error": nil,
	})
}

func (h *Handler) TestConfig(c fiber.Ctx) error {
	ok, out := h.svc.TestConfig(c.Context())
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data": fiber.Map{
			"success": ok,
			"output":  out,
		},
		"error": nil,
	})
}

func (h *Handler) Reload(c fiber.Ctx) error {
	if err := h.requireRoot(c); err != nil {
		return err
	}

	if err := h.svc.Reload(c.Context()); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "RELOAD_FAILED", "message": err.Error()},
		})
	}

	userID, _ := c.Locals("userId").(string)
	user, _ := c.Locals("username").(string)
	if h.auditSvc != nil {
		_ = h.auditSvc.Log(c.Context(), userID, user, "reload", "nginx", "service", "SUCCESS", "", c.IP(), "")
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"success": true, "message": "Nginx đã được nạp lại cấu hình thành công"},
		"error": nil,
	})
}
