package infra

import (
	"context"
	"math"
	"sort"
	"strings"

	gopsProc "github.com/shirou/gopsutil/v4/process"
)

type ProcessInfo struct {
	PID           int32   `json:"pid"`
	Name          string  `json:"name"`
	Username      string  `json:"username"`
	Category      string  `json:"category"` // "wavelink", "docker", "web", "database", "hscc", "system"
	CPUPercent    float64 `json:"cpuPercent"`
	MemoryBytes   uint64  `json:"memoryBytes"`
	MemoryPercent float32 `json:"memoryPercent"`
	Status        string  `json:"status"`
	CommandLine   string  `json:"commandLine"`
}

type ProcessCollector struct{}

func NewProcessCollector() *ProcessCollector {
	return &ProcessCollector{}
}

func (c *ProcessCollector) ListProcesses(ctx context.Context, sortBy string, limit int) ([]ProcessInfo, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	procs, err := gopsProc.ProcessesWithContext(ctx)
	if err != nil {
		return nil, err
	}

	var result []ProcessInfo
	for _, p := range procs {
		name, _ := p.NameWithContext(ctx)
		if name == "" {
			continue
		}

		user, _ := p.UsernameWithContext(ctx)
		cmd, _ := p.CmdlineWithContext(ctx)
		status, _ := p.StatusWithContext(ctx)
		cpuP, _ := p.CPUPercentWithContext(ctx)
		memP, _ := p.MemoryPercentWithContext(ctx)
		memInfo, _ := p.MemoryInfoWithContext(ctx)

		var rss uint64
		if memInfo != nil {
			rss = memInfo.RSS
		}

		statusStr := "running"
		if len(status) > 0 {
			statusStr = status[0]
		}

		cat := categorizeProcess(name, cmd)

		result = append(result, ProcessInfo{
			PID:           p.Pid,
			Name:          name,
			Username:      user,
			Category:      cat,
			CPUPercent:    math.Round(cpuP*10) / 10,
			MemoryBytes:   rss,
			MemoryPercent: float32(math.Round(float64(memP)*10) / 10),
			Status:        statusStr,
			CommandLine:   cmd,
		})
	}

	// Sort processes
	switch sortBy {
	case "cpu":
		sort.Slice(result, func(i, j int) bool {
			return result[i].CPUPercent > result[j].CPUPercent
		})
	case "memory":
		sort.Slice(result, func(i, j int) bool {
			return result[i].MemoryBytes > result[j].MemoryBytes
		})
	default: // pid
		sort.Slice(result, func(i, j int) bool {
			return result[i].PID < result[j].PID
		})
	}

	if len(result) > limit {
		result = result[:limit]
	}

	return result, nil
}

func categorizeProcess(name, cmd string) string {
	combined := strings.ToLower(name + " " + cmd)
	switch {
	case strings.Contains(combined, "hscc"):
		return "hscc"
	case strings.Contains(combined, "docker") || strings.Contains(combined, "containerd"):
		return "docker"
	case strings.Contains(combined, "wavelink"):
		return "wavelink"
	case strings.Contains(combined, "nginx") || strings.Contains(combined, "caddy"):
		return "web"
	case strings.Contains(combined, "mysql") || strings.Contains(combined, "postgres") || strings.Contains(combined, "redis") || strings.Contains(combined, "sqlite"):
		return "database"
	case strings.Contains(combined, "tailscale"):
		return "network"
	default:
		return "system"
	}
}
