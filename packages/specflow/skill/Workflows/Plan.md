# Plan Workflow

## Trigger Phrases
- "plan F-N"
- "technical plan"
- "architecture plan"
- "create plan"
- "specflow plan"

## Context Requirements
- [ ] SpecFlow project detected (`.specify/` exists)
- [ ] Feature ID provided (or prompt for it)
- [ ] Feature is in `specify` phase (spec.md exists)

## Procedure

### Step 1: Verify Phase
```bash
specflow status --json
```
Confirm the feature is in `specify` phase. If not, explain current phase and suggest correct action.

### Step 2: Execute
```bash
specflow plan <feature-id>
```

This invokes headless Claude to generate plan.md. Wait for completion (~60 seconds).

### Step 3: Present Results
STOP -- Display the plan path and architecture summary.

Suggest: "Run `specflow tasks <feature-id>` to generate implementation tasks."

### Step 4: Notification
```bash
curl -s -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Technical plan complete for Feature <ID>"}'
```
<!-- F-12 INTEGRATION POINT -->

## Error Handling

| Error | Action |
|-------|--------|
| No project found | Suggest `specflow init` |
| Feature not found | Show available features |
| Wrong phase | Explain current phase, suggest correct command |
| Plan generation failed | Offer retry or manual creation |

## Notification Tiers

| Event | Tier | Action |
|-------|------|--------|
| Plan complete | ambient | Voice: "Plan complete for Feature N" |
| Plan failed | critical | AskUserQuestion: retry/skip/abort |
