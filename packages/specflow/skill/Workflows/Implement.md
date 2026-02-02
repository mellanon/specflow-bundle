# Implement Workflow

## Trigger Phrases
- "implement F-N"
- "build feature"
- "code F-N"
- "specflow implement"
- "start implementing"

## Context Requirements
- [ ] SpecFlow project detected (`.specify/` exists)
- [ ] Feature ID provided (or prompt for it)
- [ ] Feature is in `tasks` or `implement` phase (tasks.md exists)

## Procedure

### Step 1: Read Context
```bash
specflow next --feature <feature-id> --json
```
This provides the full implementation context: spec, plan, tasks, and app context.

### Step 2: Move to Implement Phase
```bash
specflow phase <feature-id> implement
```

### Step 3: Implement
Read the spec.md, plan.md, and tasks.md from the feature's spec directory.
Implement according to the task breakdown, following the execution order defined in tasks.md.

### Step 4: Check for Approval Gates
```bash
specflow pending
```
If gates are pending, present via AskUserQuestion:
- **Approve**: `specflow approve <feature-id>`
- **Reject**: `specflow reject <feature-id> --reason "<reason>"`
<!-- F-13 INTEGRATION POINT -->

### Step 5: Complete
After implementation:
```bash
specflow complete <feature-id>
```

### Step 6: Notification
```bash
curl -s -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Feature <ID> implementation complete"}'
```
<!-- F-12 INTEGRATION POINT -->

## Error Handling

| Error | Action |
|-------|--------|
| No project found | Suggest `specflow init` |
| Feature not found | Show available features |
| Wrong phase | Explain current phase, suggest correct command |
| Implementation failure | AskUserQuestion: retry/skip/abort |
| Gate blocked | Present gate context, wait for approval |

## Notification Tiers

| Event | Tier | Action |
|-------|------|--------|
| Implementation started | ambient | Voice: "Starting implementation of Feature N" |
| Gate encountered | critical | AskUserQuestion: approve/reject/defer |
| Implementation complete | review | Voice + desktop notification |
| Implementation failed | critical | AskUserQuestion: retry/skip/abort |
