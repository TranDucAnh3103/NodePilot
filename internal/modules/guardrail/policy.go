package guardrail

import (
	"fmt"
	"os"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"
)

// Hardcoded System Denylist (Hardcoded Safety Lock - Cannot be overridden by any policy file)
var HardcodedDenylist = []string{
	"ssh",
	"sshd",
	"ssh.service",
	"sshd.service",
	"tailscale",
	"tailscaled",
	"tailscaled.service",
	"nginx",
	"nginx.service",
	"cloudflared",
	"cloudflared.service",
	"caddy",
	"caddy.service",
	"mysql",
	"mysql.service",
	"mariadb",
	"mariadb.service",
	"docker",
	"docker.service",
	"containerd",
	"containerd.service",
	"dbus",
	"dbus.service",
	"hscc-api",
	"hscc-api.service",
	"hscc-helper",
	"hscc-helper.service",
	"systemd-journald",
	"systemd-resolved",
	"systemd-logind",
}

// TargetRule defines allowed operations for a specific target or project
type TargetRule struct {
	Name    string   `yaml:"name,omitempty"`    // Exact container or service name
	Project string   `yaml:"project,omitempty"` // Compose project name
	Unit    string   `yaml:"unit,omitempty"`    // systemd unit name
	Actions []string `yaml:"actions"`           // Allowed actions: ["start", "stop", "restart"]
}

// PolicyConfig represents the structure of /etc/hscc/helper-policy.yaml
type PolicyConfig struct {
	Version   int `yaml:"version"`
	Allowlist struct {
		Docker  []TargetRule `yaml:"docker"`
		Systemd []TargetRule `yaml:"systemd"`
	} `yaml:"allowlist"`
}

type PolicyEngine struct {
	policyPath string
	mu         sync.RWMutex
	policy     *PolicyConfig
}

func NewPolicyEngine(policyPath string) *PolicyEngine {
	pe := &PolicyEngine{
		policyPath: policyPath,
		policy:     &PolicyConfig{Version: 1},
	}
	_ = pe.Reload()
	return pe
}

// Reload re-reads the policy file from disk
func (pe *PolicyEngine) Reload() error {
	pe.mu.Lock()
	defer pe.mu.Unlock()

	if pe.policyPath == "" {
		return nil
	}

	data, err := os.ReadFile(pe.policyPath)
	if err != nil {
		if os.IsNotExist(err) {
			// If file doesn't exist, keep default empty policy (default deny for mutations)
			return nil
		}
		return fmt.Errorf("failed to read policy file %s: %w", pe.policyPath, err)
	}

	var cfg PolicyConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return fmt.Errorf("failed to parse policy YAML %s: %w", pe.policyPath, err)
	}

	pe.policy = &cfg
	return nil
}

// IsProtected checks if the given identifier matches any hardcoded Denylist rule.
func IsProtected(identifier string) bool {
	id := strings.ToLower(strings.TrimSpace(identifier))
	id = strings.TrimPrefix(id, "/") // Docker containers often have leading slash
	idBase := strings.TrimSuffix(id, ".service")

	for _, item := range HardcodedDenylist {
		itemLower := strings.ToLower(item)
		itemBase := strings.TrimSuffix(itemLower, ".service")
		if id == itemLower || idBase == itemBase {
			return true
		}
	}
	return false
}

// CanMutateDocker checks if a mutation action on a container is permitted.
// 1. Checks Hardcoded Denylist (fails immediately if matched).
// 2. Checks Allowlist by exact container name or compose project.
func (pe *PolicyEngine) CanMutateDocker(containerName, projectName, action string) (bool, string) {
	cleanName := strings.TrimPrefix(strings.TrimSpace(containerName), "/")
	act := strings.ToLower(strings.TrimSpace(action))

	// 1. Hardcoded Denylist Check
	if IsProtected(cleanName) {
		return false, fmt.Sprintf("Target container '%s' is in the Hardcoded System Denylist and cannot be modified.", cleanName)
	}

	pe.mu.RLock()
	defer pe.mu.RUnlock()

	if pe.policy == nil || len(pe.policy.Allowlist.Docker) == 0 {
		return false, fmt.Sprintf("Target container '%s' is not in the Allowlist (Default Deny).", cleanName)
	}

	for _, rule := range pe.policy.Allowlist.Docker {
		matched := false
		if rule.Name != "" && strings.EqualFold(rule.Name, cleanName) {
			matched = true
		} else if rule.Project != "" && projectName != "" && strings.EqualFold(rule.Project, projectName) {
			matched = true
		}

		if matched {
			for _, allowedAction := range rule.Actions {
				if strings.EqualFold(allowedAction, act) {
					return true, ""
				}
			}
			return false, fmt.Sprintf("Action '%s' is not permitted for container '%s'. Allowed: %v", act, cleanName, rule.Actions)
		}
	}

	return false, fmt.Sprintf("Target container '%s' (project: %s) is not in the Allowlist.", cleanName, projectName)
}

// CanMutateSystemd checks if a mutation action on a systemd unit is permitted.
func (pe *PolicyEngine) CanMutateSystemd(unitName, action string) (bool, string) {
	cleanUnit := strings.TrimSpace(unitName)
	act := strings.ToLower(strings.TrimSpace(action))

	// 1. Hardcoded Denylist Check
	if IsProtected(cleanUnit) {
		return false, fmt.Sprintf("Systemd service '%s' is a Protected Core Service and cannot be modified.", cleanUnit)
	}

	pe.mu.RLock()
	defer pe.mu.RUnlock()

	if pe.policy == nil || len(pe.policy.Allowlist.Systemd) == 0 {
		return false, fmt.Sprintf("Service '%s' is not registered in the Allowlist (Default Deny).", cleanUnit)
	}

	for _, rule := range pe.policy.Allowlist.Systemd {
		if strings.EqualFold(rule.Unit, cleanUnit) || strings.EqualFold(rule.Name, cleanUnit) {
			for _, allowedAction := range rule.Actions {
				if strings.EqualFold(allowedAction, act) {
					return true, ""
				}
			}
			return false, fmt.Sprintf("Action '%s' is not permitted for service '%s'. Allowed: %v", act, cleanUnit, rule.Actions)
		}
	}

	return false, fmt.Sprintf("Service '%s' is not in the Allowlist.", cleanUnit)
}
