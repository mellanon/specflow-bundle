-- UP
-- Add spec versioning and delta tracking tables
-- Tracks specification evolution across versions with ADDED/MODIFIED/REMOVED change types

CREATE TABLE IF NOT EXISTS spec_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  FOREIGN KEY (feature_id) REFERENCES features(id),
  UNIQUE(feature_id, version)
);

CREATE TABLE IF NOT EXISTS spec_deltas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id TEXT NOT NULL,
  from_version INTEGER NOT NULL,
  to_version INTEGER NOT NULL,
  change_type TEXT NOT NULL CHECK(change_type IN ('ADDED', 'MODIFIED', 'REMOVED')),
  section_path TEXT NOT NULL,
  diff_content TEXT,
  FOREIGN KEY (feature_id) REFERENCES features(id)
);

CREATE INDEX IF NOT EXISTS idx_spec_versions_feature_id ON spec_versions(feature_id);
CREATE INDEX IF NOT EXISTS idx_spec_deltas_lookup ON spec_deltas(feature_id, from_version, to_version);

-- DOWN
DROP INDEX IF EXISTS idx_spec_deltas_lookup;
DROP INDEX IF EXISTS idx_spec_versions_feature_id;
DROP TABLE IF EXISTS spec_deltas;
DROP TABLE IF EXISTS spec_versions;
