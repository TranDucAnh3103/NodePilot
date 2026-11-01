package guardrail

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPolicyEngine_HardcodedDenylist(t *testing.T) {
	pe := NewPolicyEngine("")

	// Check SSH
	allowed, reason := pe.CanMutateSystemd("ssh.service", "restart")
	if allowed {
		t.Errorf("Expected ssh.service to be rejected, but was allowed")
	}
	if reason == "" {
		t.Errorf("Expected rejection reason, got empty string")
	}

	// Check Tailscale
	allowed, _ = pe.CanMutateSystemd("tailscaled", "stop")
	if allowed {
		t.Errorf("Expected tailscaled to be rejected")
	}

	// Check Docker service itself
	allowed, _ = pe.CanMutateSystemd("docker.service", "restart")
	if allowed {
		t.Errorf("Expected docker.service to be rejected")
	}

	// Check Container named nginx or cloudflared
	allowed, _ = pe.CanMutateDocker("nginx", "proxy", "stop")
	if allowed {
		t.Errorf("Expected container 'nginx' to be rejected by Hardcoded Denylist")
	}
}

func TestPolicyEngine_Allowlist(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "hscc_policy_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	policyFile := filepath.Join(tmpDir, "helper-policy.yaml")
	content := `
version: 1
allowlist:
  docker:
    - name: "wavelink-backend"
      actions: ["restart", "start", "stop"]
    - project: "my-app"
      actions: ["restart"]
  systemd:
    - unit: "nodepilot-agent.service"
      actions: ["restart"]
`
	if err := os.WriteFile(policyFile, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write policy file: %v", err)
	}

	pe := NewPolicyEngine(policyFile)

	// 1. Allowlisted container by name
	allowed, _ := pe.CanMutateDocker("wavelink-backend", "wavelink", "restart")
	if !allowed {
		t.Errorf("Expected wavelink-backend to be allowed for restart")
	}

	// 2. Allowlisted container by project
	allowed, _ = pe.CanMutateDocker("worker-node-1", "my-app", "restart")
	if !allowed {
		t.Errorf("Expected worker-node-1 to be allowed via project 'my-app'")
	}

	// 3. Disallowed action on allowlisted project
	allowed, _ = pe.CanMutateDocker("worker-node-1", "my-app", "stop")
	if allowed {
		t.Errorf("Expected 'stop' on worker-node-1 to be denied since only restart is allowed")
	}

	// 4. Default Deny on unlisted container
	allowed, _ = pe.CanMutateDocker("unknown-container", "unknown-proj", "restart")
	if allowed {
		t.Errorf("Expected unlisted container to be denied by Default Deny")
	}

	// 5. Allowlisted systemd service
	allowed, _ = pe.CanMutateSystemd("nodepilot-agent.service", "restart")
	if !allowed {
		t.Errorf("Expected nodepilot-agent.service to be allowed for restart")
	}
}
