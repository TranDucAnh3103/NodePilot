//go:build !windows

package terminal

import (
	"os"
	"os/exec"

	"github.com/creack/pty"
)

type ShellSession struct {
	cmd  *exec.Cmd
	ptmx *os.File
}

func startShellSession() (*ShellSession, error) {
	// Look for bash, fallback to sh
	shellPath := "/bin/bash"
	if _, err := os.Stat(shellPath); os.IsNotExist(err) {
		shellPath = "/bin/sh"
	}

	cmd := exec.Command(shellPath, "-l")
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
		"LANG=en_US.UTF-8",
		"LC_ALL=en_US.UTF-8",
	)

	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, err
	}

	// Set initial window size: 120 cols x 32 rows
	_ = pty.Setsize(ptmx, &pty.Winsize{
		Rows: 32,
		Cols: 120,
		X:    0,
		Y:    0,
	})

	return &ShellSession{
		cmd:  cmd,
		ptmx: ptmx,
	}, nil
}

func (s *ShellSession) Read(p []byte) (n int, err error) {
	return s.ptmx.Read(p)
}

func (s *ShellSession) Write(p []byte) (n int, err error) {
	return s.ptmx.Write(p)
}

func (s *ShellSession) Resize(cols, rows uint16) {
	_ = pty.Setsize(s.ptmx, &pty.Winsize{
		Rows: rows,
		Cols: cols,
	})
}

func (s *ShellSession) Close() error {
	_ = s.ptmx.Close()
	if s.cmd != nil && s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
		_ = s.cmd.Wait()
	}
	return nil
}
