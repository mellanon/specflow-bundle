/**
 * Evolve Module
 * Greenfield-to-brownfield handoff: snapshot spec, build manifest, transition status
 */

import { join } from "path";
import { existsSync, readFileSync, copyFileSync, mkdirSync, writeFileSync, renameSync, readdirSync, statSync } from "fs";
import { execSync } from "child_process";
import { createHash } from "crypto";
import type { EvolveManifest, EvolveArtifact, EvolveResult, Feature } from "../types";
import { hashContent } from "./spec-versions/hashing";

/**
 * Classify a file path into an artifact type
 */
function classifyArtifact(filePath: string): EvolveArtifact["type"] {
  if (/\.test\.(ts|tsx|js|jsx)$/.test(filePath)) return "test";
  if (/migrations\//.test(filePath)) return "migration";
  if (/spec.*\.md$/.test(filePath) || /plan\.md$/.test(filePath) || /tasks\.md$/.test(filePath)) return "spec";
  if (/\.(config|json|yaml|yml)$/.test(filePath)) return "config";
  return "source";
}

/**
 * Hash a file's contents
 */
function hashFile(filePath: string): string {
  const content = readFileSync(filePath, "utf-8");
  return `sha256:${hashContent(content)}`;
}

/**
 * Discover artifacts using git diff between execution log SHAs
 * Falls back to listing spec directory files
 */
export function discoverArtifacts(
  projectPath: string,
  feature: Feature
): EvolveArtifact[] {
  const artifacts: EvolveArtifact[] = [];

  // Try git-based discovery using execution log
  try {
    const { getDbInstance } = require("./database") as { getDbInstance: () => any };
    const db = getDbInstance();

    // Find first and last git SHAs for this feature
    const rows = db.query(
      `SELECT git_sha_before, git_sha_after FROM execution_log
       WHERE feature_id = ? AND git_sha_before IS NOT NULL AND git_sha_after IS NOT NULL
       ORDER BY started_at ASC`
    ).all(feature.id) as Array<{ git_sha_before: string; git_sha_after: string }>;

    if (rows.length > 0) {
      const firstSha = rows[0].git_sha_before;
      const lastSha = rows[rows.length - 1].git_sha_after;

      const output = execSync(`git diff --name-only ${firstSha} ${lastSha}`, {
        cwd: projectPath,
        encoding: "utf-8",
      });

      const files = output.trim().split("\n").filter((f) => f.length > 0);
      for (const file of files) {
        const fullPath = join(projectPath, file);
        if (existsSync(fullPath)) {
          artifacts.push({
            path: file,
            type: classifyArtifact(file),
            content_hash: hashFile(fullPath),
          });
        }
      }

      if (artifacts.length > 0) return artifacts;
    }
  } catch {
    // Fall through to spec directory fallback
  }

  // Fallback: list files in spec directory
  if (feature.specPath && existsSync(feature.specPath)) {
    const files = readdirSync(feature.specPath);
    for (const file of files) {
      const fullPath = join(feature.specPath, file);
      if (statSync(fullPath).isFile()) {
        artifacts.push({
          path: join(feature.specPath, file).replace(projectPath + "/", ""),
          type: classifyArtifact(file),
          content_hash: hashFile(fullPath),
        });
      }
    }
  }

  return artifacts;
}

/**
 * Write baseline files atomically
 */
export function writeBaseline(
  projectPath: string,
  featureId: string,
  specContent: string,
  manifest: EvolveManifest
): { baselinePath: string; manifestPath: string; specSnapshotPath: string } {
  const baselinePath = join(projectPath, ".specify", "baselines", featureId.toLowerCase());
  mkdirSync(baselinePath, { recursive: true });

  const specSnapshotPath = join(baselinePath, "spec-v1.0.md");
  const manifestPath = join(baselinePath, "manifest.json");

  // Copy spec byte-for-byte
  if (manifest.spec_baseline) {
    writeFileSync(specSnapshotPath, specContent);
  }

  // Atomic write for manifest
  const tmpPath = manifestPath + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(manifest, null, 2));
  renameSync(tmpPath, manifestPath);

  return { baselinePath, manifestPath, specSnapshotPath };
}

/**
 * Evolve a completed feature into brownfield mode
 */
export function evolveFeature(
  projectPath: string,
  feature: Feature,
  options: { dryRun: boolean; json: boolean }
): EvolveResult {
  // Validate status
  if (feature.status === "evolving") {
    throw new Error(
      `Feature ${feature.id} is already in brownfield mode. Use 'specflow brownfield scan' for subsequent iterations.`
    );
  }

  if (feature.status !== "complete") {
    throw new Error(
      `Feature ${feature.id} must be complete before evolving (current status: ${feature.status}).`
    );
  }

  if (!feature.specPath) {
    throw new Error(`Feature ${feature.id} has no spec path set.`);
  }

  const specFile = join(feature.specPath, "spec.md");
  if (!existsSync(specFile)) {
    throw new Error(`spec.md not found at ${specFile}`);
  }

  const specContent = readFileSync(specFile, "utf-8");
  const specHash = `sha256:${hashContent(specContent)}`;

  // Discover artifacts
  const artifacts = discoverArtifacts(projectPath, feature);

  const manifest: EvolveManifest = {
    feature_id: feature.id,
    feature_name: feature.name,
    evolved_at: new Date().toISOString(),
    baseline_version: "1.0",
    spec_baseline: "spec-v1.0.md",
    spec_content_hash: specHash,
    artifacts,
  };

  const baselinePath = join(projectPath, ".specify", "baselines", feature.id.toLowerCase());
  const manifestPath = join(baselinePath, "manifest.json");
  const specSnapshotPath = join(baselinePath, "spec-v1.0.md");

  if (options.dryRun) {
    return {
      feature_id: feature.id,
      feature_name: feature.name,
      baseline_path: baselinePath,
      manifest_path: manifestPath,
      spec_snapshot_path: specSnapshotPath,
      artifact_count: artifacts.length,
      status: "evolving",
    };
  }

  // Write baseline
  writeBaseline(projectPath, feature.id, specContent, manifest);

  // Create spec version entry
  try {
    const { createSpecVersion } = require("./spec-versions/state") as {
      createSpecVersion: (featureId: string, hash: string) => any;
    };
    createSpecVersion(feature.id, hashContent(specContent));
  } catch {
    // Non-fatal if spec_versions table issue
  }

  // Update feature status
  const { updateFeatureStatus, getDb: _getDb } = require("./database") as {
    updateFeatureStatus: (id: string, status: any) => void;
    getDb: () => any;
  };
  updateFeatureStatus(feature.id, "evolving");

  // Set baseline_path
  try {
    const { getDbInstance } = require("./database") as { getDbInstance: () => any };
    const db = getDbInstance();
    db.run(`UPDATE features SET baseline_path = ? WHERE id = ?`, [baselinePath, feature.id]);
  } catch {
    // Non-fatal
  }

  return {
    feature_id: feature.id,
    feature_name: feature.name,
    baseline_path: baselinePath,
    manifest_path: manifestPath,
    spec_snapshot_path: specSnapshotPath,
    artifact_count: artifacts.length,
    status: "evolving",
  };
}
