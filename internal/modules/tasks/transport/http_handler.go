package transport

import (
	"strconv"

	"github.com/gofiber/fiber/v3"
	"hscc/internal/modules/tasks/app"
	"hscc/internal/platform/logging"
)

type TasksHandler struct {
	svc *app.TaskService
}

func NewTasksHandler(svc *app.TaskService) *TasksHandler {
	return &TasksHandler{svc: svc}
}

func (h *TasksHandler) RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler, tasksEditMiddleware fiber.Handler) {
	tasks := router.Group("/tasks", authMiddleware)
	tasks.Get("/presets", h.ListPresets)
	tasks.Get("/executions", h.ListExecutions)
	tasks.Get("/executions/:id", h.GetExecution)
	tasks.Post("/executions", tasksEditMiddleware, h.TriggerExecution)
	tasks.Post("/executions/:id/cancel", tasksEditMiddleware, h.CancelExecution)
}

func (h *TasksHandler) ListPresets(c fiber.Ctx) error {
	presets := h.svc.ListPresets()
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  presets,
		"error": nil,
		"meta":  fiber.Map{"requestId": getReqID(c)},
	})
}

func (h *TasksHandler) ListExecutions(c fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	runs, err := h.svc.ListExecutions(c.Context(), limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "QUERY_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  runs,
		"error": nil,
		"meta":  fiber.Map{"requestId": getReqID(c)},
	})
}

func (h *TasksHandler) GetExecution(c fiber.Ctx) error {
	id := c.Params("id")
	run, err := h.svc.GetExecution(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "NOT_FOUND", "message": "Task run not found"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  run,
		"error": nil,
		"meta":  fiber.Map{"requestId": getReqID(c)},
	})
}

type TriggerRequest struct {
	PresetID string `json:"presetId"`
}

func (h *TasksHandler) TriggerExecution(c fiber.Ctx) error {
	var req TriggerRequest
	if err := c.Bind().JSON(&req); err != nil || req.PresetID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "presetId is required"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	actorID, _ := c.Locals("userId").(string)
	actorUsername, _ := c.Locals("username").(string)
	ip := c.IP()
	reqID := getReqID(c)

	run, err := h.svc.TriggerExecution(c.Context(), actorID, actorUsername, req.PresetID, ip, reqID)
	if err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "TRIGGER_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": reqID},
		})
	}

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
		"data":  run,
		"error": nil,
		"meta":  fiber.Map{"requestId": reqID},
	})
}

func (h *TasksHandler) CancelExecution(c fiber.Ctx) error {
	id := c.Params("id")
	actorID, _ := c.Locals("userId").(string)
	actorUsername, _ := c.Locals("username").(string)
	ip := c.IP()
	reqID := getReqID(c)

	if err := h.svc.CancelExecution(c.Context(), id, actorID, actorUsername, ip, reqID); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "CANCEL_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": reqID},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"success": true},
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
