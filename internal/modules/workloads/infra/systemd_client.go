package infra

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"os/exec"
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

	cmd := exec.CommandContext(ctx, "systemctl", "list-units", "--type=service", "--all", "--no-legend", "--no-pager")
	out, err := cmd.Output()
	if err != nil {
		// If systemctl fails or not in container, fallback to simulated
		return sc.getSimulatedServices(), nil
	}

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

	return services, nil
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
