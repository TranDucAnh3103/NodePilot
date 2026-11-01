package logging

import (
	"context"
	"io"
	"log/slog"
	"os"
	"strings"
)

type contextKey string

const (
	RequestIDKey contextKey = "requestId"
)

// InitLogger initializes the global structured logger.
func InitLogger(w io.Writer, level slog.Level) *slog.Logger {
	if w == nil {
		w = os.Stdout
	}
	opts := &slog.HandlerOptions{
		Level: level,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			// Redact potential secret keys
			k := strings.ToLower(a.Key)
			if strings.Contains(k, "password") ||
				strings.Contains(k, "token") ||
				strings.Contains(k, "secret") ||
				strings.Contains(k, "authorization") {
				return slog.String(a.Key, "[REDACTED]")
			}
			return a
		},
	}
	handler := slog.NewJSONHandler(w, opts)
	logger := slog.New(handler)
	slog.SetDefault(logger)
	return logger
}

// WithRequestID adds requestId to the context.
func WithRequestID(ctx context.Context, requestID string) context.Context {
	return context.WithValue(ctx, RequestIDKey, requestID)
}

// FromContext extracts request-aware logger.
func FromContext(ctx context.Context) *slog.Logger {
	logger := slog.Default()
	if reqID, ok := ctx.Value(RequestIDKey).(string); ok && reqID != "" {
		return logger.With(slog.String("requestId", reqID))
	}
	return logger
}
