-- Migration 008: approval_gates
-- Stores approval gate state for human-in-the-loop pipeline control

CREATE TABLE IF NOT EXISTS approval_gates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feature_id TEXT NOT NULL,
    phase_boundary TEXT NOT NULL,
    urgency TEXT NOT NULL CHECK (urgency IN ('critical', 'review', 'ambient')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'auto_approved', 'timed_out')),
    triggered_at TEXT NOT NULL,
    resolved_at TEXT,
    timeout_at TEXT,
    resolved_by TEXT,
    rejection_reason TEXT,
    FOREIGN KEY (feature_id) REFERENCES features(id)
);

CREATE INDEX idx_approval_gates_pending ON approval_gates(status) WHERE status = 'pending';
CREATE INDEX idx_approval_gates_feature ON approval_gates(feature_id);
