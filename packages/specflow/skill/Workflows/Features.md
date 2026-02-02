# Features Workflow

## Trigger Phrases
- "add feature"
- "remove feature"
- "edit feature"
- "list features"
- "show features"

## Context Requirements
- [ ] SpecFlow project detected (`.specify/` exists)

## Procedure

### Sub-Intent: Add Feature
```bash
specflow add "<name>" "<description>"
```
Optional: `--priority <n>`

### Sub-Intent: Remove Feature
```bash
specflow remove <feature-id>
```
Use `--force` for completed features or those with spec files.

### Sub-Intent: Edit Feature
```bash
specflow edit <feature-id> --name "<new name>" --description "<new desc>" --priority <n>
```

### Sub-Intent: List Features
```bash
specflow status --brief
```

For detailed view:
```bash
specflow status
```

### Step: Present Results
Format output as a summary table. Suggest next actions based on feature states.

## Error Handling

| Error | Action |
|-------|--------|
| No project found | Suggest `specflow init` |
| Feature not found | Show available features via `specflow status --brief` |
| Remove completed feature | Ask for `--force` confirmation |

## Notification Tiers

| Event | Tier | Action |
|-------|------|--------|
| Feature added | ambient | Voice: "Feature added to queue" |
| Feature removed | ambient | Voice: "Feature removed" |
<!-- F-12 INTEGRATION POINT -->
