# Review Workflow

## Trigger Phrases
- "review F-N"
- "check implementation"
- "run review"
- "specflow review"

## Context Requirements
- [ ] SpecFlow project detected (`.specify/` exists)
- [ ] Feature ID provided (or prompt for it)
- [ ] Feature is complete or in implement phase

## Procedure

### Step 1: Run Review
```bash
specflow review <feature-id>
```

This runs automated checks (typecheck, lint, test) and verifies spec-code alignment.

### Step 2: Present Results
STOP -- Display pass/fail results per check category.

If review fails, offer options:
- "Fix the issues and re-run review"
- "Run `specflow revise <feature-id>` to update artifacts"

## Error Handling

| Error | Action |
|-------|--------|
| No project found | Suggest `specflow init` |
| Feature not found | Show available features |
| Review checks failed | Present failure details, suggest fixes |

## Notification Tiers

| Event | Tier | Action |
|-------|------|--------|
| Review passed | review | Voice: "Review passed for Feature N" |
| Review failed | review | Voice: "Review failed for Feature N" |
<!-- F-12 INTEGRATION POINT -->
