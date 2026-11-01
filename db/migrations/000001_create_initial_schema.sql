-- Migration 000001: Initial Schema for HSCC (Auth, Audit, Metrics, Actions, Managed Targets)

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON refresh_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON refresh_sessions(token_hash);

CREATE TABLE IF NOT EXISTS managed_targets (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('docker', 'systemd')),
    exact_identifier TEXT NOT NULL,
    allowed_actions_json TEXT NOT NULL,
    protected INTEGER NOT NULL DEFAULT 0,
    UNIQUE(kind, exact_identifier)
);

CREATE TABLE IF NOT EXISTS actions (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL,
    exact_target TEXT NOT NULL,
    operation TEXT NOT NULL,
    idempotency_key TEXT,
    state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'succeeded', 'failed', 'timed_out')),
    requested_at TEXT NOT NULL,
    completed_at TEXT,
    error_code TEXT,
    UNIQUE(actor_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_actions_actor ON actions(actor_id);
CREATE INDEX IF NOT EXISTS idx_actions_state ON actions(state);

CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    ts TEXT NOT NULL,
    actor_id TEXT,
    verb TEXT NOT NULL,
    target TEXT,
    result TEXT NOT NULL,
    request_id TEXT NOT NULL,
    details_redacted_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_id);

CREATE TABLE IF NOT EXISTS metric_samples (
    ts TEXT NOT NULL,
    metric TEXT NOT NULL,
    scope TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    granularity_seconds INTEGER NOT NULL,
    PRIMARY KEY (ts, metric, scope, granularity_seconds)
);

CREATE INDEX IF NOT EXISTS idx_metric_samples_query ON metric_samples(metric, scope, ts DESC);
