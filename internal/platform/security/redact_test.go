package security

import (
	"strings"
	"testing"
)

func TestRedactSecrets(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "Database Connection URL",
			input:    "Connecting to postgres://admin:MySecretPass123!@localhost:5432/mydb",
			expected: "Connecting to postgres://admin:[REDACTED]@localhost:5432/mydb",
		},
		{
			name:     "Bearer Authorization Header",
			input:    "Authorization: Bearer my-super-secret-bearer-token-12345",
			expected: "Authorization: Bearer [REDACTED]",
		},
		{
			name:     "Password Key Value",
			input:    "Config loaded with password=SuperSecretPassword! and port=8080",
			expected: "Config loaded with password=[REDACTED] and port=8080",
		},
		{
			name:     "Plain text without secrets",
			input:    "Server listening on port 17880 with 4 workers",
			expected: "Server listening on port 17880 with 4 workers",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := RedactSecrets(tc.input)
			if got != tc.expected {
				t.Errorf("expected %q, got %q", tc.expected, got)
			}
		})
	}
}

func TestRedactMap(t *testing.T) {
	env := map[string]string{
		"DB_PASSWORD":  "mypassword123",
		"API_KEY":      "secret-key-xyz",
		"PORT":         "8080",
		"DATABASE_URL": "mysql://user:rootpass@db:3306/app",
	}

	redacted := RedactMap(env)
	if redacted["DB_PASSWORD"] != "[REDACTED]" {
		t.Errorf("expected DB_PASSWORD to be [REDACTED], got %s", redacted["DB_PASSWORD"])
	}
	if redacted["API_KEY"] != "[REDACTED]" {
		t.Errorf("expected API_KEY to be [REDACTED], got %s", redacted["API_KEY"])
	}
	if redacted["PORT"] != "8080" {
		t.Errorf("expected PORT to remain unchanged, got %s", redacted["PORT"])
	}
	if strings.Contains(redacted["DATABASE_URL"], "rootpass") {
		t.Errorf("DATABASE_URL password was not redacted: %s", redacted["DATABASE_URL"])
	}
}
