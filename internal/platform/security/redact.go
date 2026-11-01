package security

import (
	"regexp"
	"strings"
)

var (
	// Regex patterns for sensitive credentials
	jwtPattern           = regexp.MustCompile(`(?i)eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}`)
	passwordKvPattern    = regexp.MustCompile(`(?i)(password|passwd|pwd|secret|token|api_key|apikey|auth_token|client_secret)\s*[:=]\s*["']?([^\s"'&,;]+)["']?`)
	bearerPattern        = regexp.MustCompile(`(?i)Bearer\s+([a-zA-Z0-9_\-\.]{15,})`)
	dbConnPattern        = regexp.MustCompile(`(?i)([a-z]+://[^:]+:)([^@]+)(@)`)
	privateKeyPattern    = regexp.MustCompile(`(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----`)
	genericSecretPattern = regexp.MustCompile(`(?i)(AWS_SECRET_ACCESS_KEY|PRIVATE_KEY|SECRET_KEY)\s*[:=]\s*([^\s"'&,;]+)`)
)

// RedactSecrets scans raw text and replaces sensitive tokens, passwords, keys with [REDACTED].
func RedactSecrets(text string) string {
	if text == "" {
		return ""
	}

	result := text

	// Redact private keys
	result = privateKeyPattern.ReplaceAllString(result, "[REDACTED PRIVATE KEY]")

	// Redact Database connection strings (e.g. postgres://user:pass@host -> postgres://user:[REDACTED]@host)
	result = dbConnPattern.ReplaceAllString(result, "${1}[REDACTED]${3}")

	// Redact Bearer tokens
	result = bearerPattern.ReplaceAllString(result, "Bearer [REDACTED]")

	// Redact JWT tokens
	result = jwtPattern.ReplaceAllString(result, "[REDACTED_JWT]")

	// Redact key-value password assignments
	result = passwordKvPattern.ReplaceAllStringFunc(result, func(m string) string {
		parts := strings.SplitN(m, "=", 2)
		sep := "="
		if len(parts) < 2 {
			parts = strings.SplitN(m, ":", 2)
			sep = ":"
		}
		if len(parts) == 2 {
			return parts[0] + sep + "[REDACTED]"
		}
		return m
	})

	// Redact generic secrets
	result = genericSecretPattern.ReplaceAllStringFunc(result, func(m string) string {
		parts := strings.SplitN(m, "=", 2)
		sep := "="
		if len(parts) < 2 {
			parts = strings.SplitN(m, ":", 2)
			sep = ":"
		}
		if len(parts) == 2 {
			return parts[0] + sep + "[REDACTED]"
		}
		return m
	})

	return result
}

// RedactMap takes a map of strings (like env vars) and redacts values whose keys or contents are sensitive.
func RedactMap(m map[string]string) map[string]string {
	if m == nil {
		return nil
	}
	out := make(map[string]string, len(m))
	sensitiveKeyPattern := regexp.MustCompile(`(?i)(password|secret|key|token|auth|credential|cert|private)`)

	for k, v := range m {
		if sensitiveKeyPattern.MatchString(k) {
			out[k] = "[REDACTED]"
		} else {
			out[k] = RedactSecrets(v)
		}
	}
	return out
}
