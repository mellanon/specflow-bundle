# SpecFlow CLI Reference

The `specflow` CLI is installed at `~/bin/specflow`. All commands below are **bash commands**.

## Quick Reference

| Operation | Command | Notes |
|-----------|---------|-------|
| List features | `specflow status` | **Always run first** to see current state |
| Add feature | `specflow add "<name>" "<description>"` | IDs auto-generated (F-1, F-2...) |
| Remove feature | `specflow remove <id> [--force]` | Keeps spec files unless manually deleted |
| Edit feature | `specflow edit <id> --name/--description/--priority` | Cannot change ID |
| Set phase | `specflow phase <id> <phase>` | none, specify, plan, tasks, implement |
| Create spec | `specflow specify <id> [--quick] [--batch]` | Creates spec.md, sets phase |
| Enrich feature | `specflow enrich <id>` | Add missing batch fields interactively |
| Create plan | `specflow plan <id>` | Creates plan.md, sets phase |
| Create tasks | `specflow tasks <id>` | Creates tasks.md, sets phase |
| Complete | `specflow complete <id>` | Validates artifacts + Doctorow Gate |
| Complete (skip gate) | `specflow complete <id> --skip-doctorow` | Skip Doctorow Gate checklist |
| Revise | `specflow revise <id> --spec/--plan/--tasks` | Revise artifact based on feedback |
| Revise history | `specflow revise <id> --history` | Show revision history |
| Reset | `specflow reset <id>` | Return to pending |
| Skip | `specflow skip <id>` | Move to end of queue |
| Run evals | `specflow eval run` | Run quality evaluations |
| Migrate | `specflow migrate-registry` | Import from SpecKit JSON (one-time) |
| Harden | `specflow harden <id>` | Generates acceptance-test.md |
| Harden ingest | `specflow harden <id> --ingest` | Parse filled template -> results.json |
| Harden status | `specflow harden --status` | Show AT progress per feature |
| Review | `specflow review <id>` | Compile review package |
| Review all | `specflow review --all` | Review all features |
| Review status | `specflow review --status` | Show review status |
| Approve | `specflow approve <id>` | Approve feature |
| Reject | `specflow reject <id> --reason "<text>"` | Reject with reason |
| Evolve | `specflow evolve <id>` | Transition to brownfield |
| Release | `specflow release <id> [--json]` | 8-gate readiness evaluation |
| Contrib prep | `specflow contrib-prep <id>` | 5-gate contribution packaging |
| Brownfield scan | `specflow brownfield scan <path>` | Scan codebase structure |
| Brownfield diff | `specflow brownfield diff <id>` | Compare scan vs spec |
| Brownfield apply | `specflow brownfield apply <id>` | Apply approved changes |
| Inbox | `specflow inbox` | Review queue — pending approvals ranked by priority |
| Inbox verbose | `specflow inbox --verbose` | Expanded view with per-item guidance |
| Inbox JSON | `specflow inbox --json` | JSON output for tooling |
| Audit all | `specflow audit` | Spec-reality drift detection, all features |
| Audit single | `specflow audit <id>` | Audit one feature |
| Audit JSON | `specflow audit --json` | JSON report |
| Audit fix | `specflow audit --fix` | Print suggested fix commands only (pipeable) |
| Audit check | `specflow audit --check <name>` | Run single checker (db-status, spec-code, json-sync, phase-artifacts, spec-freshness) |
| Audit by status | `specflow audit --status <status>` | Filter by feature status |

## Full Command Help

Run `specflow --help` for complete command list, or `specflow <command> --help` for command-specific options.

## CLI-Only Rule

**NEVER directly manipulate the specflow database (features.db).**

The `specflow` CLI is the ONLY interface for feature management. Direct SQLite access:
- Bypasses validation and hooks
- Creates orphaned or inconsistent state
- Breaks the tooling contract

**Exception:** Linking orphaned spec directories (spec_path field only) when CLI has no equivalent command.

## Artifact Revision

When quality gates fail or feedback requires changes:

```bash
# Revise spec with feedback
specflow revise F-1 --spec --feedback "Add more specific acceptance criteria"

# Revise plan
specflow revise F-1 --plan --feedback "Address failure modes for external APIs"

# Revise tasks
specflow revise F-1 --tasks --feedback "Break down T-1.3 into smaller units"

# Interactive mode (prompts for artifact and feedback)
specflow revise F-1

# View revision history
specflow revise F-1 --history

# Dry run (show what would happen)
specflow revise F-1 --spec --feedback "test" --dry-run
```

Every revision is tracked with unique ID, timestamp, reason, and original content preserved.

## Harden Commands

```bash
specflow harden F-1                    # Generate acceptance tests
specflow harden F-1 --ingest           # Ingest filled template
specflow harden F-1 --dry-run          # Preview generation
specflow harden --all                  # Generate for all implemented features
specflow harden --status               # Show AT progress
```

## Review & Approval

```bash
specflow review F-1                    # Compile review package
specflow review --all                  # Review all features
specflow review --checks-only          # Run automated checks only
specflow review --status               # Show review status
specflow approve F-1                   # Approve feature
specflow reject F-1 --reason "Missing edge case handling"
```

## Inbox & Audit

```bash
specflow inbox                            # Priority-ranked review queue
specflow inbox --verbose                  # Expanded view with decision guidance
specflow inbox --json                     # JSON for tooling

specflow audit                            # Audit all features
specflow audit F-1                        # Audit single feature
specflow audit --json                     # JSON report
specflow audit --fix                      # Print fix commands only (pipeable)
specflow audit --check spec-code          # Run only spec-code alignment check
specflow audit --status complete          # Audit only completed features
```

## Evolve & Brownfield

```bash
specflow evolve F-1                    # Snapshot baseline, transition to brownfield
specflow brownfield scan ./src         # Scan codebase
specflow brownfield diff F-1           # Compare scan vs spec
specflow brownfield apply F-1          # Apply approved changes
```

## Release & Contribution

```bash
specflow release F-1                   # Run 8-gate evaluation
specflow release F-1 --json            # JSON output
specflow contrib-prep F-1              # Full 5-gate workflow
specflow contrib-prep F-1 --inventory  # Inventory only
specflow contrib-prep F-1 --sanitize   # Scan only
specflow contrib-prep F-1 --dry-run    # Preview
```
