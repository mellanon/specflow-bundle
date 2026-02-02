# Validate Workflow

## Trigger Phrases
- "validate F-N"
- "check feature readiness"
- "specflow validate"

## Context Requirements
- [ ] SpecFlow project detected (`.specify/` exists)
- [ ] Feature ID provided (or `--all` for all features)

## Procedure

### Step 1: Run Validation
```bash
specflow validate <feature-id>
```

Or validate all features:
```bash
specflow validate --all
```

For machine-readable output:
```bash
specflow validate <feature-id> --json
```

This checks that all required SpecFlow phase artifacts exist (spec.md, plan.md, tasks.md) and reports readiness for implementation.

### Step 2: Present Results
STOP -- Display validation results per feature.

If validation fails, show:
- Which files are missing
- Which phase needs to run next
- The exact command to run

If validation passes:
- Confirm feature is ready for implementation
- Suggest `specflow next --feature <id>` to begin

## Error Handling

| Error | Action |
|-------|--------|
| No project found | Suggest `specflow init` |
| Feature not found | Show available features with `specflow status` |
| Missing phase artifacts | Show next step command for the incomplete phase |

## Notification Tiers

| Event | Tier | Action |
|-------|------|--------|
| All features valid | ambient | Log validation passed |
| Validation failed | review | Voice: "Validation failed for Feature N" |
<!-- F-022 INTEGRATION POINT -->
