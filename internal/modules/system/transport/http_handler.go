package transport

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"hscc/internal/modules/telemetry"
	"hscc/internal/platform/logging"
)

type SystemHandler struct {
	telemetrySvc *telemetry.TelemetryService
}

func NewSystemHandler(telemetrySvc *telemetry.TelemetryService) *SystemHandler {
	return &SystemHandler{telemetrySvc: telemetrySvc}
}

func (h *SystemHandler) RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler) {
	sysGroup := router.Group("/system", authMiddleware)
	sysGroup.Get("/summary", h.Summary)
	sysGroup.Get("/disks", h.Disks)
	sysGroup.Get("/networks", h.Networks)
	sysGroup.Get("/history", h.History)
}

func (h *SystemHandler) Summary(c fiber.Ctx) error {
	snap, err := h.telemetrySvc.GetSummary()
	if err != nil {
		if errors.Is(err, telemetry.ErrNoSnapshotYet) {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"data":  nil,
				"error": fiber.Map{"code": "WARMING_UP", "message": "System telemetry collector is warming up"},
				"meta":  fiber.Map{"requestId": getReqID(c)},
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INTERNAL_ERROR", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  snap,
		"meta":  fiber.Map{"requestId": getReqID(c), "stale": snap.Stale},
		"error": nil,
	})
}

func (h *SystemHandler) Disks(c fiber.Ctx) error {
	disks, err := h.telemetrySvc.GetDisks()
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "METRICS_UNAVAILABLE", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  disks,
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

func (h *SystemHandler) Networks(c fiber.Ctx) error {
	nets, err := h.telemetrySvc.GetNetworks()
	if err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "METRICS_UNAVAILABLE", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  nets,
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

func (h *SystemHandler) History(c fiber.Ctx) error {
	history := h.telemetrySvc.GetHistory()
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  history,
		"meta":  fiber.Map{"requestId": getReqID(c), "count": len(history)},
		"error": nil,
	})
}

func getReqID(c fiber.Ctx) string {
	if id, ok := c.Locals(string(logging.RequestIDKey)).(string); ok && id != "" {
		return id
	}
	return c.Get("X-Request-ID", "unknown")
}
