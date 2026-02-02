-- Harden sessions and test cases for acceptance testing protocol
CREATE TABLE IF NOT EXISTS harden_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  result TEXT NOT NULL DEFAULT 'incomplete'
    CHECK (result IN ('pass', 'fail', 'incomplete')),
  total_tests INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  protocol_path TEXT NOT NULL,
  report_path TEXT,
  FOREIGN KEY (feature_id) REFERENCES features(id)
);
CREATE INDEX idx_harden_sessions_feature ON harden_sessions(feature_id);

CREATE TABLE IF NOT EXISTS harden_test_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  test_id TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT NOT NULL,
  test_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (test_type IN ('automated', 'manual', 'hybrid')),
  preconditions TEXT,
  steps TEXT NOT NULL,
  expected_result TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'pass', 'fail', 'skipped')),
  notes TEXT,
  executed_at TEXT,
  FOREIGN KEY (session_id) REFERENCES harden_sessions(id)
);
CREATE INDEX idx_harden_test_cases_session ON harden_test_cases(session_id);
