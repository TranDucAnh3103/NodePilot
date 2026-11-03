//go:build windows

package terminal

import (
	"errors"
	"io"
	"os"
	"os/exec"
)

type ShellSession struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser
}

func startShellSession() (*ShellSession, error) {
	// Use powershell.exe or cmd.exe on Windows
	shell := "powershell.exe"
	if _, err := exec.LookPath(shell); err != nil {
		shell = "cmd.exe"
	}

	cmd := exec.Command(shell, "-NoLogo")
	cmd.Env = os.Environ()

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		return nil, err
	}
	cmd.Stderr = cmd.Stdout // merge stderr into stdout pipe

	if err := cmd.Start(); err != nil {
		_ = stdin.Close()
		_ = stdout.Close()
		return nil, err
	}

	return &ShellSession{
		cmd:    cmd,
		stdin:  stdin,
		stdout: stdout,
	}, nil
}

func (s *ShellSession) Read(p []byte) (n int, err error) {
	if s.stdout == nil {
		return 0, errors.New("stdout closed")
	}
	return s.stdout.Read(p)
}

func (s *ShellSession) Write(p []byte) (n int, err error) {
	if s.stdin == nil {
		return 0, errors.New("stdin closed")
	}
	return s.stdin.Write(p)
}

func (s *ShellSession) Resize(cols, rows uint16) {
	// No-op for Windows pipe fallback
}

func (s *ShellSession) Close() error {
	if s.stdin != nil {
		_ = s.stdin.Close()
	}
	if s.stdout != nil {
		_ = s.stdout.Close()
	}
	if s.cmd != nil && s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
		_ = s.cmd.Wait()
	}
	return nil
}
