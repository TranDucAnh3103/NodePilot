package transport

import (
	"errors"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"hscc/internal/modules/alerts"
	systemInfra "hscc/internal/modules/system/infra"
	"hscc/internal/modules/telemetry"
	"hscc/internal/platform/logging"
)

type SystemHandler struct {
	telemetrySvc  *telemetry.TelemetryService
	updateSvc     *systemInfra.UpdateService
	procCollector *systemInfra.ProcessCollector
	historyStore  *telemetry.HistoryStore
	alertsEngine  *alerts.Engine
}

func NewSystemHandler(
	telemetrySvc *telemetry.TelemetryService,
	updateSvc *systemInfra.UpdateService,
	procCollector *systemInfra.ProcessCollector,
	historyStore *telemetry.HistoryStore,
	alertsEngine *alerts.Engine,
) *SystemHandler {
	return &SystemHandler{
		telemetrySvc:  telemetrySvc,
		updateSvc:     updateSvc,
		procCollector: procCollector,
		historyStore:  historyStore,
		alertsEngine:  alertsEngine,
	}
}

func (h *SystemHandler) RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler) {
	sysGroup := router.Group("/system", authMiddleware)
	sysGroup.Get("/summary", h.Summary)
	sysGroup.Get("/disks", h.Disks)
	sysGroup.Get("/networks", h.Networks)
	sysGroup.Get("/history", h.History)
	sysGroup.Get("/history/series", h.HistorySeries)
	sysGroup.Get("/processes", h.Processes)
	sysGroup.Get("/power-status", h.PowerStatus)
	sysGroup.Get("/version", h.Version)
	sysGroup.Get("/update/check", h.CheckUpdate)
	sysGroup.Post("/update/trigger", h.TriggerUpdate)

	alertsGroup := router.Group("/alerts", authMiddleware)
	alertsGroup.Get("", h.Alerts)
}

func (h *SystemHandler) PowerStatus(c fiber.Ctx) error {
	st := h.telemetrySvc.Status()
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  st,
		"error": nil,
		"meta":  fiber.Map{"requestId": getReqID(c)},
	})
}

func (h *SystemHandler) Processes(c fiber.Ctx) error {
	sortBy := c.Query("sort", "cpu") // "cpu", "memory", "pid"
	limit, _ := strconv.Atoi(c.Query("limit", "50"))

	procs, err := h.procCollector.ListProcesses(c.Context(), sortBy, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "PROCESSES_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  procs,
		"error": nil,
		"meta":  fiber.Map{"requestId": getReqID(c), "count": len(procs)},
	})
}

func (h *SystemHandler) HistorySeries(c fiber.Ctx) error {
	if h.historyStore == nil {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "NOT_AVAILABLE", "message": "History store not configured"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	metric := c.Query("metric", "cpu.usage")
	scope := c.Query("scope", "host")
	durationStr := c.Query("duration", "24h")
	rng, err := time.ParseDuration(durationStr)
	if err != nil || rng <= 0 {
		rng = 24 * time.Hour
	}

	series, err := h.historyStore.Query(c.Context(), metric, scope, rng, 120)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "QUERY_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  series,
		"error": nil,
		"meta":  fiber.Map{"requestId": getReqID(c)},
	})
}

func (h *SystemHandler) Alerts(c fiber.Ctx) error {
	if h.alertsEngine == nil {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"data": fiber.Map{
				"active": []alerts.Alert{},
				"recent": []alerts.Alert{},
			},
			"error": nil,
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	active, recent := h.alertsEngine.Snapshot()
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data": fiber.Map{
			"active": active,
			"recent": recent,
		},
		"error": nil,
		"meta":  fiber.Map{"requestId": getReqID(c)},
	})
}

func (h *SystemHandler) Version(c fiber.Ctx) error {
	v := h.updateSvc.GetVersionInfo()
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  v,
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

func (h *SystemHandler) CheckUpdate(c fiber.Ctx) error {
	updateInfo, err := h.updateSvc.CheckUpdate(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "CHECK_UPDATE_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  updateInfo,
		"meta":  fiber.Map{"requestId": getReqID(c)},
		"error": nil,
	})
}

func (h *SystemHandler) TriggerUpdate(c fiber.Ctx) error {
	role, _ := c.Locals("role").(string)
	if role != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "FORBIDDEN", "message": "Only administrators can trigger system updates"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	actorID, _ := c.Locals("username").(string)
	if actorID == "" {
		actorID = "unknown_admin"
	}

	reqID := getReqID(c)
	result, err := h.updateSvc.TriggerUpdate(c.Context(), actorID, reqID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "TRIGGER_UPDATE_FAILED", "message": err.Error()},
			"meta":  fiber.Map{"requestId": reqID},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  result,
		"meta":  fiber.Map{"requestId": reqID},
		"error": nil,
	})
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
