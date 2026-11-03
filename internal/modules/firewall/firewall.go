package firewall

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
)

var (
	ErrUfwNotInstalled   = errors.New("ufw command is not installed or not in PATH")
	ErrInvalidRuleNumber = errors.New("invalid firewall rule number")
	ErrCriticalPortBlock = errors.New("cannot block critical access port (SSH 22 or Tailscale)")
)

type FirewallRule struct {
	Number  int    `json:"number"`
	To      string `json:"to"`
	Action  string `json:"action"`
	From    string `json:"from"`
	Comment string `json:"comment,omitempty"`
}

type FirewallStatus struct {
	Active        bool           `json:"active"`
	DefaultIn     string         `json:"defaultIn"`
	DefaultOut    string         `json:"defaultOut"`
	DefaultRouted string         `json:"defaultRouted"`
	Rules         []FirewallRule `json:"rules"`
	RawOutput     string         `json:"rawOutput,omitempty"`
}

type Service struct {
	mu sync.Mutex
}

func NewService() *Service {
	return &Service{}
}

func runCmd(ctx context.Context, name string, args ...string) (string, error) {
	// Try direct first, then with sudo
	cmd := exec.CommandContext(ctx, name, args...)
	out, err := cmd.CombinedOutput()
	if err == nil {
		return string(out), nil
	}

	// Try with sudo -n
	sudoCmd := exec.CommandContext(ctx, "sudo", append([]string{"-n", name}, args...)...)
	sudoOut, sudoErr := sudoCmd.CombinedOutput()
	if sudoErr == nil {
		return string(sudoOut), nil
	}

	return string(out), err
}

func (s *Service) GetStatus(ctx context.Context) (*FirewallStatus, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	out, err := runCmd(ctx, "ufw", "status", "numbered")
	if err != nil {
		// Fallback check if ufw is installed
		if strings.Contains(strings.ToLower(err.Error()), "not found") {
			return nil, ErrUfwNotInstalled
		}
		// Return degraded status if inactive or errored
		return &FirewallStatus{
			Active:    false,
			RawOutput: out,
			Rules:     []FirewallRule{},
		}, nil
	}

	status := &FirewallStatus{
		Active:     strings.Contains(out, "Status: active"),
		DefaultIn:  "deny",
		DefaultOut: "allow",
		Rules:      []FirewallRule{},
		RawOutput:  out,
	}

	// Parse numbered rules
	// Example line: "[ 1] 22/tcp                     ALLOW IN    Anywhere                  # ssh"
	ruleRegex := regexp.MustCompile(`^\[\s*(\d+)\]\s+(.+?)\s{2,}(ALLOW IN|DENY IN|ALLOW|DENY|REJECT IN|REJECT|LIMIT IN|LIMIT)\s{2,}(.+?)(?:\s+#\s+(.+))?$`)

	scanner := bufio.NewScanner(bytes.NewReader([]byte(out)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "Status:") || strings.HasPrefix(line, "To ") || strings.HasPrefix(line, "--") {
			continue
		}

		matches := ruleRegex.FindStringSubmatch(line)
		if len(matches) >= 5 {
			num, _ := strconv.Atoi(matches[1])
			to := strings.TrimSpace(matches[2])
			action := strings.TrimSpace(matches[3])
			from := strings.TrimSpace(matches[4])
			comment := ""
			if len(matches) > 5 {
				comment = strings.TrimSpace(matches[5])
			}

			status.Rules = append(status.Rules, FirewallRule{
				Number:  num,
				To:      to,
				Action:  action,
				From:    from,
				Comment: comment,
			})
		}
	}

	// Check default policies from verbose status
	verboseOut, _ := runCmd(ctx, "ufw", "status", "verbose")
	if strings.Contains(verboseOut, "Default: ") {
		defLine := ""
		for _, l := range strings.Split(verboseOut, "\n") {
			if strings.HasPrefix(strings.TrimSpace(l), "Default:") {
				defLine = l
				break
			}
		}
		if defLine != "" {
			if strings.Contains(defLine, "deny (incoming)") {
				status.DefaultIn = "deny"
			} else if strings.Contains(defLine, "allow (incoming)") {
				status.DefaultIn = "allow"
			}
			if strings.Contains(defLine, "allow (outgoing)") {
				status.DefaultOut = "allow"
			} else if strings.Contains(defLine, "deny (outgoing)") {
				status.DefaultOut = "deny"
			}
		}
	}

	return status, nil
}

type AddRuleParams struct {
	Port    string `json:"port"`     // e.g. "80", "443", "8080"
	Proto   string `json:"proto"`    // "tcp", "udp", or "any"
	Action  string `json:"action"`   // "allow" or "deny"
	From    string `json:"from"`     // "Anywhere" or specific IP
	Comment string `json:"comment"`  // optional note
}

func (s *Service) AddRule(ctx context.Context, p AddRuleParams) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	p.Port = strings.TrimSpace(p.Port)
	p.Proto = strings.ToLower(strings.TrimSpace(p.Proto))
	p.Action = strings.ToLower(strings.TrimSpace(p.Action))
	p.From = strings.TrimSpace(p.From)

	if p.Port == "" {
		return errors.New("cổng dịch vụ (port) không được để trống")
	}

	if p.Action != "allow" && p.Action != "deny" {
		p.Action = "allow"
	}

	// Critical port lock: never deny port 22
	if (p.Port == "22" || strings.HasPrefix(p.Port, "22/")) && p.Action == "deny" {
		return ErrCriticalPortBlock
	}

	args := []string{}
	ruleSpec := p.Port
	if p.Proto != "" && p.Proto != "any" {
		ruleSpec = fmt.Sprintf("%s/%s", p.Port, p.Proto)
	}

	if p.From != "" && !strings.EqualFold(p.From, "anywhere") && !strings.EqualFold(p.From, "any") {
		args = append(args, p.Action, "from", p.From, "to", "any", "port", p.Port)
		if p.Proto != "" && p.Proto != "any" {
			args = append(args, "proto", p.Proto)
		}
	} else {
		args = append(args, p.Action, ruleSpec)
	}

	if p.Comment != "" {
		args = append(args, "comment", p.Comment)
	}

	out, err := runCmd(ctx, "ufw", args...)
	if err != nil {
		return fmt.Errorf("thêm quy tắc ufw thất bại: %s (%w)", out, err)
	}

	return nil
}

func (s *Service) DeleteRule(ctx context.Context, ruleNumber int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if ruleNumber <= 0 {
		return ErrInvalidRuleNumber
	}

	out, err := runCmd(ctx, "ufw", "--force", "delete", strconv.Itoa(ruleNumber))
	if err != nil {
		return fmt.Errorf("xóa quy tắc ufw #%d thất bại: %s (%w)", ruleNumber, out, err)
	}

	return nil
}

func (s *Service) Toggle(ctx context.Context, enable bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	action := "disable"
	args := []string{"disable"}
	if enable {
		action = "enable"
		args = []string{"--force", "enable"}
	}

	out, err := runCmd(ctx, "ufw", args...)
	if err != nil {
		return fmt.Errorf("thao tác ufw %s thất bại: %s (%w)", action, out, err)
	}

	return nil
}
