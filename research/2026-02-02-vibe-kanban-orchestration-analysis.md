# Vibe-Kanban Orchestration Analysis — Concepts for SpecFlow Lifecycle Extension

**Date:** 2026-02-02
**Author:** @mellanon (agent: Luna)
**Source:** [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban) (Rust/TypeScript, MIT)
**Purpose:** Extract orchestration, HITL, and agent visibility patterns from vibe-kanban that can enhance the specflow lifecycle extension (feature/lifecycle-extension branch).

**Companion documents:**
- [Spec-Driven Dev Landscape](2026-02-02-spec-driven-dev-landscape.md) — Ecosystem map and four-layer architecture
- [Council Debate](2026-02-02-council-debate-specflow-vs-openspec.md) — C+ verdict on brownfield approach
- [OpenSpec Deep Dive](2026-02-02-openspec-deep-dive.md) — Delta spec analysis

---

## 1. What is Vibe-Kanban?

A **task orchestration platform for AI coding agents** built in Rust + TypeScript. It addresses the shift where agents write code while humans focus on planning, reviewing, and coordinating.

**Key architectural insight:** Vibe-kanban implements an **exception-based human attention model** — agents work autonomously, humans only intervene when needed (completion, approval, failure).

This is exactly the pattern Andreas described: "I want signals to the human when attention is required — reviews, validations, approvals — to bubble up rather than the human sitting there monitoring every step."

---

## 2. Vibe-Kanban Concepts Mapped to SpecFlow Gaps

### Concept Map

| Vibe-Kanban Concept | What It Does | SpecFlow Gap | Proposed Resolution |
|---------------------|-------------|-------------|-------------------|
| **InReview state** | Task auto-transitions to InReview when agent finishes | No review state in feature lifecycle | Add REVIEW phase between COMPLETE and RELEASE (F-6/7/8 partially address) |
| **Approval service** | Agent requests human permission for dangerous ops; timeout = auto-deny | No approval gates in headless pipeline | New feature: approval gates at phase transitions |
| **Notification service** | Desktop notifications + sound on completion/failure/approval | No notifications at all | New feature: notification hooks at phase boundaries |
| **Progress broadcasting** | WebSocket streams of real-time execution state | No inter-session visibility | New feature: progress file that other sessions can tail |
| **Execution process tracking** | Every agent run logged with before/after git SHAs | No execution audit trail | Extend SQLite: execution_log table |
| **Git worktree isolation** | Each task gets isolated branch + worktree | Not applicable (single-agent model) | Future consideration for multi-agent |
| **Token context gauge** | Visual indicator when approaching token limit | No token awareness | Connect to blackboard #78 quota tracking |
| **Diff review UI** | Line-by-line review with comments | F-8 generates template but no diff view | Enhancement: include actual diffs in review.md |
| **Action chaining** | Sequential/parallel execution of setup → agent → cleanup | Pipeline runs phases but no pre/post hooks | New feature: phase hooks (pre-phase, post-phase scripts) |
| **Restore to point** | Track git state before/after each execution; rollback | No rollback capability | Enhancement: git checkpoint per phase |

### The Five Primitives of Exception-Based HITL

Decomposing vibe-kanban's human attention model to first principles:

```
┌─────────────────────────────────────────────────────────────┐
│  EXCEPTION-BASED HUMAN-IN-THE-LOOP                          │
│                                                             │
│  1. VISIBILITY    — What is happening right now?            │
│     └─ vibe-kanban: WebSocket streams, execution logs       │
│     └─ specflow gap: NO inter-session visibility            │
│                                                             │
│  2. NOTIFICATION  — Something needs your attention          │
│     └─ vibe-kanban: desktop notifications + sound           │
│     └─ specflow gap: NO notifications at all                │
│                                                             │
│  3. APPROVAL      — Agent needs permission to proceed       │
│     └─ vibe-kanban: approval service with timeout           │
│     └─ specflow gap: NO approval gates                      │
│                                                             │
│  4. REVIEW        — Agent finished, human validates         │
│     └─ vibe-kanban: InReview state + diff view              │
│     └─ specflow: F-6/7/8 partially address                  │
│                                                             │
│  5. RECOVERY      — Something failed, agent needs help      │
│     └─ vibe-kanban: failure → InReview + notification       │
│     └─ specflow gap: NO failure handling in pipeline        │
│                                                             │
│  Current features.json covers: REVIEW (partially)           │
│  Missing from features.json: VISIBILITY, NOTIFICATION,      │
│                               APPROVAL, RECOVERY            │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. The Layer 4 Gap

The four-layer architecture from the landscape research identifies:

| Layer | What | Current Coverage |
|-------|------|-----------------|
| Layer 1: External Agents | Independent verification (Greptile, BugBot) | Partial |
| Layer 2: Tooling | CLI commands (SpecFlow, OpenSpec) | F-1 through F-10 |
| Layer 3: Process | SOPs, phase gates | pai-collab SOPs |
| **Layer 4: Orchestration** | **How agents get assigned work and loop** | **NOTHING in features.json** |

The current features.json (F-1 through F-10) is entirely Layer 2 (tooling) and Layer 3 (process). Layer 4 — orchestration — is where vibe-kanban's patterns apply.

**This is the key finding:** The lifecycle extension needs orchestration features, not just more commands.

---

## 4. Proposed New Features (F-11 through F-15)

These features address the Layer 4 gap using patterns validated by vibe-kanban.

### F-11: Pipeline Progress File (Visibility)

```json
{
  "id": "F-11",
  "name": "Pipeline progress file — inter-session visibility",
  "description": "During headless pipeline execution, write a machine-readable progress file (.specify/pipeline/progress.json) updated at each phase transition. Contains: current phase, feature ID, start time, phase durations, artifacts produced, errors encountered. Other sessions can tail this file for real-time monitoring. Includes a `specflow status --watch` command that polls progress.json and renders a live dashboard.",
  "priority": 2
}
```

**Vibe-kanban inspiration:** WebSocket streams broadcast execution state to all connected clients. SpecFlow doesn't need WebSockets — a progress file that other CLI sessions can poll is simpler and sufficient for the single-operator model.

**Dogfooding evidence:** The other session right now is doing `tail -100` on a task output file to monitor the headless pipeline. A structured progress file would replace this hack.

### F-12: Phase Transition Notifications (Notification)

```json
{
  "id": "F-12",
  "name": "Phase transition notifications — desktop alerts",
  "description": "At each phase transition (SPECIFY→PLAN, PLAN→TASKS, etc.), emit a notification via configurable backend: macOS osascript, PAI voice server (curl to localhost:8888), or custom webhook. Notifications include: feature ID, completed phase, next phase, any warnings. On pipeline failure, emit an urgent notification with error details. Configurable in .specflow/config.yaml: notification_backend (none|os|voice|webhook), notify_on (phase_complete|failure|review_needed|all).",
  "priority": 2
}
```

**Vibe-kanban inspiration:** Cross-platform notification service with sound. Triggers on task completion, approval requests, and failures.

**PAI integration:** The voice server at localhost:8888 is already the PAI notification backend. SpecFlow could use the same curl pattern.

### F-13: Approval Gates at Phase Boundaries (Approval)

```json
{
  "id": "F-13",
  "name": "Approval gates — human-in-the-loop phase transitions",
  "description": "Configurable approval gates at any phase boundary. In .specflow/config.yaml, define gates: { after_specify: auto|approve, after_plan: auto|approve, after_implement: approve, before_release: approve }. When gate=approve, pipeline pauses, writes approval request to .specify/pipeline/pending-approval.json (feature, phase, summary, artifacts to review), emits notification, and waits for `specflow approve F-N` or `specflow reject F-N --reason '...'`. Timeout configurable (default: no timeout — wait indefinitely). In headless mode, configurable default: timeout_action (wait|auto-approve|abort).",
  "dependencies": ["F-12"],
  "priority": 3
}
```

**Vibe-kanban inspiration:** Approval service with PendingApproval struct, oneshot response channels, configurable timeout, and approve/deny/timeout/cancel statuses.

**Key design choice:** Vibe-kanban defaults to auto-deny on timeout. For SpecFlow headless pipelines, the right default is wait-indefinitely — you don't want autonomous code generation to silently abort because a human wasn't watching.

### F-14: Pipeline Failure Recovery (Recovery)

```json
{
  "id": "F-14",
  "name": "Pipeline failure recovery — graceful degradation and resume",
  "description": "When a headless pipeline phase fails: (1) capture error context to .specify/pipeline/failure.json, (2) emit urgent notification, (3) set feature status to 'blocked' (not failed — recoverable), (4) if optional artifacts are missing (docs.md, verify.md), skip them with a warning rather than failing hard. New `specflow pipeline resume F-N` command picks up from the last successful phase. Artifact requirements configurable: { required: [spec.md, plan.md, tasks.md], optional: [docs.md, verify.md, architecture.md] }.",
  "priority": 2
}
```

**Vibe-kanban inspiration:** Execution process tracking with before/after git commits enables restore-to-point. Failure auto-transitions to InReview (not terminal failure).

**Dogfooding evidence:** The other session hit exactly this — the IMPLEMENT phase failed because docs.md and verify.md didn't exist. Those should be optional in headless mode. This feature makes the pipeline resilient.

### F-15: Execution Audit Log (Audit)

```json
{
  "id": "F-15",
  "name": "Execution audit log — phase-level tracking in SQLite",
  "description": "New execution_log table in features.db: feature_id, phase, started_at, completed_at, duration_seconds, status (success|failed|skipped), git_sha_before, git_sha_after, artifacts_produced (JSON array), error_message. Every phase execution writes a row. `specflow log F-N` shows the execution history. `specflow log F-N --phase implement` shows details for a specific phase. This gives rollback capability (git_sha_before) and performance visibility.",
  "dependencies": ["F-1"],
  "priority": 3
}
```

**Vibe-kanban inspiration:** ExecutionProcess model tracks every agent run with before/after commit SHAs, exit codes, stdout/stderr, and dropped flag for soft-delete.

---

## 5. Enhancements to Existing Features

### F-6/7/8 (Review Command) — Enriched by Vibe-Kanban Patterns

The current review features (F-6: automated checks, F-7: AI alignment, F-8: human template) are solid but miss the **state transition** that makes review exception-based:

**Enhancement:** After F-8 generates the review template, the feature should transition to a `REVIEW` status in the database. The human gets notified. The pipeline pauses. Only `specflow approve-review F-N` or submitting feedback (which returns the feature to IMPLEMENT) continues the pipeline.

This mirrors vibe-kanban's `InProgress → InReview → (feedback) → InProgress` or `InReview → Done` flow.

### F-5 (Brownfield Apply) — Approval Integration

F-5 currently says "Human approves each change category via interactive prompts (or auto-approve in headless mode)." With F-13, this becomes: in headless mode, pause at the approval gate and notify the human rather than auto-approving. Delta spec changes to an existing codebase are exactly the kind of decision that should bubble up.

### Headless Pipeline (not in features.json but exists as PR #7)

The pipeline should distinguish **required** vs **optional** artifacts per phase:

| Phase | Required | Optional |
|-------|----------|----------|
| SPECIFY | spec.md | - |
| PLAN | plan.md | architecture.md |
| TASKS | tasks.md | - |
| IMPLEMENT | source code, tests | docs.md, verify.md |
| COMPLETE | Doctorow gate pass | - |

This is F-14's core contribution — the pipeline shouldn't fail hard on optional artifacts.

---

## 6. Connection to Blackboard #78

The local blackboard proposal (pai-collab #78) and vibe-kanban solve the same problem at different scales:

| Aspect | Vibe-Kanban | Blackboard #78 | SpecFlow Extension |
|--------|-------------|----------------|-------------------|
| **Agent registry** | Execution process tracking in SQLite | agents.yaml with heartbeat | F-15 execution audit log |
| **Progress broadcasting** | WebSocket streams | progress.yaml append-only log | F-11 progress.json file |
| **Task claiming** | Task status model (todo→inprogress→inreview→done) | tasks.yaml with claiming protocol | Feature status in features.db |
| **Approval** | Approval service with timeout | Not specified | F-13 approval gates |
| **Token quota** | Not implemented | quota.yaml with reservation | Future (connect to blackboard) |
| **Notification** | OS notifications + sound | Not specified (gap) | F-12 phase notifications |

**The insight:** Vibe-kanban validates the blackboard #78 design but also fills gaps:
- Blackboard #78 has no notification mechanism — F-12 provides one
- Blackboard #78 has no approval protocol — F-13 provides one
- Vibe-kanban's approval timeout pattern should inform the blackboard's claiming protocol (stale detection)

**Recommended blackboard enhancement from vibe-kanban:** Add a `notifications` section to the blackboard schema and an `approvals` section for pending human decisions. This makes the blackboard not just a ledger but an active coordination surface.

---

## 7. The Orchestration Architecture (Updated)

Incorporating vibe-kanban patterns into the four-layer model:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 4: ORCHESTRATION (enhanced with vibe-kanban patterns)            │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │  Maestro /   │  │  Local       │  │  SpecFlow    │                  │
│  │  Shell       │  │  Blackboard  │  │  Pipeline    │                  │
│  │  (dispatch)  │  │  (#78)       │  │  (self-orch) │                  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                  │
│         │                 │                  │                           │
│         └────────┬────────┴─────────┬────────┘                          │
│                  │                  │                                    │
│  ┌───────────────┴──────────────────┴───────────────────┐              │
│  │  SHARED PRIMITIVES (from vibe-kanban)                  │              │
│  │                                                        │              │
│  │  F-11: Progress file     (VISIBILITY)                  │              │
│  │  F-12: Notifications     (NOTIFICATION)                │              │
│  │  F-13: Approval gates    (APPROVAL)                    │              │
│  │  F-14: Failure recovery  (RECOVERY)                    │              │
│  │  F-15: Execution log     (AUDIT)                       │              │
│  └────────────────────────────────────────────────────────┘              │
├─────────────────────────────────────────────────────────────────────────┤
│  LAYER 3: PROCESS (unchanged)                                           │
│  SPECIFY → PLAN → IMPLEMENT → COMPLETE →                                │
│    HARDEN → CONTRIB → REVIEW → RELEASE → EVOLVE                        │
├─────────────────────────────────────────────────────────────────────────┤
│  LAYER 2: TOOLING (F-1 through F-10)                                    │
├─────────────────────────────────────────────────────────────────────────┤
│  LAYER 1: EXTERNAL AGENTS (Greptile, BugBot, etc.)                      │
└─────────────────────────────────────────────────────────────────────────┘
```

The key insight: F-11 through F-15 are **shared primitives** that any orchestrator (Maestro, blackboard, or SpecFlow's own pipeline) can use. They're not tied to a specific orchestration strategy.

---

## 8. What Vibe-Kanban Does That We Should NOT Adopt

Not everything transfers. These are vibe-kanban patterns that don't fit:

| Pattern | Why Not |
|---------|---------|
| **Git worktree per task** | SpecFlow is single-agent. Worktree isolation is a multi-agent pattern. Revisit when blackboard supports multi-agent. |
| **WebSocket streaming** | Over-engineered for single-operator. A progress file + polling is sufficient. |
| **Multi-agent support** (Claude, Codex, Gemini) | Council verdict: maintain Claude-only trust boundary. |
| **Web dashboard** | SpecFlow already has specflow-ui on localhost:3000. Don't duplicate. |
| **Message editing / replay** | Conversation management is the AI tool's job, not SpecFlow's. |

---

## 9. Priority Ordering for features.json Extension

If adding F-11 through F-15 to the lifecycle extension:

| Priority | Feature | Why This Order |
|----------|---------|---------------|
| **P2 (this sprint)** | F-11 Progress file | Immediate pain point — dogfooding showed no visibility into headless runs |
| **P2 (this sprint)** | F-14 Failure recovery | Immediate pain point — pipeline broke on missing optional artifacts |
| **P2 (next sprint)** | F-12 Notifications | Enables exception-based attention; no value without F-11 working first |
| **P3** | F-13 Approval gates | Depends on F-12 for notification; most valuable for review + release phases |
| **P3** | F-15 Execution log | Depends on F-1 (SQLite schema); valuable but not blocking |

---

## 10. Recommendations

1. **Add F-11 and F-14 to features.json immediately** — these address the exact problems observed in today's dogfooding session (no visibility, hard failure on optional artifacts)

2. **Add F-12, F-13, F-15 as P3 features** — these complete the Layer 4 orchestration primitives but aren't blocking current work

3. **Update blackboard #78** with notification and approval sections inspired by vibe-kanban's implementation — the blackboard proposal currently has no mechanism for these

4. **Enhance F-6/7/8** with a REVIEW state transition — don't just generate a review template, pause the pipeline and notify

5. **Make artifact requirements configurable** in the headless pipeline — the `{ required: [...], optional: [...] }` pattern from F-14 should be the first fix applied

---

## Appendix: Vibe-Kanban Architecture Summary

**Tech stack:** Rust backend, TypeScript/React frontend, SQLite, npm CLI (`npx vibe-kanban`)

**Hierarchy:** Project → Task → Workspace (git worktree) → Session (conversation) → ExecutionProcess (agent run)

**Task states:** `todo → inprogress → inreview → done | cancelled`

**Key services:**
- `WorkspaceManager` — git worktree lifecycle
- `ContainerService` — agent execution and process management
- `NotificationService` — cross-platform desktop notifications (osascript/notify-rust/PowerShell)
- `ApprovalService` — tool approval with timeout/cancel
- `EventService` — real-time WebSocket event broadcasting

**Approval flow:** Agent requests tool → PendingApproval created → timeout watcher spawned → human approves/denies OR timeout → agent proceeds

**Review flow:** Agent completes → auto-transition to InReview → human reviews diffs → line comments → submit feedback → back to InProgress OR merge → Done
