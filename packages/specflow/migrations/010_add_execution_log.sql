-- Migration 010: execution_log
-- Phase-level execution audit trail for pipeline tracking

CREATE TABLE IF NOT EXISTS execution_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feature_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    duration_seconds INTEGER,
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'skipped', 'blocked')),
    git_sha_before TEXT,
    git_sha_after TEXT,
    artifacts_produced TEXT,
    error_message TEXT,
    FOREIGN KEY (feature_id) REFERENCES features(id)
);

CREATE INDEX idx_execution_log_feature ON execution_log(feature_id);
CREATE INDEX idx_execution_log_feature_phase ON execution_log(feature_id, phase);
