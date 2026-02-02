# Revise Workflow

## Trigger Phrases
- "revise spec for F-N"
- "update plan"
- "revise F-N"
- "modify tasks"
- "specflow revise"

## Context Requirements
- [ ] SpecFlow project detected (`.specify/` exists)
- [ ] Feature ID provided (or prompt for it)
- [ ] Target artifact specified (spec, plan, or tasks)

## Procedure

### Step 1: Determine Artifact
Detect which artifact to revise from user intent:
- "revise spec" -> `--spec`
- "update plan" -> `--plan`
- "modify tasks" -> `--tasks`

If ambiguous, ask the user which artifact to revise.

### Step 2: Execute Revision
```bash
specflow revise <feature-id> --spec --feedback "<user feedback>"
```

Or for plan/tasks:
```bash
specflow revise <feature-id> --plan --feedback "<feedback>"
specflow revise <feature-id> --tasks --feedback "<feedback>"
```

### Step 3: Show Revision History
```bash
specflow revise <feature-id> --history
```

### Step 4: Present Results
STOP -- Display the revised artifact path. Suggest reviewing the changes.

## Error Handling

| Error | Action |
|-------|--------|
| No project found | Suggest `specflow init` |
| Feature not found | Show available features |
| Artifact not found | Explain which phase must complete first |
| No feedback provided | Ask user for revision feedback |

## Notification Tiers

| Event | Tier | Action |
|-------|------|--------|
| Revision complete | ambient | Voice: "Artifact revised for Feature N" |
<!-- F-12 INTEGRATION POINT -->
