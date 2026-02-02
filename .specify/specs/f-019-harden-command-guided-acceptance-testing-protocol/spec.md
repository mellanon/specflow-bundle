# Specification: Harden command — guided acceptance testing protocol

## Overview

New `specflow harden <feature-id>` command that fills the HARDEN phase gap by providing structured, guided acceptance testing. The command reads a feature's `spec.md` to extract acceptance criteria and functional requirements, generates a numbered test protocol, then enters an interactive agent-operator loop where the agent drives test execution and the operator confirms pass/fail results. Features passing all required tests proceed to COMPLETE; failures return the feature to IMPLEMENT with documented issues.

This addresses the zero-tooling gap for acceptance testing identified in landscape research, bridging the space between implementation and completion with verifiable quality evidence.

## User Scenarios

### Scenario 1: Generate test protocol from specification

- **Given** feature F-11 has a completed `spec.md` with functional requirements and acceptance criteria
- **When** the operator runs `specflow harden F-11`
- **Then** the command parses `spec.md`, extracts testable criteria, and generates `.specify/harden/{feature_id}/protocol.md` containing numbered test cases with description, preconditions, steps, expected result, and pass/fail fields

### Scenario 2: Interactive test execution loop

- **Given** a test protocol has been generated for F-11
- **When** the agent begins executing test case TC-1
- **Then** the agent performs the test action (browser automation, CLI invocation, or manual instruction), displays the result, and prompts the operator to confirm pass or fail

### Scenario 3: Operator steers the test session

- **Given** the interactive loop is active on test case TC-3
- **When** the operator says "skip this" or "add a test for edge case X"
- **Then** the agent skips the current test (marking it as skipped) or appends a new ad-hoc test case to the protocol and continues

### Scenario 4: All tests pass — feature proceeds

- **Given** all required test cases in the protocol have status "pass"
- **When** the test session completes
- **Then** the command generates `.specify/harden/{feature_id}/harden-report.md` with a pass/fail summary and the feature is eligible to proceed to COMPLETE

### Scenario 5: Test failures — feature returned to IMPLEMENT

- **Given** one or more required test cases have status "fail"
- **When** the test session completes
- **Then** the command generates `harden-report.md` documenting failures with reproduction details, and the feature phase is set back to IMPLEMENT with specific issues recorded

### Scenario 6: Resume interrupted session

- **Given** a harden session was interrupted (terminal closed, timeout)
- **When** the operator runs `specflow harden F-11` again
- **Then** the command detects the existing protocol with partial results and offers to resume from the last incomplete test case

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Parse `spec.md` to extract acceptance criteria from User Scenarios (Given/When/Then) and Functional Requirements table | High |
| FR-2 | Generate structured test protocol at `.specify/harden/{feature_id}/protocol.md` with numbered test cases | High |
| FR-3 | Each test case includes: ID (TC-N), description, preconditions, steps, expected result, test type (automated/manual/hybrid), and status (pending/pass/fail/skipped) | High |
| FR-4 | Enter interactive loop: agent executes test, displays result, operator confirms pass/fail | High |
| FR-5 | Support three test execution modes: browser automation (Playwright) for UI tests, CLI invocation for API/command tests, manual instruction for human-only verification | Medium |
| FR-6 | Accept operator steering commands during the loop: skip current test, add ad-hoc test, retry failed test, try specific edge case | High |
| FR-7 | Generate `harden-report.md` on session completion with: summary statistics, per-test results, failure details, session duration | High |
| FR-8 | On all-pass: feature eligible for COMPLETE phase transition | High |
| FR-9 | On any-fail: feature phase set to IMPLEMENT with failure issues documented in the report | High |
| FR-10 | Detect existing partial protocol and offer resume on re-invocation | Medium |
| FR-11 | Validate that feature has completed the TASKS phase before allowing harden (phase gate) | High |
| FR-12 | Record harden results in the specflow database for audit trail | Medium |
| FR-13 | Support `--dry-run` flag to generate protocol without entering interactive loop | Low |

## Non-Functional Requirements

### Reliability
- Protocol file must use atomic writes (consistent with progress-writer.ts pattern) to prevent corruption on interruption
- Partial results must be preserved if the session is interrupted

### Performance
- Protocol generation from spec parsing should complete within interactive response time (< 5 seconds)
- No requirement for real-time test execution — tests run at agent/operator pace

### Compatibility
- Must integrate with existing phase lifecycle: specify -> plan -> tasks -> implement -> **harden** -> complete
- Must work with the existing `RunnerCallbacks` interface for progress reporting
- Protocol and report formats must be readable as standalone markdown documents

### Observability
- Harden sessions should emit progress updates compatible with the pipeline progress system (F-11)
- Session start/end and per-test results should be auditable

## Success Criteria

- [ ] `specflow harden F-N` parses spec.md and generates a valid protocol.md with numbered test cases
- [ ] Interactive loop executes tests and records operator pass/fail confirmations
- [ ] Operator can skip, add, and retry tests during the session
- [ ] All-pass session generates harden-report.md and allows COMPLETE transition
- [ ] Failed session sets feature back to IMPLEMENT with documented issues
- [ ] Interrupted sessions can be resumed from last incomplete test
- [ ] Phase gate prevents hardening features that haven't completed TASKS phase
- [ ] Protocol and report files are well-formed, human-readable markdown

## Test Protocol Schema

Each test case in `protocol.md` follows this structure:

```markdown
### TC-1: [Description derived from acceptance criterion]

- **Source:** FR-1 / Scenario 1
- **Type:** automated | manual | hybrid
- **Preconditions:** [What must be true before this test]
- **Steps:**
  1. [Action 1]
  2. [Action 2]
- **Expected Result:** [Observable outcome]
- **Status:** pending | pass | fail | skipped
- **Notes:** [Operator observations, failure details]
```

## Harden Report Schema

```markdown
# Harden Report: F-N — [Feature Name]

## Summary
- **Date:** [ISO 8601]
- **Total Tests:** N
- **Passed:** N | **Failed:** N | **Skipped:** N
- **Result:** PASS | FAIL

## Test Results

| TC | Description | Type | Status | Notes |
|----|-------------|------|--------|-------|
| TC-1 | ... | automated | pass | |
| TC-2 | ... | manual | fail | [failure detail] |

## Issues Found
[List of failures with reproduction details]

## Recommendation
[PROCEED to COMPLETE | RETURN to IMPLEMENT with issues]
```

## Assumptions

1. The spec.md format follows the established convention with "User Scenarios" and "Functional Requirements" sections — the parser depends on these heading patterns
2. Browser automation (Playwright) availability is optional — tests requiring it will be marked as "manual" if Playwright is not installed
3. The HARDEN phase is inserted between IMPLEMENT and COMPLETE in the phase lifecycle, requiring a phase enum update in types.ts
4. **Resolved**: Batch mode (`specflow harden --all`) is supported — processes features sequentially, entering the interactive loop for each. Single-feature remains the primary invocation pattern.
5. **Resolved**: Both execution models are supported. Agent drives automated tests (CLI, Playwright) and operator confirms results. For manual-only tests (e.g., "verify UX feels right"), agent displays instructions and operator self-reports pass/fail. The `hybrid` test type in FR-5 covers the mixed model.
6. **Resolved**: No limit on generated test cases. All extractable criteria from spec.md are included in the protocol. Operator can skip individual tests during the session using steering commands (FR-6).
7. **Resolved**: Harden operates independently from F-13 approval gates. Harden IS the quality phase with its own pass/fail logic — approval gates are for phase boundaries between phases. Harden's pass/fail result directly determines whether the feature proceeds to COMPLETE or returns to IMPLEMENT.
