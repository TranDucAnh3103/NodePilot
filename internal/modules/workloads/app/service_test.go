package app

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	auditApp "hscc/internal/modules/audit/app"
	auditDomain "hscc/internal/modules/audit/domain"
	auditInfra "hscc/internal/modules/audit/infra"
	"hscc/internal/modules/guardrail"
	"hscc/internal/modules/workloads/domain"
	"hscc/internal/modules/workloads/infra"
	"hscc/internal/platform/sqlite"
)

type mockDockerPort struct {
	containers []*domain.Container
}

func (m *mockDockerPort) ListContainers(ctx context.Context) ([]*domain.Container, error) {
	return m.containers, nil
}
func (m *mockDockerPort) GetContainerLogs(ctx context.Context, id string, tailLines int) (string, error) {
	return "sample logs with secret=supersecret123", nil
}
func (m *mockDockerPort) ExecuteAction(ctx context.Context, id, action string) error {
	return nil
}

type mockSystemdPort struct {
	services []*domain.ServiceUnit
}

func (m *mockSystemdPort) ListServices(ctx context.Context) ([]*domain.ServiceUnit, error) {
	return m.services, nil
}
func (m *mockSystemdPort) GetServiceLogs(ctx context.Context, unitName string, tailLines int) (string, error) {
	return "sample journald logs", nil
}
func (m *mockSystemdPort) RestartService(ctx context.Context, unitName string) error {
	return nil
}

func setupWorkloadTestDB(t *testing.T) (*sqlite.DB, func()) {
	tmpDir, err := os.MkdirTemp("", "hscc_workload_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}

	dbPath := filepath.Join(tmpDir, "test.db")
	db, err := sqlite.Open(dbPath)
	if err != nil {
		_ = os.RemoveAll(tmpDir)
		t.Fatalf("failed to open sqlite test db: %v", err)
	}

	ctx := context.Background()
	migrationsDir := filepath.Join("..", "..", "..", "..", "db", "migrations")
	if err := db.Migrate(ctx, migrationsDir); err != nil {
		_ = db.Close()
		_ = os.RemoveAll(tmpDir)
		t.Fatalf("failed to run migrations: %v", err)
	}

	// Insert test user for foreign key constraint in actions table
	_, _ = db.ExecContext(ctx, `
		INSERT INTO users (id, username, password_hash, role, enabled, created_at)
		VALUES ('user-test-1', 'admin', 'hash', 'admin', 1, '2026-01-01T00:00:00Z')
	`)

	cleanup := func() {
		_ = db.Close()
		_ = os.RemoveAll(tmpDir)
	}
	return db, cleanup
}

func TestWorkloadService_GuardrailsAndAudit(t *testing.T) {
	db, cleanup := setupWorkloadTestDB(t)
	defer cleanup()

	ctx := context.Background()
	auditRepo := auditInfra.NewAuditRepository(db)
	auditSvc := auditApp.NewAuditService(auditRepo)
	actionRepo := infra.NewActionRepository(db)

	tmpPolicyDir, _ := os.MkdirTemp("", "hscc_policy_test_*")
	defer os.RemoveAll(tmpPolicyDir)
	policyFile := filepath.Join(tmpPolicyDir, "helper-policy.yaml")
	_ = os.WriteFile(policyFile, []byte(`
version: 1
allowlist:
  docker:
    - name: "wavelink-backend"
      actions: ["restart", "start", "stop"]
  systemd:
    - unit: "nodepilot-agent.service"
      actions: ["restart"]
`), 0644)

	policyEngine := guardrail.NewPolicyEngine(policyFile)

	mockDocker := &mockDockerPort{
		containers: []*domain.Container{
			{Name: "wavelink-backend", Project: "wavelink", State: "running"},
			{Name: "nginx", Project: "proxy", State: "running"},
			{Name: "unmanaged-app", Project: "other", State: "running"},
		},
	}
	mockSystemd := &mockSystemdPort{
		services: []*domain.ServiceUnit{
			{Name: "ssh.service", ActiveState: "active"},
			{Name: "tailscaled.service", ActiveState: "active"},
			{Name: "nodepilot-agent.service", ActiveState: "active"},
		},
	}

	svc := NewWorkloadService(mockDocker, mockSystemd, policyEngine, actionRepo, auditSvc)

	// 1. Test 100% Observability
	containers, _ := svc.ListContainers(ctx)
	if len(containers) != 3 {
		t.Fatalf("Expected 3 containers, got %d", len(containers))
	}
	if !containers[0].IsAllowlisted {
		t.Errorf("Expected wavelink-backend to be allowlisted")
	}
	if !containers[1].IsProtected {
		t.Errorf("Expected nginx to be protected")
	}
	if containers[2].IsAllowlisted {
		t.Errorf("Expected unmanaged-app to NOT be allowlisted (Read-only)")
	}

	// 2. Test Mutate on Protected Target -> Must be rejected by Guardrail
	_, err := svc.ExecuteContainerAction(ctx, "user-test-1", "admin", "nginx", "proxy", "restart", "idem-1", "127.0.0.1", "req-1", "test")
	if err != domain.ErrTargetProtected {
		t.Errorf("Expected ErrTargetProtected for nginx, got %v", err)
	}

	// 3. Test Mutate on Allowlisted Target -> Must succeed
	actRecord, err := svc.ExecuteContainerAction(ctx, "user-test-1", "admin", "wavelink-backend", "wavelink", "restart", "idem-2", "127.0.0.1", "req-2", "test")
	if err != nil {
		t.Fatalf("Expected wavelink-backend restart to succeed, got %v", err)
	}
	if actRecord.State != "succeeded" {
		t.Errorf("Expected action state 'succeeded', got %s", actRecord.State)
	}

	// 4. Test Idempotency: Sending identical idempotency key returns cached action
	actRecord2, err := svc.ExecuteContainerAction(ctx, "user-test-1", "admin", "wavelink-backend", "wavelink", "restart", "idem-2", "127.0.0.1", "req-3", "test")
	if err != nil {
		t.Fatalf("Expected idempotent call to succeed, got %v", err)
	}
	if actRecord2.ID != actRecord.ID {
		t.Errorf("Expected same action ID for idempotency key, got %s != %s", actRecord2.ID, actRecord.ID)
	}

	// 5. Test Mutate on Protected Systemd Service (ssh.service) -> Must be rejected
	_, err = svc.ExecuteServiceAction(ctx, "user-test-1", "admin", "ssh.service", "restart", "idem-3", "127.0.0.1", "req-4", "test")
	if err != domain.ErrTargetProtected {
		t.Errorf("Expected ErrTargetProtected for ssh.service, got %v", err)
	}

	// 6. Verify Audit Events were recorded for both denied and succeeded actions
	events, total, err := auditSvc.QueryEvents(ctx, auditDomain.AuditFilter{Page: 1, PageSize: 10})
	if err != nil || total < 3 {
		t.Errorf("Expected at least 3 audit events recorded, got %d (err: %v)", total, err)
	}
	_ = events
}
