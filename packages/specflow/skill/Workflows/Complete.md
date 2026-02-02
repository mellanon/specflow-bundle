# Complete Workflow

## Trigger Phrases
- "complete F-N"
- "finish feature"
- "mark done"
- "specflow complete"

## Context Requirements
- [ ] SpecFlow project detected (`.specify/` exists)
- [ ] Feature ID provided (or prompt for it)
- [ ] Feature is in `implement` phase

## Procedure

### Step 1: Validate
```bash
specflow validate <feature-id>
```
Check that all phases are complete and artifacts exist.

### Step 2: Complete
```bash
specflow complete <feature-id>
```

If validation issues exist, use `--force` only with explicit user approval.

### Step 3: Present Results
STOP -- Display completion status and progress summary.

Suggest: "Run `specflow review <feature-id>` for quality checks, or `specflow status` for pipeline overview."

## Error Handling

| Error | Action |
|-------|--------|
| Validation failed | Show missing artifacts, suggest fixes |
| Wrong phase | Explain current phase |
| Doctorow Gate | Present checklist for user review |

## Notification Tiers

| Event | Tier | Action |
|-------|------|--------|
| Feature completed | review | Voice + desktop: "Feature N marked complete" |
<!-- F-12 INTEGRATION POINT -->
