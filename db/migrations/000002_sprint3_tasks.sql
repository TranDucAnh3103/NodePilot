-- Migration 000002: Sprint 3 Schema for Task Executions

CREATE TABLE IF NOT EXISTS task_executions (
    id TEXT PRIMARY KEY,
    preset_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_username TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'timed_out')),
    output TEXT NOT NULL DEFAULT '',
    exit_code INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_task_executions_preset ON task_executions(preset_id);
CREATE INDEX IF NOT EXISTS idx_task_executions_status ON task_executions(status);
CREATE INDEX IF NOT EXISTS idx_task_executions_started ON task_executions(started_at DESC);
