---
name: SpecFlow
description: >-
  Spec-driven development orchestration with 8-phase gated lifecycle.
  USE WHEN specflow, specify, plan feature, implement feature, harden,
  acceptance test, review feature, approve, reject, evolve, brownfield,
  pipeline status, approval gate, feature lifecycle, task breakdown,
  release feature, version bump, changelog, inbox, audit, spec-driven.
---

# SpecFlow Skill

Spec-driven development orchestration for Claude Code. Manages the full feature lifecycle from specification through evolution, with human gates at every phase transition.

> *"CLI handles the deterministic work. AI generates specs and tests. Humans make decisions."*

## Architecture: 8-Phase Gated Lifecycle

```
SPECIFY → PLAN → TASKS → IMPLEMENT → HARDEN → REVIEW → APPROVE → EVOLVE
   │        │       │         │          │         │         │         │
   ▼        ▼       ▼         ▼          ▼         ▼         ▼         ▼
 spec.md  plan.md tasks.md  code    acceptance  review    human     baseline
                                    -test.md   package   decision  + manifest
```

**Standalone utilities** (not lifecycle phases):
- `release` — 8-gate release readiness evaluation
- `contrib-prep` — contribution packaging
- `brownfield` — post-evolve iteration loop (scan → diff → apply)

---

## Project Detection

Before any workflow:
1. Check CWD for `.specify/` or `.specflow/` directory
2. Walk parent directories up to filesystem root
3. If not found: suggest `specflow init`

---

## Workflow Routing

**When executing operations:**
-> **READ:** The workflow file first
-> **EXECUTE:** Follow the workflow steps

### Lifecycle Phases

| Phase | Workflow | Trigger Examples |
|-------|----------|------------------|
| **Setup** | [Init](Workflows/Init.md) | "init specflow", "set up spec-driven dev" |
| **Features** | [Features](Workflows/Features.md) | "add feature", "list features" |
| **1. Specify** | [Specify](Workflows/Specify.md) | "specify F-3", "write spec" |
| **2. Plan** | [Plan](Workflows/Plan.md) | "plan F-3", "technical plan" |
| **3. Tasks** | [Tasks](Workflows/Tasks.md) | "break down F-3", "generate tasks" |
| **4. Implement** | [Implement](Workflows/Implement.md) | "implement F-3", "build feature" |
| **4b. Complete** | [Complete](Workflows/Complete.md) | "complete F-3", "mark done" |
| **5. Harden** | [Harden](Workflows/Harden.md) | "harden F-3", "acceptance test", "ingest results" |
| **6. Review** | [Review](Workflows/Review.md) | "review F-3", "compile review package" |
| **7. Approve** | [Approve](Workflows/Approve.md) | "approve F-3", "reject F-3" |
| **8. Evolve** | [Evolve](Workflows/Evolve.md) | "evolve F-3", "create baseline" |

### Standalone Utilities

| Utility | Workflow | Trigger Examples |
|---------|----------|------------------|
| Status | [Status](Workflows/Status.md) | "specflow status", "pipeline state" |
| Inbox | — | "specflow inbox", "review queue", "what needs approval" |
| Audit | — | "specflow audit", "health check", "spec drift" |
| Release | [Release](Workflows/Release.md) | "release F-3", "release eval" |
| Brownfield | [Brownfield](Workflows/Brownfield.md) | "brownfield scan", "onboard project" |
| Revision | [Revise](Workflows/Revise.md) | "revise spec", "update plan" |
| Full lifecycle | [Run](Workflows/Run.md) | "run specflow on F-3", "autorun" |
| Validation | [Validate](Workflows/Validate.md) | "validate F-3" |
| Phase hooks | [Hooks](Workflows/Hooks.md) | "configure phase hooks" |

---

## Core Workflow: SPECIFY → PLAN → TASKS → IMPLEMENT → HARDEN → REVIEW → APPROVE → EVOLVE

```
┌─────────────────────────────────────────────────────────────┐
│  SPECIFY: specflow specify F-3                               │
│  → AI-driven interview generates spec.md → STOP AND WAIT    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ (human approves spec)
┌─────────────────────────────────────────────────────────────┐
│  PLAN: specflow plan F-3                                     │
│  → Architecture decisions in plan.md → STOP AND WAIT         │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ (human approves plan)
┌─────────────────────────────────────────────────────────────┐
│  TASKS: specflow tasks F-3                                   │
│  → Break work into reviewable units → STOP AND WAIT          │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ (human approves breakdown)
┌─────────────────────────────────────────────────────────────┐
│  IMPLEMENT: specflow implement F-3 → specflow complete F-3   │
│  → TDD execution with verification → STOP AND WAIT           │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ (code complete)
┌─────────────────────────────────────────────────────────────┐
│  HARDEN: specflow harden F-3                                 │
│  → Generate acceptance tests → Human fills → --ingest        │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ (all ATs pass)
┌─────────────────────────────────────────────────────────────┐
│  REVIEW: specflow review F-3                                 │
│  → Compile evidence into review-package.md → STOP AND WAIT   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ (human reads package)
┌─────────────────────────────────────────────────────────────┐
│  APPROVE: specflow approve F-3                               │
│  → Human decision: approve or reject with decision code      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼ (approved)
┌─────────────────────────────────────────────────────────────┐
│  EVOLVE: specflow evolve F-3                                 │
│  → Snapshot spec baseline, build manifest, enable brownfield │
└─────────────────────────────────────────────────────────────┘
```

---

## Ambiguous Intent Resolution

When the user says something like "F-3" without specifying a phase:

1. Run `specflow status --json` to determine the feature's current phase
2. Route to the workflow matching the **next** phase in the lifecycle:

| Current Phase | Next Action | Workflow |
|---------------|------------|----------|
| none | Specify | [Specify](Workflows/Specify.md) |
| specify | Plan | [Plan](Workflows/Plan.md) |
| plan | Tasks | [Tasks](Workflows/Tasks.md) |
| tasks | Implement | [Implement](Workflows/Implement.md) |
| implement | Complete then Harden | [Complete](Workflows/Complete.md) |
| complete | Harden | [Harden](Workflows/Harden.md) |
| hardened | Review | [Review](Workflows/Review.md) |
| review | Approve | [Approve](Workflows/Approve.md) |
| approved | Evolve | [Evolve](Workflows/Evolve.md) |
| evolving | Brownfield scan | [Brownfield](Workflows/Brownfield.md) |

3. If the feature is complete, suggest harden → review → approve → evolve

---

## Artifact Map

| Phase | Input | Output | Location |
|-------|-------|--------|----------|
| Specify | Interview answers | spec.md | `.specify/specs/f-NNN-slug/` |
| Plan | spec.md | plan.md | `.specify/specs/f-NNN-slug/` |
| Tasks | plan.md | tasks.md | `.specify/specs/f-NNN-slug/` |
| Implement | tasks.md | Working code | Project source |
| Harden | spec.md | acceptance-test.md, results.json | `.specify/harden/{featureId}/` |
| Review | results.json + checks | review-package.md, review.json | `.specify/review/{featureId}/` |
| Approve | review-package.md | Gate resolution | Database |
| Evolve | spec.md | baseline spec, manifest.json | `.specify/baselines/{featureId}/` |

---

## Quick Reference

### Lifecycle Commands

| Intent | Command |
|--------|---------|
| Start new feature | `specflow add "Feature name" "Description"` |
| Write specification | `specflow specify F-3` |
| Create plan | `specflow plan F-3` |
| Generate tasks | `specflow tasks F-3` |
| Mark complete | `specflow complete F-3` |
| Generate acceptance tests | `specflow harden F-3` |
| Ingest AT results | `specflow harden F-3 --ingest` |
| View AT history | `specflow harden F-3 --history` |
| Compile review package | `specflow review F-3` |
| Approve feature | `specflow approve F-3` |
| Reject feature | `specflow reject F-3 --reason "..." --code QUALITY` |
| Evolve to brownfield | `specflow evolve F-3` |

### Status & Pipeline

| Intent | Command |
|--------|---------|
| Pipeline overview | `specflow status` |
| JSON output | `specflow status --json` |
| Pending gates | `specflow pending` |
| Review inbox | `specflow inbox` |
| Review inbox (expanded) | `specflow inbox --verbose` |
| Audit all features | `specflow audit` |
| Audit single feature | `specflow audit F-3` |
| Audit fix commands only | `specflow audit --fix` |
| Next action | `specflow next --feature F-3` |
| Run full lifecycle | `specflow autorun` |

### Release & Brownfield

| Intent | Command |
|--------|---------|
| Release evaluation | `specflow release F-3` |
| Version bump | `specflow version bump minor` |
| Generate changelog | `specflow version changelog` |
| Brownfield scan | `specflow brownfield scan` |
| Brownfield diff | `specflow brownfield diff` |
| Apply changes | `specflow brownfield apply` |

---

## Interaction Modes

| Mode | When | Mechanism |
|------|------|-----------|
| Terminal-blocking | Approval gates, failures | AskUserQuestion |
| Push notification | Phase completions, review ready | Voice server + desktop |
| Passive ambient | Progress updates | Voice only, fire-and-forget |

---

## Notification Defaults (Start Noisy)

All notifications enabled by default. Users tune down via `.specflow/config.yaml`:

```yaml
notifications:
  voice: true
  desktop: true
  ambient: true
```

---

## When to Activate

**Activate for:**
- Lifecycle: "specify", "plan", "tasks", "implement", "complete", "harden", "review", "approve", "reject", "evolve"
- Pipeline: "specflow status", "pipeline", "pending gates", "next action"
- Features: "add feature", "list features", "feature lifecycle"
- Acceptance testing: "acceptance test", "AT results", "ingest", "harden history"
- Review: "review package", "evidence", "compile review"
- Release: "release", "changelog", "version bump", "contrib-prep"
- Brownfield: "brownfield scan", "onboard project", "brownfield diff"
- General: mentions SpecFlow, spec-driven development, feature pipeline

---

## Troubleshooting

**"Feature not found"**
- Run `specflow status` to see available features
- Check feature ID format (F-001, not F-1)
- Run `specflow add` if the feature doesn't exist yet

**"Wrong phase"**
- Features must progress through phases in order
- Run `specflow status --json` to check current phase
- Use `specflow phase F-3 <phase>` to manually transition (with caution)

**"No acceptance tests"**
- Run `specflow harden F-3` to generate acceptance-test.md first
- Fill the template manually, then run `specflow harden F-3 --ingest`

**"Review package empty"**
- Ensure harden results exist: check `.specify/harden/{featureId}/results.json`
- Run `specflow harden F-3 --ingest` before `specflow review F-3`

**"Cannot evolve"**
- Feature must be in `complete` status
- Run `specflow approve F-3` first if review is done

---

## Status

**v2.0** - Full 8-phase lifecycle with acceptance testing and evidence-based review.

- Phase 1-4: Specify, Plan, Tasks, Implement (original)
- Phase 5: Harden (acceptance test generation + template-based human testing)
- Phase 6: Review (evidence compilation into review package)
- Phase 7: Approve/Reject (human decision with decision codes)
- Phase 8: Evolve (baseline snapshot + brownfield transition)
- Standalone: Release, Contrib-Prep, Brownfield iteration
