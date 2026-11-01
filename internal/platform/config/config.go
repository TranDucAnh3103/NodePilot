package config

import (
	"crypto/rand"
	"encoding/hex"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
)

type Config struct {
	Host             string
	Port             int
	DBPath           string
	JWTSecret        string
	HelperSocketPath string
	AllowedOrigins   []string
	CollectIntervalS int
	MaxWSClients     int
	WatchtowerURL    string
	WatchtowerToken  string
	GitHubRepo       string
	Version          string
	Commit           string

	// --- Power management / hibernation ---
	// IdleCollectIntervalS is the sampling interval used when no UI client is
	// watching live metrics. 0 = full hibernation (collector sleeps until a
	// client asks for data; history & alerts pause while idle).
	IdleCollectIntervalS int
	// ActiveGraceS keeps the collector in active mode for a short time after
	// the last viewer leaves, so quick tab switches do not thrash.
	ActiveGraceS int
	// MemoryLimitMiB is a soft Go runtime memory limit (GOMEMLIMIT) used to
	// keep RSS inside the hardware budget. 0 = disabled.
	MemoryLimitMiB int

	// --- Cross-origin UI (e.g. Vercel-hosted frontend) ---
	CookieSecure   bool
	CookieSameSite string

	// --- Sprint 3 ---
	BackupDir       string
	BackupKeep      int
	TasksConfigPath string
	FileRoots       string
	Production      bool
}

var GitCommit = "01fb70c"

func LoadConfig() *Config {
	host := getEnv("HSCC_HOST", "127.0.0.1")
	portStr := getEnv("HSCC_PORT", "17880")

	// HSCC_ADDR (host:port) takes precedence - used by the Docker image.
	if addr := os.Getenv("HSCC_ADDR"); addr != "" {
		if h, p, err := net.SplitHostPort(addr); err == nil {
			host = h
			portStr = p
		}
	}

	port, err := strconv.Atoi(portStr)
	if err != nil {
		port = 17880
	}

	dbPath := getEnv("HSCC_DB_PATH", "./data/hscc.db")
	jwtSecret := getEnv("HSCC_JWT_SECRET", "")
	if jwtSecret == "" {
		// Generate random ephemeral secret if not set
		b := make([]byte, 32)
		_, _ = rand.Read(b)
		jwtSecret = hex.EncodeToString(b)
	}

	helperSocket := getEnv("HSCC_HELPER_SOCKET", "/run/hscc/helper.sock")
	if _, err := os.Stat("/run/hscc"); os.IsNotExist(err) {
		helperSocket = "./data/helper.sock"
	}

	production := runtime.GOOS == "linux" && dirExists("/etc/hscc")

	origins := []string{
		"http://127.0.0.1:17880",
		"http://localhost:17880",
		"http://localhost:5173",
		"http://127.0.0.1:5173",
		"https://*.vercel.app",
		"https://vercel.app",
	}
	for _, o := range strings.Split(os.Getenv("HSCC_ALLOWED_ORIGINS"), ",") {
		o = strings.TrimRight(strings.TrimSpace(o), "/")
		if o != "" {
			origins = append(origins, o)
		}
	}

	dataDir := filepath.Dir(dbPath)
	backupDir := getEnv("HSCC_BACKUP_DIR", "")
	if backupDir == "" {
		if production {
			backupDir = "/var/lib/hscc/backups"
		} else {
			backupDir = filepath.Join(dataDir, "backups")
		}
	}

	tasksPath := getEnv("HSCC_TASKS_CONFIG", "")
	if tasksPath == "" {
		if production {
			tasksPath = "/etc/hscc/tasks.yaml"
		} else {
			tasksPath = filepath.Join(dataDir, "tasks.yaml")
		}
	}

	fileRoots := getEnv("HSCC_FILE_ROOTS", "")
	if fileRoots == "" {
		fileRoots = "managed=" + filepath.Join(dataDir, "managed")
	}

	return &Config{
		Host:                 host,
		Port:                 port,
		DBPath:               dbPath,
		JWTSecret:            jwtSecret,
		HelperSocketPath:     helperSocket,
		AllowedOrigins:       origins,
		CollectIntervalS:     getInt("HSCC_COLLECT_INTERVAL_S", 3, 1),
		MaxWSClients:         getInt("HSCC_MAX_WS_CLIENTS", 3, 1),
		WatchtowerURL:        getEnv("WATCHTOWER_HTTP_URL", "http://watchtower:8080"),
		WatchtowerToken:      getEnv("WATCHTOWER_HTTP_TOKEN", "nodepilot-secret-watchtower-token"),
		GitHubRepo:           getEnv("GITHUB_REPOSITORY", detectGitRepository()),
		Version:              getEnv("HSCC_VERSION", "v1.0.0"),
		Commit:               getEnv("HSCC_COMMIT", GitCommit),
		IdleCollectIntervalS: getInt("HSCC_IDLE_COLLECT_INTERVAL_S", 60, 0),
		ActiveGraceS:         getInt("HSCC_ACTIVE_GRACE_S", 30, 0),
		MemoryLimitMiB:       getInt("HSCC_MEMORY_LIMIT_MIB", 100, 0),
		CookieSecure:         getBool("HSCC_COOKIE_SECURE", false),
		CookieSameSite:       normalizeSameSite(getEnv("HSCC_COOKIE_SAMESITE", "Strict")),
		BackupDir:            backupDir,
		BackupKeep:           getInt("HSCC_BACKUP_KEEP", 5, 1),
		TasksConfigPath:      tasksPath,
		FileRoots:            fileRoots,
		Production:           production,
	}
}

func normalizeSameSite(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "none":
		return "None"
	case "lax":
		return "Lax"
	default:
		return "Strict"
	}
}

func dirExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func getInt(key string, fallback, min int) int {
	v, err := strconv.Atoi(os.Getenv(key))
	if err != nil || v < min {
		return fallback
	}
	return v
}

func getBool(key string, fallback bool) bool {
	v, err := strconv.ParseBool(os.Getenv(key))
	if err != nil {
		return fallback
	}
	return v
}

func parseGitRepoURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	raw = strings.TrimSuffix(raw, ".git")

	// SSH format: git@github.com:OWNER/REPO
	if strings.HasPrefix(raw, "git@github.com:") {
		return strings.TrimPrefix(raw, "git@github.com:")
	}

	// HTTPS format: https://github.com/OWNER/REPO or http://...
	if idx := strings.Index(raw, "github.com/"); idx != -1 {
		return strings.TrimPrefix(raw[idx:], "github.com/")
	}

	return ""
}

func detectGitRepository() string {
	if repo := os.Getenv("GITHUB_REPOSITORY"); repo != "" {
		return strings.TrimSpace(repo)
	}

	// Try reading git config remote origin url via git CLI
	cmd := exec.Command("git", "config", "--get", "remote.origin.url")
	if out, err := cmd.Output(); err == nil {
		if repo := parseGitRepoURL(string(out)); repo != "" {
			return repo
		}
	}

	// Fallback to reading .git/config directly if git binary is absent
	if data, err := os.ReadFile(".git/config"); err == nil {
		lines := strings.Split(string(data), "\n")
		inRemoteOrigin := false
		for _, line := range lines {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "[remote \"origin\"]") {
				inRemoteOrigin = true
				continue
			} else if strings.HasPrefix(trimmed, "[") {
				inRemoteOrigin = false
			}
			if inRemoteOrigin && strings.HasPrefix(trimmed, "url =") {
				raw := strings.TrimSpace(strings.TrimPrefix(trimmed, "url ="))
				if repo := parseGitRepoURL(raw); repo != "" {
					return repo
				}
			}
		}
	}

	return "TranDucAnh3103/NodePilot"
}
