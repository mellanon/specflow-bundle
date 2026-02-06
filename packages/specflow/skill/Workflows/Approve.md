# Approve Workflow

## Trigger Phrases
- "approve F-N"
- "reject F-N"
- "batch approve"
- "approve features"
- "make decision"
- "specflow approve"
- "specflow reject"

## Context Requirements
- [ ] SpecFlow project detected (`.specify/` exists)
- [ ] Feature ID(s) provided (or prompt for them)
- [ ] Review package exists (`.specify/review/{featureId}/review-package.md`)
- [ ] Feature is in review phase or has completed review

## Procedure

### Step 1: Read Review Package
```bash
cat .specify/review/<feature-id>/review-package.md
```

Review the package which contains:
- Automated check results (typecheck, lint, test)
- Acceptance test results with pass rates
- Spec-code file alignment
- Reviewer guide and decision checklist

### Step 2: Evaluate Pre-Approval Checklist

Present the human with the decision criteria:
- [ ] All automated checks pass?
- [ ] All acceptance tests pass?
- [ ] Spec alignment confirmed?
- [ ] No regressions detected?
- [ ] Implementation meets quality standards?

### Step 3: Execute Decision

**Option A: Approve (Single Feature)**
```bash
specflow approve <feature-id>
```
Feature transitions toward complete/evolve status, resolving the approval gate.

**Option B: Approve (Batch)**
```bash
specflow approve <feature-id-1> <feature-id-2> <feature-id-3>
```
Approve multiple features at once.

**Option C: Reject**
```bash
specflow reject <feature-id> --reason "<reason>" --code <DECISION_CODE>
```

Decision codes:
- `INCOMPLETE` — Missing artifacts or incomplete implementation
- `QUALITY` — Failed tests, poor code quality, or unmet standards
- `SPEC_DRIFT` — Implementation does not match specification
- `REGRESSION` — Introduced breaking changes or regressions

Feature returns to implement phase for fixes.

### Step 4: Present Results
STOP -- Display approval/rejection status and next steps.

If approved, suggest: "Run `specflow evolve <feature-id>` to analyze impact and plan next iteration."

If rejected, suggest: "Review rejection reason, fix issues, then run `specflow review <feature-id>` again."

## Error Handling

| Error | Action |
|-------|--------|
| No project found | Suggest `specflow init` |
| Feature not found | Show available features via `specflow status` |
| Review package missing | Suggest `specflow review <feature-id>` first |
| Wrong phase | Explain current phase, suggest running review first |
| Missing rejection reason | Prompt for `--reason` and `--code` |
| Invalid decision code | Show valid codes: INCOMPLETE, QUALITY, SPEC_DRIFT, REGRESSION |

## Notification Tiers

| Event | Tier | Action |
|-------|------|--------|
| Feature approved | review | Voice + desktop: "Feature N approved" |
| Batch approval complete | review | Voice: "Approved N features" |
| Feature rejected | critical | Voice + desktop: "Feature N rejected - [CODE]" |
<!-- F-12 INTEGRATION POINT -->
