# Tasks Workflow

## Trigger Phrases
- "break down F-N"
- "generate tasks"
- "task breakdown"
- "specflow tasks"
- "create tasks for F-N"

## Context Requirements
- [ ] SpecFlow project detected (`.specify/` exists)
- [ ] Feature ID provided (or prompt for it)
- [ ] Feature is in `plan` phase (plan.md exists)

## Procedure

### Step 1: Verify Phase
```bash
specflow status --json
```
Confirm the feature is in `plan` phase.

### Step 2: Execute
```bash
specflow tasks <feature-id>
```

This invokes headless Claude to generate tasks.md. Wait for completion (~60 seconds).

### Step 3: Present Results
STOP -- Display the tasks path, total task count, and parallelizable task count.

Suggest: "Run `specflow implement <feature-id>` or `specflow phase <feature-id> implement` to begin implementation."

### Step 4: Notification
```bash
curl -s -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Task breakdown complete for Feature <ID>"}'
```
<!-- F-12 INTEGRATION POINT -->

## Error Handling

| Error | Action |
|-------|--------|
| No project found | Suggest `specflow init` |
| Feature not found | Show available features |
| Wrong phase | Explain current phase, suggest correct command |
| Task generation failed | Offer retry or manual creation |

## Notification Tiers

| Event | Tier | Action |
|-------|------|--------|
| Tasks complete | ambient | Voice: "Tasks generated for Feature N" |
| Tasks failed | critical | AskUserQuestion: retry/skip/abort |
