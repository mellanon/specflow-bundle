# SpecFlow HITL Design — Human-in-the-Loop Surfacing for Agent Swarms

> Created 2026-02-06 during lifecycle extension Phase 2.
> Informed by: Vibe Kanban (BloopAI) patterns, PAI Signal observability architecture, 2026 HITL industry research.

## Design Philosophy

SpecFlow follows an **exception-based attention** model: agents work autonomously through lifecycle phases, and humans are only interrupted when judgment is needed. The goal is **inbox zero for the supervising human** — routine items auto-advance, exceptions surface.

Key principles:

1. **Context in 5 seconds** — review packages communicate their verdict in the first 5 lines
2. **Binary first, nuance second** — lead with PASS/FAIL, details below for those who want to dig
3. **One command to act** — `specflow approve F-N` or `specflow reject F-N --reason "..."`
4. **Isolation is a prerequisite for autonomy** — agents work in isolated contexts without interfering

---

## Gate Classification

Not all lifecycle gates require human attention. SpecFlow classifies gates into two categories:

### Automated Gates (Exception-Based)

These gates auto-advance unless something fails. Humans are only notified on exceptions.

| Transition | Gate Type | Human Attention Trigger |
|-----------|-----------|------------------------|
| SPECIFY -> PLAN | Quality eval | Eval score < 80% |
| PLAN -> TASKS | Quality eval | Eval score < 80% |
| TASKS -> IMPLEMENT | Quality eval | Eval score < 80% |
| IMPLEMENT -> HARDEN | Test + contract verification | Test failures, Doctorow gate failure |
| APPROVE -> EVOLVE | Status update | Never (auto-advance after approval) |

### Human Gates (Always Surface)

These gates always require human judgment. They are the true decision points.

| Transition | Why Human Required |
|-----------|-------------------|
| HARDEN -> REVIEW | Acceptance test evidence needs human evaluation |
| REVIEW -> APPROVE | Review package is evidence for human decision |

---

## The Review Package as Decision Surface

The review package (`review-package.md`) is the single artifact a human reads to make an approve/reject decision. It compiles all evidence into a structured document.

### Current Design Strengths

- Structured verdict summary (PASS/FAIL per area)
- Clear decision section with exact CLI commands
- Evidence-based (automated checks, file alignment, acceptance tests)
- Self-contained markdown — readable without CLI context

### Recommended Improvements

**1. One-line triage verdict at top:**

```
VERDICT: ALL PASS — approve with `specflow approve F-19`
```

or

```
VERDICT: NEEDS ATTENTION — 2 acceptance tests failed, see section 3
```

**2. Decision codes for rejection:**

Instead of free-text reasons, offer standardized codes:

```bash
specflow reject F-19 --reason INCOMPLETE    # Missing acceptance tests
specflow reject F-19 --reason QUALITY       # Code quality issues
specflow reject F-19 --reason SPEC_DRIFT    # Implementation doesn't match spec
specflow reject F-19 --reason REGRESSION    # Broke existing functionality
```

**3. Changes-since-last-review:**

When re-reviewing after rejection, show only what changed since the last review.

---

## Inbox Pattern for Multi-Feature Supervision

When supervising multiple features or agent swarms, the human needs a single scannable view. This is the **inbox pattern**.

### Concept: `specflow inbox`

```
$ specflow inbox

 Review Queue (3 items)

 P0  F-19  auth-middleware     NEEDS ATTENTION  2 AT failures   4h ago
 P1  F-21  api-rate-limiting   ALL PASS         ready           1h ago
 P2  F-22  logging-pipeline    ALL PASS         ready           30m ago

 Quick actions:
   specflow approve F-21 F-22    # Batch approve passing items
   specflow review F-19          # Open review package for attention items
```

### Priority Lanes

| Priority | Condition | Action |
|----------|-----------|--------|
| **P0** | Failures or exceptions | Review immediately |
| **P1** | All pass, newly arrived | Review when convenient |
| **P2** | All pass, routine | Batch approve |

### Batch Approve

Let humans approve multiple passing items in one command:

```bash
specflow approve F-21 F-22 F-23    # Approve all three
```

This dramatically reduces friction for routine approvals.

### Age Tracking

Every item in the inbox tracks how long it's been waiting. This prevents stale queues and enables SLA monitoring.

---

## Parallel Agent Architecture

When multiple agents work on different features simultaneously:

### Agent Status Ledger

```
$ specflow status --agents

 Active Agents

 Agent 1 (worktree: ./wt-f19)  F-19  IMPLEMENT  task 3/7  running
 Agent 2 (worktree: ./wt-f21)  F-21  HARDEN     AT gen    waiting for human
 Agent 3 (worktree: ./wt-f22)  F-22  REVIEW     compiled  in inbox
```

### Worktree Isolation (Future)

Borrowed from Vibe Kanban: each agent works in its own git worktree, preventing interference. This requires:

- `.specflow/` database shared across worktrees (single source of truth)
- `.specify/` artifacts must be worktree-aware
- Feature status locks to prevent two agents working on the same feature

### Notification on Gate Transitions

When an agent's feature moves to a human gate:

| Event | Notification |
|-------|-------------|
| Feature reaches REVIEW | Desktop notification + optional voice |
| All features in REVIEW (batch ready) | Voice summary: "3 features ready for review" |
| Pipeline failure | Critical notification with error details |
| Review rejection | Notify assigned agent to re-enter lifecycle |

---

## The Attempt Pattern (Future)

Borrowed from Vibe Kanban's 1:N task-to-solution model:

- `harden F-19` generates acceptance tests (attempt 1)
- If results show failures, agent re-implements and re-generates (attempt 2)
- Human reviews both attempts side by side
- Decision: accept attempt N, reject all and re-spec

This treats code generation as a **sampling problem**, not a deterministic pipeline. Especially powerful for acceptance tests where different runs produce different coverage.

---

## Observability Integration

SpecFlow's lifecycle gates map naturally to distributed tracing. Integration with PAI Signal (when available) enables:

### Event Types

| Event | Source | When |
|-------|--------|------|
| `specflow.phase.start` | Phase entry | Agent enters a lifecycle phase |
| `specflow.phase.complete` | Phase exit | Phase completes (pass or fail) |
| `specflow.gate.reached` | Gate transition | Human gate reached, needs attention |
| `specflow.gate.resolved` | Approval/rejection | Human makes decision |
| `specflow.test.generated` | Harden | Acceptance tests generated |
| `specflow.test.ingested` | Harden --ingest | Results parsed from template |
| `specflow.review.compiled` | Review | Evidence compiled into package |

### Trace Hierarchy

All lifecycle events for a feature share a trace, enabling end-to-end visibility:

```
Trace: feature-F-019
|
+-- specflow.phase.start (SPECIFY)
|   +-- specflow.phase.complete (SPECIFY)
|
+-- specflow.phase.start (PLAN)
|   +-- specflow.phase.complete (PLAN)
|
+-- ... (TASKS, IMPLEMENT)
|
+-- specflow.phase.start (HARDEN)
|   +-- specflow.test.generated (3 ATs)
|   +-- specflow.test.ingested (results.json)
|   +-- specflow.phase.complete (HARDEN)
|
+-- specflow.gate.reached (REVIEW)
|   +-- specflow.review.compiled
|   +-- specflow.gate.resolved (approved)
|
+-- specflow.phase.start (EVOLVE)
    +-- specflow.phase.complete (EVOLVE)
```

### Context Propagation

When SpecFlow runs inside a PAI-instrumented session:

1. Read trace context from environment (`OTEL_TRACE_ID`, `OTEL_PARENT_SPAN_ID`)
2. Create child spans for each phase and gate
3. Emit structured events to JSONL for CLI queries
4. Optionally send spans to OTLP endpoint for Grafana visualization

This is non-intrusive — if PAI Signal isn't running, events are simply not emitted. Graceful degradation.

---

## Anti-Patterns

| Anti-Pattern | What To Do Instead |
|-------------|-------------------|
| Requiring humans to read full spec before approving | Show delta, not baseline |
| Requiring free-text justification for approval | Only require reason for rejection |
| Blocking all agents while one review is pending | Async, parallel — each feature independent |
| Losing context between review sessions | Persist review state in review.json |
| Sending raw data to humans | Compile evidence into structured summaries |
| Making every gate a human gate | Most gates should auto-advance |

---

## Implementation Roadmap

| Recommendation | Complexity | Impact | Priority |
|---------------|-----------|--------|----------|
| One-line verdict at top of review package | Low | High | P1 |
| Batch approve (`specflow approve F-N F-M`) | Low | Medium | P1 |
| Decision codes for rejection | Low | Medium | P2 |
| `specflow inbox` command | Medium | High | P2 |
| Notification on gate transitions | Medium | High | P2 |
| Agent ledger / parallel status | Medium | Medium | P3 |
| Observability event emission | Medium | Medium | P3 |
| Attempt pattern for harden | High | Medium | P3 |
| Worktree-per-agent isolation | High | High | P3 |

---

_Informed by research into Vibe Kanban (BloopAI), PAI Signal observability architecture, and 2026 HITL patterns from Zapier, Permit.io, PromptEngineering.org, and LangGraph._
