# Council Debate: SpecFlow End-to-End UX with Vibe-Kanban HITL Patterns

**Council Members:** UX Designer (Aditi), Architect (Serena), Engineer (Marcus), Operator (Andreas persona)
**Rounds:** 3 (Positions → Responses → Synthesis)
**Date:** 2026-02-02

---

## Context

Five new HITL features proposed for SpecFlow lifecycle extension (F-11 through F-15): Progress file (visibility), Notifications (desktop alerts), Approval gates (human permission at phase boundaries), Failure recovery (graceful degradation + resume), Execution audit log. Inspired by vibe-kanban (BloopAI) patterns: InReview state, approval service with timeout, desktop notifications + sound, progress streaming, diff-based review.

**Debate question:** How should an operator experience the full SpecFlow lifecycle from a UX perspective? When should the system interrupt them? What should notifications look like? How should approval gates feel? What's the right balance between autonomous execution and human oversight?

---

## Round 1: Initial Positions

**🎨 Designer (Aditi):**
The attention contract must be sacred. "Exception-based attention" means the tool should be **silent by default**, with interruptions carrying *weight*. Every notification must answer: "Why does this require human judgment RIGHT NOW?" We need **passive progress visibility** separate from **active interruption**. Progress file is hygiene, not interruption. Audit log is forensics. These should exist but never demand attention. Approval gates are the friction point — if every gate creates a modal interrupt, the operator will either ignore them (notification blindness) or context-switch constantly (cognitive thrashing). **Tiered urgency** is critical. Notifications need ruthless filtering: Completion? Silence. Recoverable error? Log it, retry. Unrecoverable error requiring human decision? Desktop alert + sound. The *sound* creates Pavlovian association with "this is serious." CLI-first means progress visibility must work in terminal-native patterns: `specflow status`, structured log streaming, color-coded output.

**🏛️ Architect (Serena):**
I advocate for a **layered state machine** with clear separation between execution state and approval workflow. Approval gates are NOT new states in the phase machine — they're **workflow decorators**. A phase like PLAN has a completion predicate; an approval gate adds "AND human says proceed." The phase state remains `PLAN` with substatus `awaiting_approval`, not a new `PLAN_APPROVAL` state. This keeps the core state machine clean and allows HITL to be stripped for pure autonomous mode. For events, I propose a **hybrid push/pull model**: phase transitions emit immutable events to an audit log. Approval gates subscribe and inject PendingApproval records into a separate queue. The execution engine polls at phase boundaries. This decouples state machine logic from approval timing. For CLI vs blackboard separation: CLI owns the **execution state machine**, blackboard owns **coordination primitives**. The progress file and audit log are **shared artifacts** — written by CLI, consumed by blackboard or human. Notifications are **side effects** that don't affect execution.

**⚙️ Engineer (Marcus):**
File-based progress is the right architecture. Write `progress.json` on every phase transition. Any terminal can poll it. Vibe-kanban's WebSocket streaming is overkill for a CLI. Notifications should be fire-and-forget — execute `osascript`, hit the voice server, or POST to a webhook — all async, all optional. Never block pipeline on notification delivery. Approval gates are just conditional continues — check config for `require_approval_after`, if set, write approval request, exit with code 2 (needs approval), let operator run `specflow approve F-N`. No daemon needed. Audit log is just INSERT statements into `pipeline_events` table. This keeps SpecFlow a CLI tool, not a service.

**👤 Operator (Andreas persona):**
I'm living in terminal chaos. When I kick off `specflow pipeline F-1`, I have **zero visibility** until I manually check back. I found out 20 minutes late that a pipeline crashed because `docs.md` didn't exist — no notification, just silence. **ALWAYS interrupt me for:** failures, spec review before implementation, implementation review, release approval. **NEVER interrupt me for:** phase transitions when everything's green, progress updates, successful intermediate completions. **My notification hierarchy:** (1) Blocking failures → voice alert + pause + wait for fix, (2) Review gates → voice alert + summary + wait for approval, (3) Background status → observable log file only, (4) Completion → voice notification, no action required. I want to check a dashboard when *I'm* curious, but be **pulled in only when I'm actually needed**.

---

## Round 2: Responses & Challenges

**🎨 Designer (Aditi):**
Marcus, I'm challenging "notifications are fire-and-forget." That's how we got notification fatigue. Serena's right they're side effects, but the gap is: **notifications need context hierarchy AND delivery confirmation.** When Andreas says "ALWAYS interrupt for failures," he means it. But "interrupt" in CLI context needs to be: (1) **terminal-blocking** for review gates (actual prompt), (2) **persistent visual** for failures (status file + next command shows it), (3) **passive ambient** for progress (queryable, not pushed). Serena, your "approval gates as decorators" is elegant, but what does the human SEE and DO at each gate? Exit code 2 tells the process to wait. But the human needs clear prompt text, contextual diff/summary, and explicit approval action. We need interaction design for each gate type, not just state transitions.

**🏛️ Architect (Serena):**
Marcus, I challenge "exit code 2" for approval gates. That's CLI protocol abuse — exit codes signal *process health*, not workflow control. A blocked approval is not an error; it's a valid state. Instead: exit 0 with structured output `{"status":"awaiting_approval","gate":"spec_review"}`. Andreas, you list failures as "blocking interruptions," but Aditi's right — we need urgency *tiers*. Test failure during exploratory dev? Background. Release pipeline failure? Blocking alert. Context determines urgency, not event type alone. The blackboard IS the passive layer — `specflow status` reads it. Notifications are *ephemeral alerts*, blackboard is *durable state*. Pre-compute `status.json` on every state write. Human-in-loop doesn't change the state machine — it adds *dwell time* to existing transitions.

**⚙️ Engineer (Marcus):**
Serena's decorator pattern is elegant but adds abstraction cost. I want explicit conditional logic, no overlay. Aditi's Pavlovian concern is valid but I challenge "silent by default" — Andreas explicitly said "ALWAYS interrupt for failures and review gates." That's active interruption by user requirement. Let's honor what he asked for. The real engineering question: exit code 2 (pause-and-resume, stateless) vs. blocking subprocess that awaits approval (hidden state)? I vote exit code 2 — keeps SpecFlow stateless. One `notify-operator` function, fire-and-forget, no ceremony.

**👤 Operator:**
Aditi, I challenge "silent by default." When I'm running four parallel sessions, silence means **I don't know if agents are stuck, waiting on me, or making progress.** The anxiety of not knowing burns more attention than controlled interrupts. Marcus, file-based progress is elegant but who's polling? Shifting cognitive load back to me. I need the system to **push critical state changes** so I can trust the silence when nothing needs attention. Serena's hybrid model gets closer — `@human-review` annotations without restructuring. But the blackboard must actively notify on decorator triggers. **Trust requires visibility. I'll accept silence only after the system proves it interrupts correctly.**

---

## Round 3: Synthesis

**🎨 Designer (Aditi):**
We agree on: urgency is contextual not event-based (unanimous), state lives in blackboard with ephemeral notifications, file-based progress, critical events always interrupt. My final recommendation: **Three-tiered interaction model** — (1) terminal-blocking for `@human-review` gates, (2) push notifications for failures/releases (operator's trust requirement), (3) passive polling for progress. The operator is right: silence breeds anxiety in multi-session workflows. Compromise: structured JSON in blackboard + targeted voice notifications for critical state transitions only. Honor `@human-review` annotations (operator), use JSON for machine parsing (Serena), keep CLI stateless (Marcus), design around user mental models not system events (me).

**🏛️ Architect (Serena):**
Consensus on three pillars: (1) **Structured JSON output over exit codes** — JSON carries urgency tier, context, gate type. (2) **Context-aware interruption hierarchy** — operator won; silence isn't trust when running parallel sessions. Push critical, passive for routine. (3) **Blackboard as pre-computed status source** — notifications read `status.json`, don't compute. Remaining disagreement: Marcus wants explicit conditionals over decorators. Compromise: decorators for gate *configuration*, explicit conditionals for gate *execution*.

**⚙️ Engineer (Marcus):**
We converged: urgency is contextual, not event-based. Where I still push back: decorator pattern adds indirection. My recommendation: (1) gate definition includes `urgency: blocking|alert|silent`, (2) operator sets urgency via annotation in spec, (3) CLI emits structured JSON with urgency field, (4) single `notify-operator` function reads urgency, picks channel. **Start with operator's explicit intent, not inferred behavior.** Ship the simplest thing that respects their control.

**👤 Operator:**
Universal agreement on push-critical, pull-routine hybrid. `@human-review` annotations resonated — the spec drives notification behavior. Aditi's three interaction modes stuck: **terminal-blocking** (spec review, release approval), **persistent visual** (test failures, build errors), **passive ambient** (transitions, progress). **Trust requires visibility first.** Push critical changes so silence means "all good." Start noisy, tune down as trust builds.

---

## Council Verdict

### Areas of Convergence (4/4 agreed)

- **Structured JSON protocol** over exit codes — urgency tier, context, gate type in output
- **Push critical, pull routine** — failures/reviews/releases interrupt; progress is queryable
- **Annotation-driven gates** — `@human-review`, `@notify-on-fail` in spec files declare urgency
- **Three interaction modes** — terminal-blocking, persistent visual, passive ambient
- **Blackboard = durable state, notifications = ephemeral alerts** — `status.json` precomputed on every transition
- **Operator controls urgency** — spec author declares what's blocking vs. ambient

### Remaining Disagreements

- **Decorators vs explicit conditionals** — Serena/Aditi want declarative metadata; Marcus wants explicit control flow. Compromise: declarative config, explicit execution.
- **Silent-by-default vs push-first** — Aditi says silent; Operator says "earn my trust with visibility first." Operator wins for v1.

### Recommended Design

| Element | Decision |
|---------|----------|
| **Gate urgency** | Three tiers: `critical` (blocking), `review` (push alert), `ambient` (log only) |
| **Gate declaration** | Annotations in spec: `@interrupt: critical` |
| **Output protocol** | Structured JSON with urgency field, not exit codes |
| **Notification routing** | Voice + desktop for critical, desktop for review, log for ambient |
| **Progress visibility** | `status.json` updated every transition, `specflow status` reads it |
| **Trust model** | Start noisy (push critical + review), operator tunes down as trust builds |
