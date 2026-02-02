# Status Workflow

## Trigger Phrases
- "specflow status"
- "pipeline state"
- "what's running"
- "show progress"
- "feature queue"

## Context Requirements
- [ ] SpecFlow project detected (`.specify/` exists)

## Procedure

### Step 1: Detect Output Mode

For brief summary:
```bash
specflow status --brief
```

For full dashboard:
```bash
specflow status
```

For programmatic use:
```bash
specflow status --json
```

For live monitoring:
```bash
specflow status --watch
```

### Step 2: Render
Parse output and present as a formatted summary. Highlight:
- Blocked features (pending approval gates)
- In-progress features (currently executing)
- Failures requiring attention

STOP -- Display status. Do not suggest actions unless asked.

## Error Handling

| Error | Action |
|-------|--------|
| No project found | Suggest `specflow init` |
| Database corrupted | Suggest `specflow migrate` |

## Notification Tiers

This workflow is read-only. No notifications emitted.
