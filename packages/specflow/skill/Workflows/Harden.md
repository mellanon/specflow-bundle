# Harden Workflow

## Trigger Phrases
- "harden F-N"
- "acceptance test"
- "generate acceptance tests"
- "ingest results"
- "AT results"
- "harden history"
- "specflow harden"

## Context Requirements
- [ ] SpecFlow project detected (`.specify/` exists)
- [ ] Feature ID provided (or prompt for it)
- [ ] Feature is in `complete` phase (after implementation, before review)

## Overview

The Harden phase generates and validates acceptance tests for a completed feature. This is Phase 5 of the lifecycle (SPECIFY → PLAN → TASKS → IMPLEMENT → HARDEN → REVIEW → APPROVE → EVOLVE).

**Key Principle:** Acceptance tests are AI-generated, but HUMAN-executed and HUMAN-recorded. This workflow generates test templates that the human fills manually.

## Procedure

### Step 1: Generate Acceptance Test Template

```bash
specflow harden <feature-id>
```

This invokes Claude CLI to generate 3-5 workflow-level acceptance tests from the feature's spec and writes them to `.specify/harden/{featureId}/acceptance-test.md`.

**Preview mode:**
```bash
specflow harden <feature-id> --dry-run
```
Displays the generated tests without writing files.

**Template Structure:**
- Feature description context
- Setup: Prerequisites and initial state
- Numbered procedure steps (1-8 max)
- Verify criteria (binary testable: pass/fail)
- Result section where human records outcome

### Step 2: Human Execution (MANUAL)

STOP -- The human must now:
1. Open `.specify/harden/{featureId}/acceptance-test.md`
2. Execute each acceptance test manually
3. Record results in the template:
   - **Status:** `pass` / `fail` / `skip`
   - **Findings:** Evidence, observations, screenshots, logs

This is NOT automated. The human is the test executor.

### Step 3: Ingest Results

```bash
specflow harden <feature-id> --ingest
```

Parses the filled template, extracts results, and writes:
- `.specify/harden/{featureId}/results.json` (latest run)
- `.specify/harden/{featureId}/history/{timestamp}_run{N}.json` (timestamped snapshot)

Displays:
- Iteration number (run N)
- Delta info (pass changes, fixed/broken tests)
- Summary statistics

### Step 4: Review History (Optional)

```bash
specflow harden <feature-id> --history
```

Shows acceptance test history across iterations with:
- Iteration numbers and timestamps
- Pass rate trends (sparkline visualization)
- Test stability over time

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ HARDEN PHASE (Phase 5)                                      │
└─────────────────────────────────────────────────────────────┘

  1. Generate
     ↓
  specflow harden F-N
     │
     ├──→ [AI: Claude CLI]
     │     Analyze spec.md
     │     Generate 3-5 acceptance tests
     │
     └──→ Write acceptance-test.md template
           ↓

  2. Execute (HUMAN)
     ↓
  Open template
     │
     ├──→ Run AT-1: Login flow
     ├──→ Run AT-2: Data validation
     ├──→ Run AT-3: Error handling
     │
     └──→ Record pass/fail/skip + findings
           ↓

  3. Ingest
     ↓
  specflow harden F-N --ingest
     │
     ├──→ Parse template
     ├──→ Extract results
     ├──→ Write results.json
     ├──→ Archive to history/
     │
     └──→ Display iteration + delta
           ↓

  4. History (optional)
     ↓
  specflow harden F-N --history
     │
     └──→ Show trend across iterations
           ↓

  Next: specflow review F-N
```

## Error Handling

| Error | Action |
|-------|--------|
| No project found | Suggest `specflow init` |
| Feature not found | Show available features via `specflow features` |
| Feature not in complete phase | Explain current phase, suggest `specflow complete F-N` first |
| Template already exists (generate) | Warn user, suggest `--force` to overwrite or use `--ingest` to parse existing |
| Template not filled (ingest) | Detect unfilled status markers (`pass / fail / skip` separator), warn user to complete manual testing |
| No results to ingest | Error: "No acceptance-test.md found. Run `specflow harden F-N` first." |
| Parse error (ingest) | Show line number and expected format, suggest checking template structure |
| No history found | Error: "No test history. Run `specflow harden F-N --ingest` first." |

## Notification Tiers

| Event | Tier | Action |
|-------|------|--------|
| Template generated | harden | Voice: "Generated acceptance tests for Feature N" |
| Results ingested | harden | Voice: "Ingested N acceptance test results for Feature N" |
| All tests passing | harden | Voice: "All acceptance tests passing for Feature N" |
| Test failures detected | harden | Voice: "N acceptance tests failed for Feature N" |
<!-- F-12 INTEGRATION POINT -->

## Key Differences from Interactive Session (Deprecated)

**OLD (removed):**
- TC-based protocol with command loop
- AI-driven interactive session
- Real-time pass/fail recording

**NEW (current):**
- AI generates test template only
- Human fills template manually
- Batch ingestion of results

**Why:** Simpler, more reliable, gives human full control over test execution and evidence recording.

## Best Practices

1. **Generate early, iterate often** — Run `harden` as soon as feature is complete, re-run after fixes
2. **Detailed findings** — Record evidence in Findings section (screenshots, logs, error messages)
3. **Use skip judiciously** — Skip only when test is blocked/irrelevant, document why
4. **Track trends** — Use `--history` to spot flaky tests or regressions across iterations
5. **Before review** — Harden must pass before running `specflow review`

## Integration with Lifecycle

```
Phase 4: IMPLEMENT → complete
Phase 5: HARDEN → acceptance tests pass
Phase 6: REVIEW → automated checks + evidence compilation
Phase 7: APPROVE → human sign-off
```

Harden sits between implementation and review. It validates that the feature works end-to-end from a user's perspective before running automated checks.

## Example Session

```bash
# Feature just completed
$ specflow complete F-019

# Generate acceptance tests
$ specflow harden F-019
✓ Generated 4 acceptance tests
→ .specify/harden/f-019/acceptance-test.md

# Human opens file, executes tests, records results
# (manual step, not shown in CLI)

# Ingest results
$ specflow harden F-019 --ingest
✓ Ingested 4 test results (run 1)
  Pass: 3  Fail: 1  Skip: 0

  Fixed:  AT-3 (pass → fail)

→ Next: Fix failing test, re-run, or proceed to review

# View history after multiple iterations
$ specflow harden F-019 --history
Acceptance Test History (F-019)

Run 1  2026-02-06 14:23  75% ●●●○
Run 2  2026-02-06 15:41  100% ●●●●
Run 3  2026-02-07 09:15  100% ●●●●

Sparkline: ▅██
```

## Related Workflows

- **Complete**: Marks feature done, prerequisite for harden
- **Review**: Runs after harden, compiles evidence and automated checks
- **Revise**: Update spec/tasks if acceptance tests reveal missing requirements
- **Status**: Shows harden phase progress across all features
