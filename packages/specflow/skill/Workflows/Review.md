# Review Workflow

## Trigger Phrases
- "review F-N"
- "compile review"
- "review package"
- "evidence"
- "specflow review"
- "check implementation quality"

## Context Requirements
- [ ] SpecFlow project detected (`.specify/` exists)
- [ ] Feature ID provided (or prompt for it)
- [ ] Feature is in `harden` or later phase
- [ ] Harden results exist (`.specify/harden/{featureId}/results.json`)

## Procedure

### Step 1: Compile Evidence
```bash
specflow review <feature-id>
```

This compiles the review package by:
- Running automated checks (typecheck, lint, test)
- Reading harden results from `.specify/harden/{featureId}/results.json`
- Verifying file alignment (spec files exist where expected)
- Generating `.specify/review/{featureId}/review-package.md`
- Writing structured data to `.specify/review/{featureId}/review.json`

### Step 2: Present Review Package
STOP -- Display the location of the review package and a summary of results:
- Automated check pass/fail status
- Acceptance test pass rate
- File alignment status
- Path to review-package.md

The review package contains:
- Feature metadata (ID, name, spec hash)
- Automated check results (pass/fail for each check)
- Acceptance test results with pass rates and iteration history
- File alignment verification
- Reviewer guide: binary checklist, artifact paths, approve/reject commands

### Step 3: Human Review
The human reads the review package (`.specify/review/{featureId}/review-package.md`) and makes a decision.

**Key principle:** There is NO AI in the review loop. No autofix. The review package tells the human what they're deciding, where to look, and what to do.

### Step 4: Await Decision
Present options via AskUserQuestion:
- **Approve**: `specflow approve <feature-id>` (proceed to evolve phase)
- **Reject**: `specflow reject <feature-id> --reason "<reason>"` (block evolution, require fixes)

### Step 5: Notification
```bash
curl -s -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Review package compiled for Feature <ID>"}'
```
<!-- F-12 INTEGRATION POINT -->

## Error Handling

| Error | Action |
|-------|--------|
| No project found | Suggest `specflow init` |
| Feature not found | Show available features |
| Wrong phase | Explain current phase, suggest `specflow harden` if not run yet |
| No harden results | Suggest `specflow harden <feature-id> --ingest` to generate results |
| Automated checks failed | Include failure details in review package, still generate package |
| File alignment failed | Include missing/extra files in review package |

## Notification Tiers

| Event | Tier | Action |
|-------|------|--------|
| Review package compiled | review | Voice: "Review package ready for Feature N" |
| Review compilation failed | critical | Voice: "Review compilation failed for Feature N" + error details |
| All checks passed | ambient | Voice: "All automated checks passed for Feature N" |
| Checks failed | review | Voice: "Some checks failed - see review package" |
<!-- F-12 INTEGRATION POINT -->
