# Evolve Workflow

## Trigger Phrases
- "evolve F-N"
- "create baseline"
- "snapshot spec"
- "transition to brownfield"
- "specflow evolve"
- "baseline the spec"

## Context Requirements
- [ ] SpecFlow project detected (`.specify/` exists)
- [ ] Feature ID provided (or prompt for it)
- [ ] Feature is in `approve` or `complete` phase
- [ ] Feature has been approved for production

## Procedure

### Step 1: Validate Feature State
```bash
specflow status --json
```
Parse output to confirm the feature is approved and ready for baseline creation.

### Step 2: Preview Baseline (Optional)
```bash
specflow evolve <feature-id> --dry-run
```
Display what will be snapshotted without writing files. Shows artifact list, paths, and content hashes.

### Step 3: Create Baseline
```bash
specflow evolve <feature-id>
```

This command:
- Copies `spec.md` as `spec-v1.0.md` to `.specify/baselines/{featureId}/`
- Builds `manifest.json` with artifact list, content hashes, timestamps
- Creates spec version entry in database
- Writes ADDED deltas to changelog
- Updates feature status to "evolving"

For structured output:
```bash
specflow evolve <feature-id> --json
```

### Step 4: Present Results
STOP -- Display baseline snapshot confirmation:
- Baseline location: `.specify/baselines/{featureId}/spec-v1.0.md`
- Manifest location: `.specify/baselines/{featureId}/manifest.json`
- Artifacts captured: (list from manifest)
- Status: Feature now in "evolving" mode

### Step 5: Brownfield Iteration Loop
Explain the post-evolve workflow:

```
┌─────────────────────────────────────────────┐
│ Feature in EVOLVING mode (brownfield)       │
└─────────────────────────────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │  Developer changes   │
         │  implementation      │
         └──────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │ specflow brownfield  │
         │ scan                 │
         │ (captures current    │
         │  codebase state)     │
         └──────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │ specflow brownfield  │
         │ diff                 │
         │ (compares scan vs    │
         │  spec baseline)      │
         └──────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │ Review drift report  │
         │ Decide: accept or    │
         │ revert changes       │
         └──────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │ specflow brownfield  │
         │ apply                │
         │ (creates spec v2.0)  │
         └──────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │ Re-enter SPECIFY     │
         │ lifecycle with v2.0  │
         │ (full SPECIFY →      │
         │  APPROVE cycle)      │
         └──────────────────────┘
```

Suggest: "Feature is now baseline-tracked. When you make code changes, run `specflow brownfield scan` to capture drift, then `specflow brownfield diff` to review changes against the baseline."

### Step 6: Notification
```bash
curl -s -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Feature <ID> baseline created, entering brownfield mode"}'
```
<!-- F-12 INTEGRATION POINT -->

## Error Handling

| Error | Action |
|-------|--------|
| Feature not approved | Report current phase, suggest completing approve workflow first |
| Spec file missing | Report missing spec.md, suggest `specflow revise` to regenerate |
| Baseline already exists | Ask user: overwrite (creates v2.0) or cancel |
| Database write failure | Report error, suggest checking `.specflow/` permissions |
| Wrong phase | Explain current phase, show required phase (approve/complete) |

## Notification Tiers

| Event | Tier | Action |
|-------|------|--------|
| Baseline created | review | Voice + desktop: "Feature N baseline snapshot complete" |
| Evolve failed | critical | AskUserQuestion: retry/force/abort |
| Entering brownfield mode | ambient | Voice: "Feature N now tracking drift" |
<!-- F-12 INTEGRATION POINT -->
