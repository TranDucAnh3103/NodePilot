package transport

import (
	"errors"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v3"
	"hscc/internal/modules/workloads/app"
	"hscc/internal/modules/workloads/domain"
	"hscc/internal/platform/logging"
)

type WorkloadsHandler struct {
	svc *app.WorkloadService
}

func NewWorkloadsHandler(svc *app.WorkloadService) *WorkloadsHandler {
	return &WorkloadsHandler{svc: svc}
}

func (h *WorkloadsHandler) RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler) {
	group := router.Group("/workloads", authMiddleware)

	// Docker Containers
	group.Get("/containers", h.ListContainers)
	group.Get("/containers/:id/logs", h.GetContainerLogs)
	group.Post("/containers/:name/action", h.ExecuteContainerAction)

	// Systemd Services
	group.Get("/services", h.ListServices)
	group.Get("/services/:name/logs", h.GetServiceLogs)
	group.Post("/services/:name/action", h.ExecuteServiceAction)
}

func (h *WorkloadsHandler) ListContainers(c fiber.Ctx) error {
	containers, err := h.svc.ListContainers(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "CONTAINER_LIST_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": c.Locals(string(logging.RequestIDKey))},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  containers,
		"error": nil,
		"meta":  fiber.Map{"requestId": c.Locals(string(logging.RequestIDKey))},
	})
}

func (h *WorkloadsHandler) GetContainerLogs(c fiber.Ctx) error {
	id := c.Params("id")
	tailLines, _ := strconv.Atoi(c.Query("tail", "200"))

	logs, err := h.svc.GetContainerLogs(c.Context(), id, tailLines)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "LOGS_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": c.Locals(string(logging.RequestIDKey))},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data": fiber.Map{
			"containerId": id,
			"logs":        logs,
		},
		"error": nil,
		"meta":  fiber.Map{"requestId": c.Locals(string(logging.RequestIDKey))},
	})
}

func (h *WorkloadsHandler) ExecuteContainerAction(c fiber.Ctx) error {
	name := c.Params("name")
	var req domain.WorkloadActionRequest
	if err := c.Bind().JSON(&req); err != nil || req.Operation == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "Operation is required (start, stop, restart)"},
			"meta":  fiber.Map{"requestId": c.Locals(string(logging.RequestIDKey))},
		})
	}

	idempotencyKey := c.Get("Idempotency-Key")
	projectName := c.Query("project", "")
	actorID, _ := c.Locals("userId").(string)
	actorUsername, _ := c.Locals("username").(string)
	ip := c.IP()
	requestID, _ := c.Locals(string(logging.RequestIDKey)).(string)

	record, err := h.svc.ExecuteContainerAction(
		c.Context(),
		actorID,
		actorUsername,
		name,
		projectName,
		req.Operation,
		idempotencyKey,
		ip,
		requestID,
		req.Reason,
	)

	if err != nil {
		if errors.Is(err, domain.ErrTargetProtected) || errors.Is(err, domain.ErrTargetUnauthorized) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"data":   record,
				"error":  fiber.Map{"code": "PROTECTED_TARGET_DENIED", "message": err.Error()},
				"meta":   fiber.Map{"requestId": requestID},
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  record,
			"error": fiber.Map{"code": "ACTION_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": requestID},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  record,
		"error": nil,
		"meta":  fiber.Map{"requestId": requestID},
	})
}

func (h *WorkloadsHandler) ListServices(c fiber.Ctx) error {
	services, err := h.svc.ListServices(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "SERVICE_LIST_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": c.Locals(string(logging.RequestIDKey))},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  services,
		"error": nil,
		"meta":  fiber.Map{"requestId": c.Locals(string(logging.RequestIDKey))},
	})
}

func (h *WorkloadsHandler) GetServiceLogs(c fiber.Ctx) error {
	name := c.Params("name")
	tailLines, _ := strconv.Atoi(c.Query("tail", "200"))

	logs, err := h.svc.GetServiceLogs(c.Context(), name, tailLines)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "LOGS_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": c.Locals(string(logging.RequestIDKey))},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data": fiber.Map{
			"unitName": name,
			"logs":     logs,
		},
		"error": nil,
		"meta":  fiber.Map{"requestId": c.Locals(string(logging.RequestIDKey))},
	})
}

func (h *WorkloadsHandler) ExecuteServiceAction(c fiber.Ctx) error {
	name := c.Params("name")
	var req domain.WorkloadActionRequest
	if err := c.Bind().JSON(&req); err != nil || req.Operation == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "Operation is required (restart)"},
			"meta":  fiber.Map{"requestId": c.Locals(string(logging.RequestIDKey))},
		})
	}

	if !strings.EqualFold(req.Operation, "restart") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_OPERATION", "message": "Only restart operation is allowed for services"},
			"meta":  fiber.Map{"requestId": c.Locals(string(logging.RequestIDKey))},
		})
	}

	idempotencyKey := c.Get("Idempotency-Key")
	actorID, _ := c.Locals("userId").(string)
	actorUsername, _ := c.Locals("username").(string)
	ip := c.IP()
	requestID, _ := c.Locals(string(logging.RequestIDKey)).(string)

	record, err := h.svc.ExecuteServiceAction(
		c.Context(),
		actorID,
		actorUsername,
		name,
		req.Operation,
		idempotencyKey,
		ip,
		requestID,
		req.Reason,
	)

	if err != nil {
		if errors.Is(err, domain.ErrTargetProtected) || errors.Is(err, domain.ErrTargetUnauthorized) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"data":   record,
				"error":  fiber.Map{"code": "PROTECTED_TARGET_DENIED", "message": err.Error()},
				"meta":   fiber.Map{"requestId": requestID},
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  record,
			"error": fiber.Map{"code": "ACTION_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": requestID},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  record,
		"error": nil,
		"meta":  fiber.Map{"requestId": requestID},
	})
}
