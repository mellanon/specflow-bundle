import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import {
  extractImplementationFiles,
  checkSpecCode,
} from "../../../src/lib/audit/check-spec-code";
import type { Feature } from "../../../src/types";

const TEST_DIR = "/tmp/specflow-audit-spec-code-test";

function makeFeature(overrides: Partial<Feature>): Feature {
  return {
    id: "F-1",
    name: "Test Feature",
    description: "desc",
    priority: 1,
    status: "pending",
    phase: "none",
    specPath: null,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    migratedFrom: null,
    quickStart: false,
    ...overrides,
  };
}

describe("extractImplementationFiles", () => {
  it("should extract backticked paths from table rows", () => {
    const spec = `# Feature

## Implementation Files

| File | Purpose |
|------|---------|
| \`src/commands/audit.ts\` | Command handler |
| \`src/lib/audit/runner.ts\` | Runner |

## Other Section
`;
    const files = extractImplementationFiles(spec);
    expect(files).toEqual(["src/commands/audit.ts", "src/lib/audit/runner.ts"]);
  });

  it("should extract backticked paths from list items", () => {
    const spec = `## Implementation Files

- \`src/commands/audit.ts\` -- Command handler
- \`src/lib/audit/types.ts\` -- Types

## Next Section
`;
    const files = extractImplementationFiles(spec);
    expect(files).toEqual(["src/commands/audit.ts", "src/lib/audit/types.ts"]);
  });

  it("should return empty array when section is missing", () => {
    const spec = `# Feature

## Some Other Section

Content here.
`;
    const files = extractImplementationFiles(spec);
    expect(files).toEqual([]);
  });

  it("should deduplicate paths", () => {
    const spec = `## Implementation Files

| File | Purpose |
|------|---------|
| \`src/lib/audit.ts\` | Main |
| \`src/lib/audit.ts\` | Duplicate |
`;
    const files = extractImplementationFiles(spec);
    expect(files).toEqual(["src/lib/audit.ts"]);
  });

  it("should skip header separator rows", () => {
    const spec = `## Implementation Files

| File | Purpose |
|------|---------|
| \`src/main.ts\` | Entry |
`;
    const files = extractImplementationFiles(spec);
    expect(files).toEqual(["src/main.ts"]);
    // The separator row should not produce any paths
  });
});

describe("checkSpecCode", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it("should report WARNING for files listed in spec but missing", () => {
    const specDir = join(TEST_DIR, "specs", "f-001");
    mkdirSync(specDir, { recursive: true });
    writeFileSync(
      join(specDir, "spec.md"),
      `## Implementation Files\n\n| File | Purpose |\n|------|------|\n| \`src/missing.ts\` | Missing |\n`
    );

    const features = [
      makeFeature({ id: "F-1", specPath: specDir }),
    ];

    const findings = checkSpecCode(features, TEST_DIR);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].check).toBe("spec-code");
    expect(findings[0].message).toContain("src/missing.ts");
    expect(findings[0].suggestedFix).toContain("specflow revise F-1");
  });

  it("should not report when spec-listed files exist", () => {
    const specDir = join(TEST_DIR, "specs", "f-001");
    const srcDir = join(TEST_DIR, "src");
    mkdirSync(specDir, { recursive: true });
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "exists.ts"), "// exists");
    writeFileSync(
      join(specDir, "spec.md"),
      `## Implementation Files\n\n- \`src/exists.ts\` -- exists\n`
    );

    const features = [makeFeature({ id: "F-1", specPath: specDir })];
    const findings = checkSpecCode(features, TEST_DIR);
    expect(findings).toEqual([]);
  });

  it("should skip features without specPath", () => {
    const features = [makeFeature({ id: "F-1", specPath: null })];
    const findings = checkSpecCode(features, TEST_DIR);
    expect(findings).toEqual([]);
  });

  it("should skip features where spec.md does not exist", () => {
    const features = [
      makeFeature({ id: "F-1", specPath: "/nonexistent/spec/dir" }),
    ];
    const findings = checkSpecCode(features, TEST_DIR);
    expect(findings).toEqual([]);
  });
});
