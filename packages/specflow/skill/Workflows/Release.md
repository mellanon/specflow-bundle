# Release Workflow

## Trigger Phrases
- "release F-N"
- "package for contribution"
- "release eval"
- "specflow release"

## Context Requirements
- [ ] SpecFlow project detected (`.specify/` exists)
- [ ] Feature ID provided (or prompt for it)
- [ ] Feature is complete

## Procedure

### Step 1: Run Release Evaluation
```bash
specflow release <feature-id>
```

This evaluates release readiness through multiple gates.

### Step 2: Version Management (if needed)
If no version tag exists:
```bash
specflow version bump <level>
```

Generate changelog:
```bash
specflow version changelog
```

### Step 3: Contribution Prep (if applicable)
```bash
specflow contrib-prep <feature-id>
```

STOP -- Before any destructive action (branch creation, push), present plan and wait for approval.

## Error Handling

| Error | Action |
|-------|--------|
| Release gate failed | Present gate failure, suggest fixes |
| No version tag | Suggest `specflow version bump` |
| Contrib-prep failed | Present failure, offer retry |

## Notification Tiers

| Event | Tier | Action |
|-------|------|--------|
| Release evaluation complete | review | Voice: "Release evaluation done for Feature N" |
| Release gate failed | critical | AskUserQuestion: fix/skip/abort |
<!-- F-12 INTEGRATION POINT -->
