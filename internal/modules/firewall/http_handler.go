package firewall

import (
	"strconv"
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
			"error": fiber.Map{"code": "FORBIDDEN", "message": "Chỉ tài khoản ROOT mới có quyền quản trị tường lửa UFW"},
		})
	}
	return nil
}

func (h *Handler) RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler) {
	group := router.Group("/firewall", authMiddleware)

	group.Get("/status", h.GetStatus)
	group.Post("/rules", h.AddRule)
	group.Delete("/rules/:number", h.DeleteRule)
	group.Post("/toggle", h.Toggle)
}

func (h *Handler) GetStatus(c fiber.Ctx) error {
	status, err := h.svc.GetStatus(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "FIREWALL_ERROR", "message": err.Error()},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  status,
		"error": nil,
	})
}

func (h *Handler) AddRule(c fiber.Ctx) error {
	if err := h.requireRoot(c); err != nil {
		return err
	}

	var req AddRuleParams
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "Dữ liệu yêu cầu không hợp lệ"},
		})
	}

	if err := h.svc.AddRule(c.Context(), req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "ADD_RULE_FAILED", "message": err.Error()},
		})
	}

	userID, _ := c.Locals("userId").(string)
	user, _ := c.Locals("username").(string)
	if h.auditSvc != nil {
		_ = h.auditSvc.Log(c.Context(), userID, user, "rule_add", "firewall", req.Port, "SUCCESS", "", c.IP(), "")
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"success": true, "message": "Thêm quy tắc tường lửa thành công"},
		"error": nil,
	})
}

func (h *Handler) DeleteRule(c fiber.Ctx) error {
	if err := h.requireRoot(c); err != nil {
		return err
	}

	numStr := c.Params("number")
	ruleNum, err := strconv.Atoi(numStr)
	if err != nil || ruleNum <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_RULE_NUMBER", "message": "Số thứ tự quy tắc không hợp lệ"},
		})
	}

	if err := h.svc.DeleteRule(c.Context(), ruleNum); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "DELETE_RULE_FAILED", "message": err.Error()},
		})
	}

	userID, _ := c.Locals("userId").(string)
	user, _ := c.Locals("username").(string)
	if h.auditSvc != nil {
		_ = h.auditSvc.Log(c.Context(), userID, user, "rule_delete", "firewall", numStr, "SUCCESS", "", c.IP(), "")
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"success": true, "message": "Đã xóa quy tắc tường lửa #" + numStr},
		"error": nil,
	})
}

type ToggleRequest struct {
	Enable bool `json:"enable"`
}

func (h *Handler) Toggle(c fiber.Ctx) error {
	if err := h.requireRoot(c); err != nil {
		return err
	}

	var req ToggleRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "Trạng thái bật/tắt là bắt buộc"},
		})
	}

	if err := h.svc.Toggle(c.Context(), req.Enable); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "TOGGLE_FAILED", "message": err.Error()},
		})
	}

	userID, _ := c.Locals("userId").(string)
	user, _ := c.Locals("username").(string)
	stateStr := "disable"
	if req.Enable {
		stateStr = "enable"
	}
	if h.auditSvc != nil {
		_ = h.auditSvc.Log(c.Context(), userID, user, stateStr, "firewall", "ufw", "SUCCESS", "", c.IP(), "")
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"success": true, "enabled": req.Enable},
		"error": nil,
	})
}
