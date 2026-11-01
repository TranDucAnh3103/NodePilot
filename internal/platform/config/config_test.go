package config

import (
	"os"
	"testing"
)

func TestParseGitRepoURL(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"https://github.com/TranDucAnh3103/NodePilot.git", "TranDucAnh3103/NodePilot"},
		{"http://github.com/TranDucAnh3103/NodePilot.git", "TranDucAnh3103/NodePilot"},
		{"https://github.com/TranDucAnh3103/NodePilot", "TranDucAnh3103/NodePilot"},
		{"git@github.com:TranDucAnh3103/NodePilot.git", "TranDucAnh3103/NodePilot"},
		{"git@github.com:TranDucAnh3103/NodePilot", "TranDucAnh3103/NodePilot"},
		{"", ""},
		{"invalid-url", ""},
	}

	for _, tt := range tests {
		got := parseGitRepoURL(tt.input)
		if got != tt.expected {
			t.Errorf("parseGitRepoURL(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestDetectGitRepository(t *testing.T) {
	// 1. Env override takes priority
	_ = os.Setenv("GITHUB_REPOSITORY", "CustomOwner/CustomRepo")
	if repo := detectGitRepository(); repo != "CustomOwner/CustomRepo" {
		t.Fatalf("expected CustomOwner/CustomRepo, got %s", repo)
	}

	// 2. Unset env should detect from current workspace .git/config
	_ = os.Unsetenv("GITHUB_REPOSITORY")
	repo := detectGitRepository()
	if repo != "TranDucAnh3103/NodePilot" {
		t.Fatalf("expected TranDucAnh3103/NodePilot from git remote, got %s", repo)
	}
}
