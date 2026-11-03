package transport

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
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

func (h *SystemHandler) RegisterRoutes(router fiber.Router, authMiddleware fiber.Handler, processesEditMiddleware fiber.Handler) {
	sysGroup := router.Group("/system", authMiddleware)
	sysGroup.Get("/summary", h.Summary)
	sysGroup.Get("/disks", h.Disks)
	sysGroup.Get("/networks", h.Networks)
	sysGroup.Get("/history", h.History)
	sysGroup.Get("/history/series", h.HistorySeries)
	sysGroup.Get("/processes", h.Processes)
	sysGroup.Post("/processes/:pid/kill", processesEditMiddleware, h.KillProcess)
	sysGroup.Get("/power-status", h.PowerStatus)
	sysGroup.Get("/tailscale", h.Tailscale)
	sysGroup.Get("/info", h.ServerInfo)
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

func (h *SystemHandler) KillProcess(c fiber.Ctx) error {
	role, _ := c.Locals("role").(string)
	user, _ := c.Locals("username").(string)
	if role != "root" && role != "admin" && user != "stephen3103" && user != "tranducanh31032006@gmail.com" && user != "piganh408@gmail.com" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "FORBIDDEN", "message": "Chỉ tài khoản Root mới có quyền dừng tiến trình máy chủ"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	pid, err := strconv.Atoi(c.Params("pid"))
	if err != nil || pid <= 1 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "INVALID_PID", "message": "PID không hợp lệ hoặc không thể dừng tiến trình PID 1"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	if pid == os.Getpid() {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "PROTECTED_PROCESS", "message": "Không thể dừng tiến trình điều khiển HSCC đang chạy"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	proc, err := os.FindProcess(pid)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "PROCESS_NOT_FOUND", "message": "Không tìm thấy tiến trình"},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	err = proc.Kill()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"data":  nil,
			"error": fiber.Map{"code": "KILL_FAILED", "message": fmt.Sprintf("Không thể dừng tiến trình: %v", err)},
			"meta":  fiber.Map{"requestId": getReqID(c)},
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  fiber.Map{"pid": pid, "killed": true},
		"error": nil,
		"meta":  fiber.Map{"requestId": getReqID(c)},
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

type TailscalePeer struct {
	IP       string `json:"ip"`
	Hostname string `json:"hostname"`
	User     string `json:"user"`
	OS       string `json:"os"`
	Status   string `json:"status"`
}

type TailscaleInfo struct {
	Connected   bool            `json:"connected"`
	IP          string          `json:"ip"`
	Hostname    string          `json:"hostname"`
	Peers       []TailscalePeer `json:"peers"`
	ActivePeers int             `json:"activePeers"`
	RawStatus   string          `json:"rawStatus,omitempty"`
}

func (h *SystemHandler) Tailscale(c fiber.Ctx) error {
	info := TailscaleInfo{
		Connected: false,
		IP:        "",
		Hostname:  "",
		Peers:     []TailscalePeer{},
	}

	outBytes, err := exec.Command("tailscale", "status").CombinedOutput()
	if err != nil {
		outBytes, _ = exec.Command("sudo", "-n", "tailscale", "status").CombinedOutput()
	}

	out := string(outBytes)
	info.RawStatus = out

	lines := strings.Split(out, "\n")
	for i, l := range lines {
		l = strings.TrimSpace(l)
		if l == "" {
			continue
		}
		fields := strings.Fields(l)
		if len(fields) >= 4 {
			ip := fields[0]
			name := fields[1]
			user := fields[2]
			osName := fields[3]
			statusStr := ""
			if len(fields) > 4 {
				statusStr = strings.Join(fields[4:], " ")
			}

			if i == 0 || statusStr == "-" {
				info.Connected = true
				info.IP = ip
				info.Hostname = name
			} else {
				info.Peers = append(info.Peers, TailscalePeer{
					IP:       ip,
					Hostname: name,
					User:     user,
					OS:       osName,
					Status:   statusStr,
				})
			}
		}
	}
	info.ActivePeers = len(info.Peers)

	// If tailscale status was empty, check tailscale ip -4
	if info.IP == "" {
		ipBytes, err := exec.Command("tailscale", "ip", "-4").CombinedOutput()
		if err == nil && len(ipBytes) > 0 {
			info.IP = strings.TrimSpace(string(ipBytes))
			info.Connected = true
		}
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  info,
		"error": nil,
	})
}

func (h *SystemHandler) ServerInfo(c fiber.Ctx) error {
	snap, _ := h.telemetrySvc.GetSummary()

	info := fiber.Map{
		"hostname": "homeserver",
		"os":       runtime.GOOS,
		"arch":     runtime.GOARCH,
		"uptime":   uint64(0),
		"bootTime": uint64(0),
		"kernel":   "",
		"cores":    runtime.NumCPU(),
		"ramTotal": uint64(0),
		"summary":  snap,
	}

	if snap != nil {
		info["hostname"] = snap.Host.Hostname
		info["os"] = snap.Host.OS + " (" + snap.Host.Platform + ")"
		info["arch"] = snap.Host.Architecture
		info["uptime"] = snap.Host.UptimeSeconds
		info["bootTime"] = snap.Host.BootTime
		info["kernel"] = snap.Host.KernelVersion
		info["cores"] = snap.CPU.Cores
		info["ramTotal"] = snap.Memory.TotalBytes
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"data":  info,
		"error": nil,
	})
}

func getReqID(c fiber.Ctx) string {
	if id, ok := c.Locals(string(logging.RequestIDKey)).(string); ok && id != "" {
		return id
	}
	return c.Get("X-Request-ID", "unknown")
}
