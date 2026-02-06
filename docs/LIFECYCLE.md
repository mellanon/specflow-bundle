# SpecFlow Lifecycle

## Overview

8-phase gated lifecycle for spec-driven development. Each phase produces artifacts, has a quality gate, and requires human approval before advancing.

```
SPECIFY -> PLAN -> TASKS -> IMPLEMENT -> HARDEN -> REVIEW -> APPROVE -> EVOLVE
```

## Phase 1: SPECIFY

- **What:** Interview-driven requirements gathering (8-phase structured interview)
- **Command:** `specflow specify F-N` (`--quick` for reduced interview, `--batch` for non-interactive)
- **Output:** `.specify/specs/f-NNN-name/spec.md`
- **Gate:** Human approves spec, quality eval >= 80%
- **Artifacts:** spec.md, spec version snapshot (F-002)

## Phase 2: PLAN

- **What:** Architecture decisions, data models, API contracts, failure mode analysis
- **Command:** `specflow plan F-N`
- **Output:** `.specify/specs/f-NNN-name/plan.md`
- **Gate:** Human approves design, quality eval >= 80%

## Phase 3: TASKS

- **What:** Break work into reviewable units with dependencies and test markers
- **Command:** `specflow tasks F-N`
- **Output:** `.specify/specs/f-NNN-name/tasks.md`
- **Gate:** Human approves task breakdown

## Phase 4: IMPLEMENT

- **What:** TDD execution (RED->GREEN->BLUE) with ISC verification loop
- **Command:** `specflow implement F-N` then `specflow complete F-N`
- **Output:** Working code, verify.md, docs.md
- **Gate:** Tests pass, Doctorow gate passed, contracts verified

## Phase 5: HARDEN

- **What:** Generate workflow-level acceptance tests via AI, human fills template with pass/fail/evidence, ingest results
- **Command:** `specflow harden F-N` (generate) -> human fills template -> `specflow harden F-N --ingest` (parse results)
- **Output:** `.specify/harden/{featureId}/acceptance-test.md`, `results.json`
- **Gate:** All acceptance tests pass
- **Options:** `--all` for batch generation, `--status` for progress, `--dry-run` for preview

## Phase 6: REVIEW

- **What:** Compile all evidence (automated checks + acceptance test results) into review package for human decision
- **Command:** `specflow review F-N`
- **Output:** `.specify/review/{featureId}/review-package.md`, `review.json`
- **Gate:** Review package shows all checks green
- **Note:** No AI in the review loop. Evidence compilation only.

## Phase 7: APPROVE

- **What:** Human reads review package, makes approve/reject decision
- **Command:** `specflow approve F-N` or `specflow reject F-N --reason "..."`
- **Output:** Gate resolution (status update)
- **Gate:** Human approval

## Phase 8: EVOLVE

- **What:** Snapshot spec as baseline, build implementation manifest, transition to brownfield iteration
- **Command:** `specflow evolve F-N`
- **Output:** `.specify/baselines/{featureId}/spec-v1.0.md`, `manifest.json`
- **Gate:** Feature status transitions to "evolving"

---

## Standalone Utilities

These are not lifecycle phases -- they are tools available at any point.

### Release (`specflow release F-N`)

8-gate release readiness evaluation:

1. All features complete
2. Quality evals pass
3. CHANGELOG generated
4. File inventory + version tag
5. PII/secrets scan
6. Contribution branch created
7. Sanitization verified
8. PR template generated

Stops at first failure with remediation guidance.

### Contribution Packaging (`specflow contrib-prep F-N`)

5-gate workflow for extracting clean contributions:

1. Inventory review (include/exclude/review classification)
2. Sanitization scan (gitleaks + custom PII/secrets patterns)
3. Pre-extraction approval
4. Tag-before-contrib extraction (immutable git tag -> clean branch)
5. Final verification

### Brownfield Iteration (post-EVOLVE)

After a feature transitions to "evolving" via EVOLVE, the brownfield commands enable spec iteration:

```
EVOLVE -> brownfield scan -> brownfield diff -> brownfield apply -> SPECIFY (v2) -> ...
```

1. `specflow evolve F-N` creates v1.0 baseline (spec + manifest)
2. Developer makes v1.1 changes to code
3. `specflow brownfield scan` captures current codebase state
4. `specflow brownfield diff` compares scan against spec baseline, classifies changes (AI-assisted)
5. `specflow brownfield apply` applies approved changes -> new spec version
6. Feature can re-enter SPECIFY with updated spec for next lifecycle pass

---

## Artifact Map

| Phase | Artifact | Location |
|-------|----------|----------|
| SPECIFY | spec.md | `.specify/specs/f-NNN-name/` |
| PLAN | plan.md | `.specify/specs/f-NNN-name/` |
| TASKS | tasks.md | `.specify/specs/f-NNN-name/` |
| IMPLEMENT | source code, verify.md | `src/`, `.specify/specs/f-NNN-name/` |
| HARDEN | acceptance-test.md, results.json | `.specify/harden/{featureId}/` |
| REVIEW | review-package.md, review.json | `.specify/review/{featureId}/` |
| APPROVE | status update | Database |
| EVOLVE | baseline spec, manifest.json | `.specify/baselines/{featureId}/` |
| release | release-readiness.md | `.specify/` |
| contrib-prep | CONTRIBUTION-REGISTRY.md | `.specify/` |
| brownfield | scan.json, delta-spec.md | `.specify/brownfield/` |

---

## Human-in-the-Loop Design

> Full design document: [HITL-DESIGN.md](HITL-DESIGN.md)

SpecFlow follows an **exception-based attention** model (informed by vibe-kanban principles):

- **Agents work autonomously** through each phase
- **Most gates auto-advance** -- only HARDEN->REVIEW and REVIEW->APPROVE are true human gates
- **Review packages compile evidence** -- humans see structured summaries, not raw data
- **Approval is binary** -- approve or reject with reason (no partial approvals)
- **Headless mode** (`--headless`) enables fully automated pipeline with notifications at gates
- **Context in 5 seconds** -- review packages lead with verdict, details below

### Gate Classification

| Gate Type | Transitions | Human Attention |
|-----------|-------------|-----------------|
| **Automated** | SPECIFY->PLAN, PLAN->TASKS, TASKS->IMPLEMENT, IMPLEMENT->HARDEN, APPROVE->EVOLVE | Only on exception (eval failure, test failure) |
| **Human** | HARDEN->REVIEW, REVIEW->APPROVE | Always surfaces to human |

### Notification Tiers

| Tier | When | Delivery |
|------|------|----------|
| **CRITICAL** | Pipeline failure, rejection | Voice + desktop + terminal block |
| **REVIEW** | Gate reached, approval needed | Voice + desktop notification |
| **AMBIENT** | Phase transition, progress | Log entry only |

### Surfacing for Human Review

When supervising multiple features or agent swarms:

1. `specflow status` shows queue with phases and blockers
2. `specflow harden --status` shows acceptance test progress per feature
3. `specflow review --status` shows review status from artifacts
4. Review packages are self-contained markdown -- readable without CLI context
5. Approval gates emit structured JSON for external tooling integration

### Observability (Future)

SpecFlow lifecycle events can integrate with distributed tracing (PAI Signal) for end-to-end feature visibility:

- Each feature's lifecycle forms a single trace
- Phase transitions emit structured events
- Gate decisions are captured as span attributes
- Graceful degradation when tracing infrastructure is unavailable

See [HITL-DESIGN.md](HITL-DESIGN.md) for the full design including inbox patterns, batch approve, agent ledger, and observability integration.
