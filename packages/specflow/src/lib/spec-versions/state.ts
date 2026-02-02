/**
 * Spec Versions & Deltas State Module
 * SQLite state tracking for specification versioning and change deltas
 */

import { Database } from "bun:sqlite";
import type { SpecVersion, SpecDelta, SpecChangeType } from "../../types";

// =============================================================================
// Row Types
// =============================================================================

interface SpecVersionRow {
  id: number;
  feature_id: string;
  version: number;
  created_at: string;
  content_hash: string;
}

interface SpecDeltaRow {
  id: number;
  feature_id: string;
  from_version: number;
  to_version: number;
  change_type: string;
  section_path: string;
  diff_content: string | null;
}

// =============================================================================
// Internal DB Access
// =============================================================================

function getDb(): Database {
  const { getDbInstance } = require("../database") as {
    getDbInstance: () => Database;
  };
  return getDbInstance();
}

// =============================================================================
// Row Mapping
// =============================================================================

function rowToSpecVersion(row: SpecVersionRow): SpecVersion {
  return {
    id: row.id,
    featureId: row.feature_id,
    version: row.version,
    createdAt: new Date(row.created_at),
    contentHash: row.content_hash,
  };
}

function rowToSpecDelta(row: SpecDeltaRow): SpecDelta {
  return {
    id: row.id,
    featureId: row.feature_id,
    fromVersion: row.from_version,
    toVersion: row.to_version,
    changeType: row.change_type as SpecChangeType,
    sectionPath: row.section_path,
    diffContent: row.diff_content,
  };
}

// =============================================================================
// Spec Version Operations
// =============================================================================

/**
 * Create a new spec version snapshot
 */
export function createSpecVersion(
  featureId: string,
  contentHash: string
): SpecVersion {
  const db = getDb();
  const now = new Date().toISOString();

  // Get next version number for this feature
  const latest = db
    .query<{ max_version: number | null }, [string]>(
      `SELECT MAX(version) as max_version FROM spec_versions WHERE feature_id = ?`
    )
    .get(featureId);

  const nextVersion = (latest?.max_version ?? 0) + 1;

  db.run(
    `INSERT INTO spec_versions (feature_id, version, created_at, content_hash)
     VALUES (?, ?, ?, ?)`,
    [featureId, nextVersion, now, contentHash]
  );

  return getSpecVersion(featureId, nextVersion)!;
}

/**
 * Get a specific version of a feature's spec
 */
export function getSpecVersion(
  featureId: string,
  version: number
): SpecVersion | null {
  const db = getDb();
  const row = db
    .query<SpecVersionRow, [string, number]>(
      `SELECT * FROM spec_versions WHERE feature_id = ? AND version = ?`
    )
    .get(featureId, version);

  return row ? rowToSpecVersion(row) : null;
}

/**
 * Get the latest version of a feature's spec
 */
export function getLatestSpecVersion(
  featureId: string
): SpecVersion | null {
  const db = getDb();
  const row = db
    .query<SpecVersionRow, [string]>(
      `SELECT * FROM spec_versions WHERE feature_id = ?
       ORDER BY version DESC LIMIT 1`
    )
    .get(featureId);

  return row ? rowToSpecVersion(row) : null;
}

/**
 * Get all versions of a feature's spec
 */
export function getSpecVersions(featureId: string): SpecVersion[] {
  const db = getDb();
  const rows = db
    .query<SpecVersionRow, [string]>(
      `SELECT * FROM spec_versions WHERE feature_id = ?
       ORDER BY version ASC`
    )
    .all(featureId);

  return rows.map(rowToSpecVersion);
}

// =============================================================================
// Spec Delta Operations
// =============================================================================

/**
 * Create a delta record between two spec versions
 */
export function createSpecDelta(input: {
  featureId: string;
  fromVersion: number;
  toVersion: number;
  changeType: SpecChangeType;
  sectionPath: string;
  diffContent?: string;
}): SpecDelta {
  const db = getDb();

  const result = db.run(
    `INSERT INTO spec_deltas (feature_id, from_version, to_version, change_type, section_path, diff_content)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.featureId,
      input.fromVersion,
      input.toVersion,
      input.changeType,
      input.sectionPath,
      input.diffContent ?? null,
    ]
  );

  return getSpecDelta(Number(result.lastInsertRowid))!;
}

/**
 * Get a specific delta by ID
 */
export function getSpecDelta(id: number): SpecDelta | null {
  const db = getDb();
  const row = db
    .query<SpecDeltaRow, [number]>(
      `SELECT * FROM spec_deltas WHERE id = ?`
    )
    .get(id);

  return row ? rowToSpecDelta(row) : null;
}

/**
 * Get all deltas between two versions of a feature
 */
export function getSpecDeltas(
  featureId: string,
  fromVersion: number,
  toVersion: number
): SpecDelta[] {
  const db = getDb();
  const rows = db
    .query<SpecDeltaRow, [string, number, number]>(
      `SELECT * FROM spec_deltas
       WHERE feature_id = ? AND from_version = ? AND to_version = ?
       ORDER BY id ASC`
    )
    .all(featureId, fromVersion, toVersion);

  return rows.map(rowToSpecDelta);
}

/**
 * Get all deltas for a feature across all versions
 */
export function getAllSpecDeltas(featureId: string): SpecDelta[] {
  const db = getDb();
  const rows = db
    .query<SpecDeltaRow, [string]>(
      `SELECT * FROM spec_deltas WHERE feature_id = ?
       ORDER BY from_version ASC, to_version ASC, id ASC`
    )
    .all(featureId);

  return rows.map(rowToSpecDelta);
}

/**
 * Delete all versions and deltas for a feature (for reset/cleanup)
 */
export function deleteSpecHistory(featureId: string): void {
  const db = getDb();
  db.run(`DELETE FROM spec_deltas WHERE feature_id = ?`, [featureId]);
  db.run(`DELETE FROM spec_versions WHERE feature_id = ?`, [featureId]);
}
