-- Migration 009: pipeline_failures
-- Tracks pipeline failure state for graceful degradation and resume

CREATE TABLE IF NOT EXISTS pipeline_failures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feature_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    missing_artifacts TEXT NOT NULL,
    error_message TEXT,
    last_successful_phase TEXT,
    resume_count INTEGER NOT NULL DEFAULT 0,
    blocked_at TEXT NOT NULL,
    resolved_at TEXT,
    FOREIGN KEY (feature_id) REFERENCES features(id)
);

CREATE INDEX idx_pipeline_failures_feature ON pipeline_failures(feature_id);
CREATE INDEX idx_pipeline_failures_unresolved ON pipeline_failures(resolved_at) WHERE resolved_at IS NULL;
