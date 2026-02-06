# SpecFlow Lifecycle Extension - Hardening Plan

**Generated:** 2026-02-04
**Source:** Council debate synthesis (Architect, Designer, Engineer, Researcher)
**Total Budget:** 14-18 hours

## Executive Summary

22 features implemented. 13 have real specs with testable criteria. 9 have placeholder specs from pre-dogfooding era. Council recommends tiered hardening with honest labeling.

## Feature Classification

### Tier A: Deep Testing Required (Critical Path)
| ID | Name | Rationale |
|----|------|-----------|
| F-001 | Delta-spec SQLite schema | Database migrations - bugs cascade |
| F-019 | Harden command | Bootstrap problem - validates itself |

### Tier B: Static Analysis + Smoke Tests (Display/Formatting)
| ID | Name | Rationale |
|----|------|-----------|
| F-011 | Pipeline progress file | Status display |
| F-014 | Pipeline failure recovery | Error handling display |
| F-015 | Execution audit log | Logging display |
| F-016 | Autorun orchestration | Pipeline status |
| F-017 | Evolve command | Status reporting |
| F-020 | Semantic versioning | Tag display |
| F-021 | Phase hooks | Hook execution display |
| F-022 | Skill layer | Skill routing display |

### Tier C: Manual Verification Gate (Human Touchpoints)
| ID | Name | Rationale |
|----|------|-----------|
| F-012 | Phase notifications | Voice/desktop alerts - trust critical |
| F-013 | Approval gates | Human-in-the-loop - trust critical |
| F-018 | Review gate | Pipeline pause - operator decision |
| F-023 | Harden autorun (ARCHIVED) | ARCHIVED: Interactive evaluate-fix-retest loop removed |
| F-024 | Review evidence compiler (REVISED) | REVISED: Now compiles evidence for human review, no AI |

### Flagged: Implementation Complete, Spec Pending
| ID | Name | Rationale |
|----|------|-----------|
| F-002 | Spec versioning | Pre-dogfooding implementation |
| F-003 | Brownfield scanner | Pre-dogfooding implementation |
| F-004 | Brownfield delta-spec | Pre-dogfooding implementation |
| F-005 | Brownfield apply | Pre-dogfooding implementation |
| F-006 | Review automated checks | Pre-dogfooding implementation |
| F-007 | Review AI verification (SUPERSEDED — AI review removed) | Pre-dogfooding implementation |
| F-008 | Review human template (REWORKED — now review-package.md) | Pre-dogfooding implementation |
| F-009 | Release gate engine | Pre-dogfooding implementation |
| F-010 | Release contribution packaging | Pre-dogfooding implementation |

## Execution Phases

### Phase 0: Bootstrap Validation (2.5 hrs)
**MUST complete before any other hardening - F-019 validates itself**

- [ ] 0.1 Manual walkthrough of F-019 protocol (2 hrs)
  - Read each acceptance test in `packages/specflow/.specify/harden/f-019/acceptance-test.md`
  - Execute steps manually in terminal
  - Record pass/fail/skip for each
  - Update acceptance-test.md with results

- [ ] 0.2 Document external validation (30 min)
  - Create `f-019/external-validation.md`
  - Record validator name, date, methodology
  - Sign-off that F-019 is trustworthy

### Phase 1: Tier Classification & Labeling (2 hrs)

- [ ] 1.1 Update placeholder specs (1 hr)
  ```
  For F-002 through F-010:
  - Read feature description from features.json
  - Update spec.md with:
    # F-00X — [Name]

    **Status:** Implementation complete, spec pending
    **Tier:** Flagged (pre-dogfooding)

    ## Description
    [Copy from features.json]

    ## Acceptance Criteria
    _To be extracted from implementation_

    ## Verification Status
    - [ ] Spec extraction pending
    - [ ] Manual verification pending
  ```

- [ ] 1.2 Create feature tier mapping (30 min)
  - Add to features.json or create `tier-mapping.json`

- [ ] 1.3 Create HARDENING-STATUS.md (30 min)
  - Summary of hardened vs flagged features
  - Methodology used for each tier

### Phase 2: Tier A Deep Testing (4 hrs)

- [ ] 2.1 F-001 manual HITL session (2 hrs)
  ```bash
  cd packages/specflow
  specflow harden F-001
  # Walk through each test case interactively
  ```

- [ ] 2.2 F-019 integration verification (2 hrs)
  - Verify acceptance test generation works
  - Verify template ingest produces valid results.json

### Phase 3: Tier B Static + Smoke Tests (4 hrs)

- [ ] 3.1 Run headless evaluation (1 hr)
  ```bash
  specflow harden --all
  ```

- [ ] 3.2 Add runtime smoke tests (2 hrs)
  - For each Tier B feature, run one CLI command
  - Verify exit code and basic output format
  - Document in smoke-tests.md

- [ ] 3.3 Visual spot-check (1 hr)
  - Run each status/display command
  - Verify terminal output formatting
  - Check for escape sequence issues

### Phase 4: Tier C Manual Gates (3 hrs)

- [ ] 4.1 Create verification checklists (1 hr)
  - F-012: Test voice notification, desktop notification, log-only modes
  - F-013: Test approval prompt, auto-approve, rejection handling
  - F-018: Test review gate pause and resume
  - F-023: ARCHIVED — interactive loop removed, template+ingest replaced it
  - F-024: Test evidence compilation and review-package.md generation

- [ ] 4.2 Execute manual verification (2 hrs)
  - Walk through each checklist
  - Record results in `manual-verification.md`

### Phase 5: Optional Spec Extraction (2 hrs)
**Only if time permits - Council compromise**

- [ ] 5.1 Extract F-012 acceptance criteria (1 hr)
  - Read implementation in `src/lib/notifications/`
  - Extract implicit acceptance criteria
  - Write real spec.md

- [ ] 5.2 Extract F-013 acceptance criteria (1 hr)
  - Read implementation in `src/lib/approval/`
  - Extract implicit acceptance criteria
  - Write real spec.md

### Phase 6: Final Documentation (1 hr)

- [ ] 6.1 Update README (30 min)
  - Add hardening methodology section
  - Link to HARDENING-STATUS.md

- [ ] 6.2 Generate review report (15 min)
  ```bash
  specflow review --all
  ```

- [ ] 6.3 Commit results (15 min)
  ```bash
  git add -A
  git commit -m "feat(specflow): Complete tiered hardening for lifecycle extension"
  ```

## Success Criteria

- [ ] F-019 externally validated before other hardening
- [ ] All Tier A features pass manual HITL
- [ ] All Tier B features have smoke test + visual verification
- [ ] All Tier C features have documented manual verification
- [ ] 9 flagged features have honest "spec pending" labels
- [ ] HARDENING-STATUS.md documents verification methodology
- [ ] Total effort within 14-18 hour budget

## Council Principles Applied

1. **Risk-tiered approach** - Not all features need same rigor
2. **F-019 bootstrap first** - Can't trust self-validating tool
3. **Honest labeling** - "Hardened" vs "Implementation complete, spec pending"
4. **No ceremonial backfill** - Document gaps or do it properly
5. **Transparency is the moat** - Upstream maintainer sees honest status
