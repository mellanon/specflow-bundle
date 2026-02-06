-- UP
DROP TABLE IF EXISTS harden_test_cases;
DROP TABLE IF EXISTS harden_sessions;

-- DOWN
CREATE TABLE IF NOT EXISTS harden_sessions (
  id TEXT PRIMARY KEY,
  feature_id TEXT NOT NULL REFERENCES features(id),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),
  iteration INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS harden_test_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES harden_sessions(id),
  feature_id TEXT NOT NULL REFERENCES features(id),
  name TEXT NOT NULL,
  test_type TEXT NOT NULL CHECK (test_type IN ('acceptance', 'edge_case', 'regression', 'integration')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'pass', 'fail', 'skip')),
  evidence TEXT,
  created_at TEXT NOT NULL,
  executed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_harden_sessions_feature ON harden_sessions(feature_id);
CREATE INDEX IF NOT EXISTS idx_harden_test_cases_session ON harden_test_cases(session_id);
CREATE INDEX IF NOT EXISTS idx_harden_test_cases_feature ON harden_test_cases(feature_id);
