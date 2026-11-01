package transport

import (
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"hscc/internal/modules/audit/app"
	"hscc/internal/modules/audit/domain"
	"hscc/internal/platform/logging"
)

type AuditHandler struct {
	auditSvc *app.AuditService
}

func NewAuditHandler(auditSvc *app.AuditService) *AuditHandler {
	return &AuditHandler{auditSvc: auditSvc}
}

func (h *AuditHandler) RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler) {
	auditGroup := router.Group("/audit", authMiddleware)
	auditGroup.Get("/", h.GetAuditEvents)
}

func (h *AuditHandler) GetAuditEvents(c fiber.Ctx) error {
	keyword := c.Query("keyword")
	verb := c.Query("verb")
	result := c.Query("result")
	fromStr := c.Query("from")
	toStr := c.Query("to")

	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("pageSize", "20"))

	var from, to time.Time
	if fromStr != "" {
		from, _ = time.Parse(time.RFC3339, fromStr)
	}
	if toStr != "" {
		to, _ = time.Parse(time.RFC3339, toStr)
	}

	filter := domain.AuditFilter{
		Keyword:  keyword,
		Verb:     verb,
		Result:   result,
		From:     from,
		To:       to,
		Page:     page,
		PageSize: pageSize,
	}

	events, total, err := h.auditSvc.QueryEvents(c.Context(), filter)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "AUDIT_QUERY_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": c.Locals(string(logging.RequestIDKey))},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data": fiber.Map{
			"items":    events,
			"total":    total,
			"page":     page,
			"pageSize": pageSize,
		},
		"error": nil,
		"meta":  fiber.Map{"requestId": c.Locals(string(logging.RequestIDKey))},
	})
}
