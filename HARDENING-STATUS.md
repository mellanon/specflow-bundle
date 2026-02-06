# SpecFlow Lifecycle Extension - Hardening Status

**Last Updated:** 2026-02-06
**Methodology:** Council-driven tiered verification (Architect, Designer, Engineer, Researcher synthesis)

## Summary

| Category | Count | Status |
|----------|-------|--------|
| **Hardened (Tier A)** | 2 | Deep testing with manual HITL |
| **Verified (Tier B)** | 8 | Static analysis + runtime smoke tests |
| **Manual Gate (Tier C)** | 5 | Manual verification checklist |
| **Flagged** | 9 | Implementation complete, spec pending |
| **Total** | 24 | |

## Tier A: Deep Testing Required

These features are on the critical path. Bugs here cascade to other features.

| ID | Name | Verification Method | Status |
|----|------|---------------------|--------|
| F-001 | Delta-spec SQLite schema | Manual HITL + integration tests | ⏳ Pending |
| F-019 | Harden command | External validation (bootstrap problem) | ⏳ Pending |

**F-019 Bootstrap Note:** The hardening tool cannot validate itself. F-019 requires external manual validation before it can be used to validate other features.

## Tier B: Verified (Static + Smoke Tests)

Display and formatting features where failures are visible but non-cascading.

| ID | Name | Verification Method | Status |
|----|------|---------------------|--------|
| F-011 | Pipeline progress file | Headless eval + CLI smoke test | ⏳ Pending |
| F-014 | Pipeline failure recovery | Headless eval + error handling test | ⏳ Pending |
| F-015 | Execution audit log | Headless eval + log output test | ⏳ Pending |
| F-016 | Autorun orchestration | Headless eval + pipeline test | ⏳ Pending |
| F-017 | Evolve command | Headless eval + status test | ⏳ Pending |
| F-020 | Semantic versioning | Headless eval + tag test | ⏳ Pending |
| F-021 | Phase hooks | Headless eval + hook execution test | ⏳ Pending |
| F-022 | Skill layer | Headless eval + routing test | ⏳ Pending |

## Tier C: Manual Verification Gate

Human touchpoints where trust failures matter more than functional failures.

| ID | Name | Verification Method | Status |
|----|------|---------------------|--------|
| F-012 | Phase notifications | Manual checklist (voice, desktop, log) | ⏳ Pending |
| F-013 | Approval gates | Manual checklist (prompt, approve, reject) | ⏳ Pending |
| F-018 | Review gate | Manual checklist (pause, resume) | ⏳ Pending |
| F-023 | Harden autorun (ARCHIVED) | ARCHIVED — replaced by template+ingest | ⏳ Pending |
| F-024 | Review evidence compiler (REVISED) | Manual checklist (evidence compilation, review package) | ⏳ Pending |

## Flagged: Implementation Complete, Spec Pending

These features were implemented before dogfooding started. They have placeholder specs with no testable criteria. Honest labeling per Council recommendation.

| ID | Name | Implementation Status | Spec Status |
|----|------|----------------------|-------------|
| F-002 | Spec versioning | ✅ Complete | ⚠️ Spec pending |
| F-003 | Brownfield scanner | ✅ Complete | ⚠️ Spec pending |
| F-004 | Brownfield delta-spec | ✅ Complete | ⚠️ Spec pending |
| F-005 | Brownfield apply | ✅ Complete | ⚠️ Spec pending |
| F-006 | Review automated checks | ✅ Complete | ⚠️ Spec pending |
| F-007 | Review AI verification (SUPERSEDED) | ❌ Deleted (ai-review.ts removed) | ⚠️ Spec pending |
| F-008 | Review package (REWORKED) | 🔄 Reworked (review-package-renderer.ts) | ⚠️ Spec pending |
| F-009 | Release gate engine | ✅ Complete | ⚠️ Spec pending |
| F-010 | Release contribution packaging | ✅ Complete | ⚠️ Spec pending |

**Note:** These features are functional but lack formal acceptance criteria. Spec extraction is recommended before production use. Per Council recommendation: "Transparency is the strategic moat."

## Verification Methodology

### Council Principles Applied

1. **Risk-tiered approach** — Not all features need the same rigor
2. **F-019 bootstrap first** — Cannot trust a self-validating tool
3. **Honest labeling** — "Hardened" vs "Implementation complete, spec pending"
4. **No ceremonial backfill** — Document gaps or do it properly
5. **Transparency** — Upstream maintainer sees honest verification status

### Verification Levels

| Level | Method | Confidence |
|-------|--------|------------|
| **Deep Testing** | Manual HITL walkthrough + integration tests | High |
| **Verified** | Headless eval + runtime smoke tests + visual check | Medium |
| **Manual Gate** | Human verification checklist | Medium |
| **Flagged** | No verification - implementation only | Low |

## Next Steps

1. [ ] Complete F-019 external validation (bootstrap unblock)
2. [ ] Run F-001 manual HITL session
3. [ ] Execute `specflow harden --all` for Tier B
4. [ ] Walk through Tier C manual checklists
5. [ ] Update this document with results
6. [ ] Commit with final hardening status
