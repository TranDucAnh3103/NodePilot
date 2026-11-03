package nginx

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

var (
	ErrNginxNotInstalled = errors.New("nginx is not installed on this system")
	ErrSiteNotFound      = errors.New("nginx site configuration not found")
	ErrInvalidSiteName   = errors.New("invalid site name")
)

type SiteItem struct {
	Name       string    `json:"name"`
	Enabled    bool      `json:"enabled"`
	ModTime    time.Time `json:"modTime"`
	Size       int64     `json:"size"`
	ServerName string    `json:"serverName,omitempty"`
	ListenPort string    `json:"listenPort,omitempty"`
}

type NginxStatus struct {
	Installed bool       `json:"installed"`
	Active    bool       `json:"active"`
	Version   string     `json:"version"`
	Sites     []SiteItem `json:"sites"`
}

type Service struct {
	mu           sync.Mutex
	availableDir string
	enabledDir   string
}

func NewService() *Service {
	avail := "/etc/nginx/sites-available"
	enabled := "/etc/nginx/sites-enabled"

	// Dev fallback
	if _, err := os.Stat("/etc/nginx"); os.IsNotExist(err) {
		avail = "./data/nginx/sites-available"
		enabled = "./data/nginx/sites-enabled"
		_ = os.MkdirAll(avail, 0755)
		_ = os.MkdirAll(enabled, 0755)
	}

	return &Service{
		availableDir: avail,
		enabledDir:   enabled,
	}
}

func runCmd(ctx context.Context, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	out, err := cmd.CombinedOutput()
	if err == nil {
		return string(out), nil
	}

	sudoCmd := exec.CommandContext(ctx, "sudo", append([]string{"-n", name}, args...)...)
	sudoOut, sudoErr := sudoCmd.CombinedOutput()
	if sudoErr == nil {
		return string(sudoOut), nil
	}

	return string(out), err
}

func (s *Service) GetStatus(ctx context.Context) (*NginxStatus, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	status := &NginxStatus{
		Installed: false,
		Active:    false,
		Version:   "Not Installed",
		Sites:     []SiteItem{},
	}

	// 1. Check version
	verOut, err := runCmd(ctx, "nginx", "-v")
	if err == nil || strings.Contains(verOut, "nginx version") {
		status.Installed = true
		status.Version = strings.TrimSpace(verOut)
	} else {
		// Fallback check binary location
		if _, err := exec.LookPath("nginx"); err == nil {
			status.Installed = true
			status.Version = "nginx (installed)"
		} else if _, err := os.Stat("/usr/sbin/nginx"); err == nil {
			status.Installed = true
			status.Version = "nginx (/usr/sbin/nginx)"
		}
	}

	// 2. Check systemd active state
	activeOut, _ := runCmd(ctx, "systemctl", "is-active", "nginx")
	status.Active = strings.TrimSpace(activeOut) == "active"

	// 3. List sites
	sites, _ := s.listSitesUnlocked()
	status.Sites = sites

	return status, nil
}

func (s *Service) ListSites(ctx context.Context) ([]SiteItem, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.listSitesUnlocked()
}

func (s *Service) listSitesUnlocked() ([]SiteItem, error) {
	var sites []SiteItem

	entries, err := os.ReadDir(s.availableDir)
	if err != nil {
		return sites, nil
	}

	serverNameRegex := regexp.MustCompile(`(?m)^\s*server_name\s+([^;]+);`)
	listenRegex := regexp.MustCompile(`(?m)^\s*listen\s+([^;]+);`)

	for _, entry := range entries {
		if entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		name := entry.Name()
		// Check if enabled (exists in sites-enabled)
		enabledPath := filepath.Join(s.enabledDir, name)
		_, errStat := os.Lstat(enabledPath)
		isEnabled := errStat == nil

		// Parse basic server_name and port
		filePath := filepath.Join(s.availableDir, name)
		content, _ := os.ReadFile(filePath)
		serverName := ""
		listenPort := ""

		if len(content) > 0 {
			if m := serverNameRegex.FindSubmatch(content); len(m) > 1 {
				serverName = strings.TrimSpace(string(m[1]))
			}
			if m := listenRegex.FindSubmatch(content); len(m) > 1 {
				listenPort = strings.TrimSpace(string(m[1]))
			}
		}

		sites = append(sites, SiteItem{
			Name:       name,
			Enabled:    isEnabled,
			ModTime:    info.ModTime().UTC(),
			Size:       info.Size(),
			ServerName: serverName,
			ListenPort: listenPort,
		})
	}

	return sites, nil
}

func (s *Service) GetSiteContent(ctx context.Context, name string) (string, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	cleanName := filepath.Base(name)
	if cleanName == "." || cleanName == "/" || strings.Contains(cleanName, "..") {
		return "", false, ErrInvalidSiteName
	}

	availPath := filepath.Join(s.availableDir, cleanName)
	content, err := os.ReadFile(availPath)
	if err != nil {
		// Try reading with sudo if permission denied
		out, sudoErr := runCmd(ctx, "cat", availPath)
		if sudoErr == nil {
			content = []byte(out)
		} else {
			return "", false, ErrSiteNotFound
		}
	}

	enabledPath := filepath.Join(s.enabledDir, cleanName)
	_, errStat := os.Lstat(enabledPath)
	isEnabled := errStat == nil

	return string(content), isEnabled, nil
}

func (s *Service) SaveSiteContent(ctx context.Context, name, content string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	cleanName := filepath.Base(name)
	if cleanName == "." || cleanName == "/" || strings.Contains(cleanName, "..") {
		return ErrInvalidSiteName
	}

	availPath := filepath.Join(s.availableDir, cleanName)

	// Try direct write
	err := os.WriteFile(availPath, []byte(content), 0644)
	if err != nil {
		// Try via sudo tee
		cmd := exec.CommandContext(ctx, "sudo", "-n", "tee", availPath)
		cmd.Stdin = strings.NewReader(content)
		if out, sudoErr := cmd.CombinedOutput(); sudoErr != nil {
			return fmt.Errorf("không thể ghi file cấu hình %s: %s (%w)", availPath, string(out), sudoErr)
		}
	}

	return nil
}

func (s *Service) ToggleSite(ctx context.Context, name string, enable bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	cleanName := filepath.Base(name)
	if cleanName == "." || cleanName == "/" || strings.Contains(cleanName, "..") {
		return ErrInvalidSiteName
	}

	availPath := filepath.Join(s.availableDir, cleanName)
	enabledPath := filepath.Join(s.enabledDir, cleanName)

	if enable {
		// Create symlink
		_ = os.Remove(enabledPath)
		_, err := runCmd(ctx, "ln", "-s", availPath, enabledPath)
		if err != nil {
			return fmt.Errorf("không thể kích hoạt site %s: %w", cleanName, err)
		}
	} else {
		// Remove symlink
		_, err := runCmd(ctx, "rm", "-f", enabledPath)
		if err != nil {
			return fmt.Errorf("không thể tắt site %s: %w", cleanName, err)
		}
	}

	return nil
}

func (s *Service) DeleteSite(ctx context.Context, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	cleanName := filepath.Base(name)
	if cleanName == "." || cleanName == "/" || strings.Contains(cleanName, "..") {
		return ErrInvalidSiteName
	}

	enabledPath := filepath.Join(s.enabledDir, cleanName)
	availPath := filepath.Join(s.availableDir, cleanName)

	_, _ = runCmd(ctx, "rm", "-f", enabledPath)
	out, err := runCmd(ctx, "rm", "-f", availPath)
	if err != nil {
		return fmt.Errorf("xóa site %s thất bại: %s (%w)", cleanName, out, err)
	}

	return nil
}

func (s *Service) TestConfig(ctx context.Context) (bool, string) {
	out, err := runCmd(ctx, "nginx", "-t")
	if err != nil {
		return false, strings.TrimSpace(out)
	}
	return true, strings.TrimSpace(out)
}

func (s *Service) Reload(ctx context.Context) error {
	// Always test config first
	ok, out := s.TestConfig(ctx)
	if !ok {
		return fmt.Errorf("kiểm tra cấu hình nginx thất bại: %s", out)
	}

	// Try systemctl reload nginx
	outReload, err := runCmd(ctx, "systemctl", "reload", "nginx")
	if err != nil {
		// Fallback to nginx -s reload
		outS, errS := runCmd(ctx, "nginx", "-s", "reload")
		if errS != nil {
			return fmt.Errorf("reload nginx thất bại: %s / %s (%w)", outReload, outS, err)
		}
	}

	return nil
}
