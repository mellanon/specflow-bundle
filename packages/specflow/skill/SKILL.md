---
name: SpecFlow
description: >-
  Spec-driven development orchestration. USE WHEN specflow, specify,
  spec-driven, feature pipeline, implement feature, plan feature,
  brownfield scan, pipeline status, approval gate, feature lifecycle,
  task breakdown, review feature, release feature, version bump, changelog.
---

# SpecFlow Skill

Spec-driven development orchestration for Claude Code. Routes natural-language requests to SpecFlow CLI workflows.

## Project Detection

Before any workflow:
1. Check CWD for `.specify/` or `.specflow/` directory
2. Walk parent directories up to filesystem root
3. If not found: suggest `specflow init`

## Routing Table

| Intent | Workflow | Trigger Examples |
|--------|----------|------------------|
| Project setup | [Init](Workflows/Init.md) | "init specflow", "set up spec-driven dev" |
| Feature management | [Features](Workflows/Features.md) | "add feature", "remove feature", "list features" |
| Specification | [Specify](Workflows/Specify.md) | "specify F-3", "write spec for caching" |
| Planning | [Plan](Workflows/Plan.md) | "plan F-3", "technical plan" |
| Task breakdown | [Tasks](Workflows/Tasks.md) | "break down F-3", "generate tasks" |
| Implementation | [Implement](Workflows/Implement.md) | "implement F-3", "build feature" |
| Completion | [Complete](Workflows/Complete.md) | "complete F-3", "finish feature" |
| Review | [Review](Workflows/Review.md) | "review F-3", "check implementation" |
| Release | [Release](Workflows/Release.md) | "release F-3", "package for contribution" |
| Status | [Status](Workflows/Status.md) | "specflow status", "pipeline state" |
| Brownfield | [Brownfield](Workflows/Brownfield.md) | "scan codebase", "onboard project" |
| Revision | [Revise](Workflows/Revise.md) | "revise spec", "update plan" |
| Full lifecycle | [Run](Workflows/Run.md) | "run specflow on F-3", "process all pending" |
| Phase hooks | [Hooks](Workflows/Hooks.md) | "configure phase hooks" |

## Ambiguous Intent Resolution

When the user says something like "F-3" or "run specflow on F-3" without specifying a phase:

1. Run `specflow status --json` to determine the feature's current phase
2. Route to the workflow matching the **next** phase in the lifecycle
3. If the feature is complete, suggest review or release workflows

## Interaction Modes

| Mode | When | Mechanism |
|------|------|-----------|
| Terminal-blocking | Approval gates, failures | AskUserQuestion |
| Push notification | Phase completions, review ready | Voice server + desktop |
| Passive ambient | Progress updates | Voice only, fire-and-forget |

## Notification Defaults (Start Noisy)

All notifications enabled by default. Users tune down via `.specflow/config.yaml`:

```yaml
notifications:
  voice: true
  desktop: true
  ambient: true
```
