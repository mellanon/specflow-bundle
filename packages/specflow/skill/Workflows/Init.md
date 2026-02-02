# Init Workflow

## Trigger Phrases
- "init specflow"
- "set up spec-driven dev"
- "initialize project"
- "start new specflow project"

## Context Requirements
- [ ] Current working directory is a project root
- [ ] No existing `.specify/` directory (or user confirms overwrite)

## Procedure

### Step 1: Check Existing Project
```bash
ls -d .specify/ 2>/dev/null && echo "PROJECT_EXISTS" || echo "NO_PROJECT"
```

If PROJECT_EXISTS, ask: "SpecFlow is already initialized. Reset and reinitialize?"

### Step 2: Initialize
```bash
specflow init "<description>"
```

If user provides a features file:
```bash
specflow init --from-features features.json
```

If user provides a spec file:
```bash
specflow init --from-spec spec.md
```

### Step 3: Present Results
Display the feature count and suggest next steps:
- "Run `specflow status` to see your feature queue"
- "Run `specflow specify F-1` to start specifying the first feature"

## Error Handling

| Error | Action |
|-------|--------|
| Directory not writable | Report permission error |
| --from-features file not found | Ask user for correct path |
| Already initialized | Offer `--force` flag |

## Notification Tiers

| Event | Tier | Action |
|-------|------|--------|
| Init complete | ambient | Voice: "SpecFlow project initialized" |
<!-- F-12 INTEGRATION POINT -->
