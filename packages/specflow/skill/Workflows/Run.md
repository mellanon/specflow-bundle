# Run Workflow (Lifecycle Orchestrator)

## Trigger Phrases
- "run specflow on F-N"
- "process all pending"
- "autorun"
- "drive features through pipeline"
- "drive features through lifecycle"
- "run full lifecycle"
- "full lifecycle"

## Context Requirements
- [ ] SpecFlow project detected (`.specify/` exists)
- [ ] Feature ID provided OR "all pending" intent

## Procedure

### Step 1: Resolve Target

**Single feature:**
```bash
specflow status --json
```
Parse to find the target feature and its current phase.

**All pending:**
```bash
specflow status --json
```
Filter for features with status "pending".

### Step 2: Phase Routing

For each target feature, determine the next phase and route:

| Current Phase | Next Action |
|---------------|------------|
| none | `specflow specify <id>` |
| specify | `specflow plan <id>` |
| plan | `specflow tasks <id>` |
| tasks | `specflow phase <id> implement` then implement |
| implement | `specflow complete <id>` |
| complete | `specflow harden <id>` |
| hardened | `specflow review <id>` |
| review | `specflow approve <id>` or `specflow reject <id>` |
| approved | `specflow evolve <id>` |

Execute each phase, waiting for completion before moving to the next.

### Step 3: Gate Handling

Between phases, check for pending approval gates:
```bash
specflow pending
```

Gates can occur at multiple points in the lifecycle:
- **After specify**: Human approves/rejects spec content
- **After plan**: Human approves/rejects design decisions
- **After harden**: Human fills acceptance test template
- **After review**: Human approves/rejects review package

If gates are pending:
<!-- F-13 INTEGRATION POINT -->
- Present gate context to user via AskUserQuestion
- **Approve**: `specflow approve <feature-id>`
- **Reject**: `specflow reject <feature-id> --reason "<reason>"`
- **Defer**: Skip feature, move to next

### Step 4: Progress Reporting

After each phase completion, display progress:
```bash
specflow status --brief
```

### Step 5: Multi-Feature Batching

For "all pending", use autorun:
```bash
specflow autorun --continue-on-error
```

Or process sequentially, reporting after each feature.

## Error Handling

| Error | Action |
|-------|--------|
| Phase execution failed | AskUserQuestion: retry/skip/abort |
| Gate timeout | Report timeout, suggest manual resolution |
| All features complete | Report completion summary |
| Pipeline blocked | Show blocking feature, suggest resolution |

## Notification Tiers

| Event | Tier | Action |
|-------|------|--------|
| Phase complete | ambient | Voice: "Phase complete for Feature N" |
| Feature complete | review | Voice + desktop: "Feature N complete" |
| Gate encountered | critical | AskUserQuestion blocking |
| Pipeline failure | critical | AskUserQuestion: retry/skip/abort |
| All features done | review | Voice + desktop: "All features complete" |
<!-- F-12 INTEGRATION POINT -->
