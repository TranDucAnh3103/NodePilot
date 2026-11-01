package infra

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"hscc/internal/platform/config"
	"hscc/internal/platform/sqlite"
)

type VersionInfo struct {
	CurrentVersion string `json:"currentVersion"`
	CurrentCommit  string `json:"currentCommit"`
	Repository     string `json:"repository"`
	GoVersion      string `json:"goVersion"`
	BuildTime      string `json:"buildTime"`
}

type UpdateCheckResult struct {
	HasUpdate      bool   `json:"hasUpdate"`
	CurrentVersion string `json:"currentVersion"`
	CurrentCommit  string `json:"currentCommit"`
	LatestVersion  string `json:"latestVersion"`
	LatestCommit   string `json:"latestCommit"`
	CommitMessage  string `json:"commitMessage"`
	Author         string `json:"author"`
	PublishedAt    string `json:"publishedAt"`
	ReleaseNotes   string `json:"releaseNotes"`
	Repository     string `json:"repository"`
	UpdateMethod   string `json:"updateMethod"`
}

type TriggerResult struct {
	Status    string `json:"status"`
	Message   string `json:"message"`
	TriggeredAt string `json:"triggeredAt"`
}

type UpdateService struct {
	cfg        *config.Config
	db         *sqlite.DB
	httpClient *http.Client
}

func NewUpdateService(cfg *config.Config, db *sqlite.DB) *UpdateService {
	return &UpdateService{
		cfg: cfg,
		db:  db,
		httpClient: &http.Client{
			Timeout: 6 * time.Second,
		},
	}
}

func (s *UpdateService) GetVersionInfo() *VersionInfo {
	return &VersionInfo{
		CurrentVersion: s.cfg.Version,
		CurrentCommit:  s.cfg.Commit,
		Repository:     s.cfg.GitHubRepo,
		GoVersion:      "go1.26.0",
		BuildTime:      time.Now().UTC().Format(time.RFC3339),
	}
}

// CheckUpdate checks GitHub for the latest commit or release
func (s *UpdateService) CheckUpdate(ctx context.Context) (*UpdateCheckResult, error) {
	result := &UpdateCheckResult{
		HasUpdate:      false,
		CurrentVersion: s.cfg.Version,
		CurrentCommit:  s.cfg.Commit,
		LatestVersion:  s.cfg.Version,
		LatestCommit:   s.cfg.Commit,
		Repository:     s.cfg.GitHubRepo,
		UpdateMethod:   "watchtower",
		PublishedAt:    time.Now().UTC().Format(time.RFC3339),
	}

	repo := s.cfg.GitHubRepo
	if repo == "" {
		repo = "StephenDuc2006/NodePilot-homeserver"
	}

	// 1. Query latest commit from GitHub API
	reqURL := fmt.Sprintf("https://api.github.com/repos/%s/commits?per_page=1", repo)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return result, fmt.Errorf("failed to create update request: %w", err)
	}

	req.Header.Set("User-Agent", "NodePilot-HSCC/1.0 (Homeserver Control Center)")
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		slog.Warn("failed to check github update (network error)", slog.String("error", err.Error()))
		result.ReleaseNotes = "Không thể kết nối đến máy chủ GitHub để kiểm tra phiên bản."
		return result, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		slog.Warn("github api returned non-200", slog.Int("status", resp.StatusCode))
		result.ReleaseNotes = fmt.Sprintf("GitHub API phản hồi mã: %d. Tạm thời không thể kiểm tra bản mới.", resp.StatusCode)
		return result, nil
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return result, nil
	}

	var commits []struct {
		SHA    string `json:"sha"`
		Commit struct {
			Message string `json:"message"`
			Author  struct {
				Name string    `json:"name"`
				Date time.Time `json:"date"`
			} `json:"author"`
		} `json:"commit"`
	}

	if err := json.Unmarshal(bodyBytes, &commits); err == nil && len(commits) > 0 {
		latestSHA := commits[0].SHA
		shortLatest := latestSHA
		if len(shortLatest) > 7 {
			shortLatest = shortLatest[:7]
		}

		shortCurrent := s.cfg.Commit
		if len(shortCurrent) > 7 {
			shortCurrent = shortCurrent[:7]
		}

		result.LatestCommit = shortLatest
		result.CommitMessage = strings.Split(commits[0].Commit.Message, "\n")[0]
		result.Author = commits[0].Commit.Author.Name
		result.PublishedAt = commits[0].Commit.Author.Date.Format(time.RFC3339)

		// Compare short hashes
		if shortCurrent != "" && shortCurrent != "dev" && !strings.HasPrefix(latestSHA, shortCurrent) {
			result.HasUpdate = true
			result.LatestVersion = "Latest (Git " + shortLatest + ")"
		}
	}

	return result, nil
}

// TriggerUpdate calls Watchtower HTTP API to perform zero-downtime container update
func (s *UpdateService) TriggerUpdate(ctx context.Context, actorID string, reqID string) (*TriggerResult, error) {
	now := time.Now().UTC()

	// 1. Record immutable audit event in SQLite
	auditID := "aud_" + uuid.NewString()[:8]
	detailsJSON, _ := json.Marshal(map[string]interface{}{
		"watchtowerUrl": s.cfg.WatchtowerURL,
		"triggeredBy":   actorID,
		"method":        "watchtower_http_api",
	})

	_, _ = s.db.ExecContext(ctx,
		`INSERT INTO audit_events (id, ts, actor_id, verb, target, result, request_id, details_redacted_json)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		auditID, now.Format(time.RFC3339), actorID, "SYSTEM_UPDATE", "container://nodepilot-hscc-api",
		"TRIGGERED", reqID, string(detailsJSON),
	)

	// 2. Call Watchtower HTTP API
	watchtowerURL := fmt.Sprintf("%s/v1/update", strings.TrimRight(s.cfg.WatchtowerURL, "/"))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, watchtowerURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to prepare watchtower request: %w", err)
	}

	if s.cfg.WatchtowerToken != "" {
		req.Header.Set("Authorization", "Bearer "+s.cfg.WatchtowerToken)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		slog.Warn("watchtower http api unreachable (standalone or dev mode)", slog.String("error", err.Error()))
		return &TriggerResult{
			Status:      "simulated",
			Message:     "Lệnh cập nhật đã ghi nhận vào nhật ký kiểm toán. Watchtower daemon chưa kết nối qua socket mạng cục bộ.",
			TriggeredAt: now.Format(time.RFC3339),
		}, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		slog.Error("watchtower update returned error", slog.Int("statusCode", resp.StatusCode))
		return nil, fmt.Errorf("watchtower update failed with status: %d", resp.StatusCode)
	}

	return &TriggerResult{
		Status:      "in_progress",
		Message:     "Watchtower đang kéo image mới nhất từ GHCR và tự động khởi động lại container.",
		TriggeredAt: now.Format(time.RFC3339),
	}, nil
}
