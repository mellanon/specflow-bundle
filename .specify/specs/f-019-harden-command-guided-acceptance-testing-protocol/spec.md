# Specification: Harden command — acceptance test generation and ingestion

> Updated 2026-02-06 — revised during lifecycle extension dogfooding. Interactive session retired. Human fills acceptance-test.md template directly.

## Overview

`specflow harden <feature-id>` generates a structured acceptance test template (3-5 workflow-level tests via AI) and writes it to `.specify/harden/{feature_id}/acceptance-test.md`. The human fills in the template with pass/fail/skip results and evidence, then runs `specflow harden <feature-id> --ingest` to parse the filled template and write structured results.

This replaces the previous interactive readline-based session with a simpler, document-driven workflow. The acceptance-test.md IS the protocol — there is no separate protocol.md or interactive loop.

## User Scenarios

### Scenario 1: Generate acceptance test template

- **Given** feature F-11 has a completed `spec.md` with functional requirements and scenarios
- **When** the operator runs `specflow harden F-11`
- **Then** the command generates `.specify/harden/f-11/acceptance-test.md` containing 3-5 workflow-level acceptance tests with setup, steps, verify criteria, and result sections

### Scenario 2: Batch generation for all features

- **Given** multiple features are at implement phase
- **When** the operator runs `specflow harden --all`
- **Then** acceptance test templates are generated in parallel for all eligible features

### Scenario 3: Human fills template and ingests results

- **Given** acceptance-test.md has been generated for F-11
- **When** the human fills in status (pass/fail/skip) and evidence for each AT, then runs `specflow harden F-11 --ingest`
- **Then** the command parses the filled template, writes `.specify/harden/f-11/results.json`, and reports pass/fail summary

### Scenario 4: All tests pass — feature eligible for review

- **Given** all acceptance tests have status "pass" after ingest
- **When** results are recorded
- **Then** the feature is eligible for `specflow review` and eventually `specflow approve`

### Scenario 5: Test failures — feature returned to implement

- **Given** one or more acceptance tests have status "fail" after ingest
- **When** results are recorded
- **Then** the feature phase is set back to IMPLEMENT with failures documented in results.json

### Scenario 6: Check harden status across features

- **Given** acceptance test templates and/or results exist for multiple features
- **When** the operator runs `specflow harden --status`
- **Then** the command displays a table showing per-feature AT counts (total, pass, fail, skip, pending)

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Generate 3-5 workflow-level acceptance tests per feature using AI (Claude headless) | High |
| FR-2 | Fall back to spec-based extraction if AI generation fails | High |
| FR-3 | Write acceptance test template to `.specify/harden/{feature_id}/acceptance-test.md` | High |
| FR-4 | Each AT includes: ID (AT-N), title, covers, setup, steps, verify (binary testable), result section | High |
| FR-5 | `--ingest` flag parses filled acceptance-test.md and extracts per-AT status and evidence | High |
| FR-6 | `--ingest` writes structured results to `.specify/harden/{feature_id}/results.json` | High |
| FR-7 | On all-pass (ingest): feature eligible for review | High |
| FR-8 | On any-fail (ingest): feature phase set to IMPLEMENT | High |
| FR-9 | `--status` shows AT-level counts from results.json or acceptance-test.md | Medium |
| FR-10 | `--all` processes all features at implement/harden phase | Medium |
| FR-11 | Validate feature has completed TASKS phase before allowing harden (phase gate) | High |
| FR-12 | `--all --ingest` batch ingests all features with filled templates | Medium |

## Non-Functional Requirements

### Reliability
- Template files written atomically (temp + rename for results.json)
- AI generation failure falls back gracefully to spec-based extraction

### Performance
- Batch generation runs in parallel (5 concurrent)
- Template generation should complete within interactive response time

### Compatibility
- acceptance-test.md is a standalone, human-readable markdown document
- results.json is machine-readable for review integration (F-024)

## Implementation Files

| File | Purpose |
|------|---------|
| `src/commands/harden.ts` | Command handler, CLI flags, batch orchestration |
| `src/lib/harden/workflow-test-generator.ts` | AI-powered test generation via Claude |
| `src/lib/harden/acceptance-spec-generator.ts` | Renders tests to markdown template |
| `src/lib/harden/acceptance-spec-ingest.ts` | Parses filled template, writes results.json |

## Removed (from original spec)

The following were part of the original F-019 spec and have been retired:

- Interactive readline-based test execution loop (harden-session.ts)
- Spec parsing for TC-level test case extraction (spec-parser.ts)
- Protocol.md generation with TC-N format (protocol-writer.ts)
- Harden report generation (report-writer.ts)
- Operator steering commands (skip, add, retry, run)
- Session resume from database
- harden_sessions and harden_test_cases database tables (tables remain for migration safety)

## Success Criteria

- [ ] `specflow harden F-N` generates acceptance-test.md with 3-5 workflow tests
- [ ] `specflow harden --all` generates templates for all eligible features in parallel
- [ ] `specflow harden F-N --ingest` parses filled template and writes results.json
- [ ] All-pass ingest leaves feature eligible for review
- [ ] Failed ingest returns feature to implement phase
- [ ] `specflow harden --status` shows AT-level counts per feature
- [ ] AI fallback works when Claude is unavailable
