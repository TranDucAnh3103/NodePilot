package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"hscc/internal/modules/guardrail"
	workloadInfra "hscc/internal/modules/workloads/infra"
	"hscc/internal/platform/helperproto"
	"hscc/internal/platform/logging"
	"hscc/internal/platform/security"
)

func main() {
	socketPath := flag.String("socket", "/run/hscc/helper.sock", "Path to Unix domain socket")
	policyPath := flag.String("policy", "/etc/hscc/helper-policy.yaml", "Path to helper-policy.yaml")
	flag.Parse()

	logging.InitLogger(os.Stdout, slog.LevelInfo)
	slog.Info("starting hscc-helper root daemon...",
		slog.String("socket", *socketPath),
		slog.String("policy", *policyPath),
	)

	// Fallback path on non-Linux or dev environment
	if runtime.GOOS != "linux" {
		*socketPath = "./data/helper.sock"
		*policyPath = "./data/helper-policy.yaml"
	}

	// Ensure parent directory exists
	dir := filepath.Dir(*socketPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		slog.Error("failed to create socket directory", slog.String("dir", dir), slog.String("error", err.Error()))
		os.Exit(1)
	}

	// Clean up stale socket file
	_ = os.Remove(*socketPath)

	listener, err := net.Listen("unix", *socketPath)
	if err != nil {
		slog.Error("failed to listen on socket", slog.String("socket", *socketPath), slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer func() {
		_ = listener.Close()
		_ = os.Remove(*socketPath)
	}()

	// Set 0660 permission so hscc group can read/write
	_ = os.Chmod(*socketPath, 0660)

	// Initialize Policy Engine
	policyEngine := guardrail.NewPolicyEngine(*policyPath)

	// Initialize Docker and Systemd Adapters
	dockerClient := workloadInfra.NewDockerClient("")
	systemdClient := workloadInfra.NewSystemdClient()

	slog.Info("hscc-helper ready and listening for IPC connections")

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-sigChan
		slog.Info("received shutdown signal, terminating hscc-helper...")
		_ = listener.Close()
		_ = os.Remove(*socketPath)
		os.Exit(0)
	}()

	for {
		conn, err := listener.Accept()
		if err != nil {
			select {
			case <-sigChan:
				return
			default:
				slog.Warn("helper socket accept error", slog.String("error", err.Error()))
				continue
			}
		}

		go handleConnection(conn, policyEngine, dockerClient, systemdClient)
	}
}

func handleConnection(
	conn net.Conn,
	policyEngine *guardrail.PolicyEngine,
	dockerClient *workloadInfra.DockerClient,
	systemdClient *workloadInfra.SystemdClient,
) {
	defer conn.Close()

	// 15 seconds connection deadline
	_ = conn.SetDeadline(time.Now().Add(15 * time.Second))

	reader := bufio.NewReader(conn)
	for {
		line, err := reader.ReadBytes('\n')
		if err != nil {
			return // Client disconnected or timeout
		}

		var req helperproto.Request
		if err := json.Unmarshal(line, &req); err != nil {
			sendError(conn, "", helperproto.ErrCodeInvalidProtocol, "Malformed JSON request")
			return
		}

		if req.ProtocolVersion != helperproto.CurrentProtocolVersion {
			sendError(conn, req.RequestID, helperproto.ErrCodeInvalidProtocol,
				fmt.Sprintf("Unsupported protocol version %d (expected %d)", req.ProtocolVersion, helperproto.CurrentProtocolVersion))
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		resp := executeOperation(ctx, &req, policyEngine, dockerClient, systemdClient)
		cancel()

		respBytes, _ := json.Marshal(resp)
		_, _ = conn.Write(append(respBytes, '\n'))
	}
}

func executeOperation(
	ctx context.Context,
	req *helperproto.Request,
	policyEngine *guardrail.PolicyEngine,
	dockerClient *workloadInfra.DockerClient,
	systemdClient *workloadInfra.SystemdClient,
) *helperproto.Response {
	resp := &helperproto.Response{
		RequestID: req.RequestID,
		Success:   true,
	}

	switch req.Operation {
	case helperproto.OpPing:
		resp.Data = json.RawMessage(`{"status":"pong"}`)
		return resp

	case helperproto.OpDockerContainerList:
		containers, err := dockerClient.ListContainers(ctx)
		if err != nil {
			return makeError(req.RequestID, helperproto.ErrCodeOperationFailed, err.Error())
		}
		data, _ := json.Marshal(containers)
		resp.Data = data
		return resp

	case helperproto.OpDockerContainerLogs:
		logs, err := dockerClient.GetContainerLogs(ctx, req.TargetID, req.TailLines)
		if err != nil {
			return makeError(req.RequestID, helperproto.ErrCodeOperationFailed, err.Error())
		}
		data, _ := json.Marshal(map[string]string{"logs": logs})
		resp.Data = data
		return resp

	case helperproto.OpDockerContainerAction:
		// Enforce Guardrail
		allowed, denyReason := policyEngine.CanMutateDocker(req.TargetID, "", req.Action)
		if !allowed {
			return makeError(req.RequestID, helperproto.ErrCodeProtectedTargetDenied, denyReason)
		}

		err := dockerClient.ExecuteAction(ctx, req.TargetID, req.Action)
		if err != nil {
			return makeError(req.RequestID, helperproto.ErrCodeOperationFailed, err.Error())
		}
		resp.Data = json.RawMessage(`{"status":"executed"}`)
		return resp

	case helperproto.OpSystemdUnitList:
		services, err := systemdClient.ListServices(ctx)
		if err != nil {
			return makeError(req.RequestID, helperproto.ErrCodeOperationFailed, err.Error())
		}
		data, _ := json.Marshal(services)
		resp.Data = data
		return resp

	case helperproto.OpSystemdUnitLogs:
		logs, err := systemdClient.GetServiceLogs(ctx, req.TargetID, req.TailLines)
		if err != nil {
			return makeError(req.RequestID, helperproto.ErrCodeOperationFailed, err.Error())
		}
		data, _ := json.Marshal(map[string]string{"logs": logs})
		resp.Data = data
		return resp

	case helperproto.OpSystemdUnitAction:
		// Enforce Guardrail
		allowed, denyReason := policyEngine.CanMutateSystemd(req.TargetID, req.Action)
		if !allowed {
			return makeError(req.RequestID, helperproto.ErrCodeProtectedTargetDenied, denyReason)
		}

		err := systemdClient.RestartService(ctx, req.TargetID)
		if err != nil {
			return makeError(req.RequestID, helperproto.ErrCodeOperationFailed, err.Error())
		}
		resp.Data = json.RawMessage(`{"status":"restarted"}`)
		return resp

	default:
		return makeError(req.RequestID, helperproto.ErrCodeInvalidProtocol, fmt.Sprintf("Unknown operation: %s", req.Operation))
	}
}

func makeError(requestID, code, message string) *helperproto.Response {
	return &helperproto.Response{
		RequestID:    requestID,
		Success:      false,
		ErrorCode:    code,
		ErrorMessage: security.RedactSecrets(message),
	}
}

func sendError(conn net.Conn, requestID, code, message string) {
	resp := makeError(requestID, code, message)
	b, _ := json.Marshal(resp)
	_, _ = conn.Write(append(b, '\n'))
}
