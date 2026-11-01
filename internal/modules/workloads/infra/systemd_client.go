package infra

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"hscc/internal/modules/workloads/domain"
	"hscc/internal/platform/security"
)

type SystemdClient struct {
	isLinux bool
}

func NewSystemdClient() *SystemdClient {
	return &SystemdClient{
		isLinux: runtime.GOOS == "linux",
	}
}

func (sc *SystemdClient) ListServices(ctx context.Context) ([]*domain.ServiceUnit, error) {
	if !sc.isLinux {
		return sc.getSimulatedServices(), nil
	}

	// 1. Try systemctl list-units if available in PATH
	cmd := exec.CommandContext(ctx, "systemctl", "list-units", "--type=service", "--all", "--no-legend", "--no-pager")
	out, err := cmd.Output()
	if err == nil && len(out) > 0 {
		var services []*domain.ServiceUnit
		scanner := bufio.NewScanner(bytes.NewReader(out))
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) < 4 {
				continue
			}

			unitName := fields[0]
			loadState := fields[1]
			activeState := fields[2]
			subState := fields[3]
			desc := ""
			if len(fields) > 4 {
				desc = strings.Join(fields[4:], " ")
			}

			s := &domain.ServiceUnit{
				Name:        unitName,
				Description: desc,
				LoadState:   loadState,
				ActiveState: activeState,
				SubState:    subState,
				MainPID:     0,
			}
			services = append(services, s)
		}
		if len(services) > 0 {
			return services, nil
		}
	}

	// 2. Fallback: Scan host systemd directories (/run/systemd/units, /etc/systemd/system, /lib/systemd/system)
	hostUnits := sc.scanHostDirectories()
	if len(hostUnits) > 0 {
		return hostUnits, nil
	}

	// 3. Fallback to simulated services
	return sc.getSimulatedServices(), nil
}

func (sc *SystemdClient) scanHostDirectories() []*domain.ServiceUnit {
	activeMap := make(map[string]bool)

	// Check /run/systemd/units for active invocation symlinks
	if entries, err := os.ReadDir("/run/systemd/units"); err == nil {
		for _, e := range entries {
			name := e.Name()
			if strings.HasPrefix(name, "invocation:") {
				unitName := strings.TrimPrefix(name, "invocation:")
				activeMap[unitName] = true
			}
		}
	}

	serviceDirs := []string{
		"/etc/systemd/system",
		"/lib/systemd/system",
		"/usr/lib/systemd/system",
		"/run/systemd/system",
	}

	seen := make(map[string]bool)
	var result []*domain.ServiceUnit

	for _, dir := range serviceDirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}

		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".service") {
				continue
			}

			unitName := e.Name()
			if seen[unitName] {
				continue
			}
			seen[unitName] = true

			// Extract description from unit file
			filePath := filepath.Join(dir, unitName)
			desc := extractDescription(filePath)
			if desc == "" {
				desc = strings.TrimSuffix(unitName, ".service")
			}

			isActive := activeMap[unitName]
			activeState := "inactive"
			subState := "dead"
			if isActive {
				activeState = "active"
				subState = "running"
			}

			unit := &domain.ServiceUnit{
				Name:        unitName,
				Description: desc,
				LoadState:   "loaded",
				ActiveState: activeState,
				SubState:    subState,
				MainPID:     0,
			}

			// Tag core protected services
			baseName := strings.TrimSuffix(unitName, ".service")
			switch baseName {
			case "ssh", "sshd", "tailscaled", "cloudflared", "nginx", "caddy", "docker", "containerd", "dbus", "hscc-api", "hscc-helper":
				unit.Category = "core_protected"
				unit.IsProtected = true
			default:
				if strings.HasPrefix(baseName, "systemd-") {
					unit.Category = "core_protected"
					unit.IsProtected = true
				} else {
					unit.Category = "application"
				}
			}

			result = append(result, unit)
		}
	}

	return result
}

func extractDescription(filePath string) string {
	f, err := os.Open(filePath)
	if err != nil {
		return ""
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "Description=") {
			return strings.TrimPrefix(line, "Description=")
		}
	}
	return ""
}

func (sc *SystemdClient) GetServiceLogs(ctx context.Context, unitName string, tailLines int) (string, error) {
	if tailLines <= 0 || tailLines > 500 {
		tailLines = 200
	}

	if !sc.isLinux {
		return sc.getSimulatedLogs(unitName, tailLines), nil
	}

	cmd := exec.CommandContext(ctx, "journalctl", "-u", unitName, "-n", strconv.Itoa(tailLines), "--no-pager")
	out, err := cmd.Output()
	if err != nil {
		return sc.getSimulatedLogs(unitName, tailLines), nil
	}

	redacted := security.RedactSecrets(string(out))
	return redacted, nil
}

func (sc *SystemdClient) RestartService(ctx context.Context, unitName string) error {
	if !sc.isLinux {
		return nil // Simulated restart succeeds
	}

	cmd := exec.CommandContext(ctx, "systemctl", "restart", unitName)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("systemctl restart %s failed: %w", unitName, err)
	}
	return nil
}

func (sc *SystemdClient) getSimulatedServices() []*domain.ServiceUnit {
	return []*domain.ServiceUnit{
		{
			Name:        "ssh.service",
			Description: "OpenBSD Secure Shell server",
			LoadState:   "loaded",
			ActiveState: "active",
			SubState:    "running",
			MainPID:     842,
			Category:    "core_protected",
			IsProtected: true,
		},
		{
			Name:        "tailscaled.service",
			Description: "Tailscale node agent",
			LoadState:   "loaded",
			ActiveState: "active",
			SubState:    "running",
			MainPID:     915,
			Category:    "core_protected",
			IsProtected: true,
		},
		{
			Name:        "nginx.service",
			Description: "A high performance web server and reverse proxy",
			LoadState:   "loaded",
			ActiveState: "active",
			SubState:    "running",
			MainPID:     1102,
			Category:    "core_protected",
			IsProtected: true,
		},
		{
			Name:        "docker.service",
			Description: "Docker Application Container Engine",
			LoadState:   "loaded",
			ActiveState: "active",
			SubState:    "running",
			MainPID:     1240,
			Category:    "core_protected",
			IsProtected: true,
		},
		{
			Name:        "hscc-api.service",
			Description: "NodePilot Home Server Control Center (HSCC) API",
			LoadState:   "loaded",
			ActiveState: "active",
			SubState:    "running",
			MainPID:     1480,
			Category:    "core_protected",
			IsProtected: true,
		},
		{
			Name:        "hscc-helper.service",
			Description: "NodePilot HSCC Privileged Root Helper Daemon",
			LoadState:   "loaded",
			ActiveState: "active",
			SubState:    "running",
			MainPID:     612,
			Category:    "core_protected",
			IsProtected: true,
		},
		{
			Name:        "nodepilot-agent.service",
			Description: "NodePilot Local Management Agent",
			LoadState:   "loaded",
			ActiveState: "active",
			SubState:    "running",
			MainPID:     1844,
			Category:    "application",
			IsProtected: false,
		},
		{
			Name:        "cron.service",
			Description: "Regular background program processing daemon",
			LoadState:   "loaded",
			ActiveState: "active",
			SubState:    "running",
			MainPID:     830,
			Category:    "system",
			IsProtected: false,
		},
		{
			Name:        "systemd-journald.service",
			Description: "Journal Service",
			LoadState:   "loaded",
			ActiveState: "active",
			SubState:    "running",
			MainPID:     410,
			Category:    "core_protected",
			IsProtected: true,
		},
	}
}

func (sc *SystemdClient) getSimulatedLogs(unitName string, tailLines int) string {
	now := time.Now()
	lines := []string{
		fmt.Sprintf("%s host systemd[1]: Started %s.", now.Add(-15*time.Minute).Format(time.Stamp), unitName),
		fmt.Sprintf("%s host %s[1040]: [INFO] Service initialized with configuration /etc/hscc/policy.yaml", now.Add(-14*time.Minute).Format(time.Stamp), unitName),
		fmt.Sprintf("%s host %s[1040]: [INFO] Worker pool initialized (2 threads)", now.Add(-10*time.Minute).Format(time.Stamp), unitName),
		fmt.Sprintf("%s host %s[1040]: [INFO] Listening for IPC connections on /run/hscc/helper.sock", now.Add(-5*time.Minute).Format(time.Stamp), unitName),
		fmt.Sprintf("%s host %s[1040]: [INFO] Health status: operational (PID %d)", now.Add(-1*time.Minute).Format(time.Stamp), unitName, 1040),
	}
	return strings.Join(lines, "\n")
}
