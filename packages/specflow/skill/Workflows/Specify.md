# Specify Workflow

## Trigger Phrases
- "specify F-N"
- "write spec for X"
- "specification"
- "create spec"
- "specflow specify"

## Context Requirements
- [ ] SpecFlow project detected (`.specify/` exists)
- [ ] Feature ID provided (or prompt for it)
- [ ] Feature is in `none` or `specify` phase

## Procedure

### Step 1: Gather Context
```bash
specflow status --json
```
Parse output to find the target feature and its current phase.

### Step 2: Check Batch Viability
If the feature has rich decomposition data (problemType, urgency, primaryUser, integrationScope populated), use batch mode for non-interactive specification:

```bash
specflow specify <feature-id> --batch
```

Otherwise, use interactive mode:
```bash
specflow specify <feature-id>
```

For quick-start (essential questions only):
```bash
specflow specify <feature-id> --quick
```

### Step 3: Present Results
STOP -- Display the spec path and a brief summary of what was specified.

Suggest: "Run `specflow plan <feature-id>` to create a technical plan."

### Step 4: Notification
```bash
curl -s -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Feature <ID> specification complete"}'
```
<!-- F-12 INTEGRATION POINT -->

## Error Handling

| Error | Action |
|-------|--------|
| No project found | Suggest `specflow init` |
| Feature not found | Show available features, ask to select |
| Phase mismatch (already specified) | Suggest `specflow revise` or `specflow plan` |
| Claude CLI unavailable | Report error, suggest manual spec creation |

## Notification Tiers

| Event | Tier | Action |
|-------|------|--------|
| Spec complete | ambient | Voice: "Specification complete for Feature N" |
| Spec failed | critical | AskUserQuestion: retry/skip/abort |
