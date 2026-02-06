#!/bin/bash
# Update placeholder specs for F-002 through F-010
# Per Council recommendation: honest labeling, not ceremonial backfill

set -e

SPECS_DIR=".specify/specs"

update_spec() {
  local id=$1
  local name=$2
  local desc=$3
  local dir="$SPECS_DIR/f-${id}-implemented"

  echo "Updating $dir/spec.md..."

  cat > "$dir/spec.md" << EOF
# F-${id} — ${name}

**Status:** Implementation complete, spec pending
**Tier:** Flagged (pre-dogfooding implementation)

## Description

${desc}

## Acceptance Criteria

_To be extracted from implementation. This feature was implemented before dogfooding started._

## Verification Status

- [ ] Spec extraction pending
- [ ] Manual verification pending
- [ ] Acceptance tests pending

---

_This placeholder was updated per Council recommendation: "Transparency is the strategic moat. Document gaps honestly rather than ceremonial backfill."_
EOF
}

# F-002
update_spec "002" "Spec versioning — snapshot on phase completion" \
"When a feature completes the SPECIFY phase (spec.md written), automatically create a version snapshot in spec_versions. When spec is revised via \`specflow revise\`, create a new version and compute delta records in spec_deltas. This gives every spec a version history without manual intervention."

# F-003
update_spec "003" "Brownfield codebase scanner" \
"New \`specflow brownfield scan\` subcommand that analyzes an existing codebase directory and extracts a structural inventory: files, exports, functions, types, dependencies. Output is a JSON manifest stored in .specify/brownfield/scan.json. Uses AST parsing for TypeScript or falls back to heuristic extraction for other languages."

# F-004
update_spec "004" "Brownfield delta-spec generator" \
"New \`specflow brownfield diff\` subcommand that compares the codebase scan against the latest spec baseline and produces a delta-spec showing ADDED/MODIFIED/REMOVED elements. Uses AI (headless Claude) to classify changes semantically, not just structurally. Output: delta-spec.md with categorized changes and proposed spec updates."

# F-005
update_spec "005" "Brownfield spec evolution — apply delta to create new version" \
"New \`specflow brownfield apply\` subcommand that takes a reviewed delta-spec and applies approved changes to create a new spec version. Human approves each change category (ADDED/MODIFIED/REMOVED) via interactive prompts (or auto-approve in headless mode). Committed version stored in spec_versions with full delta trail."

# F-006
update_spec "006" "Review command — automated checks layer" \
"New \`specflow review\` command, layer 1: run automated checks (typecheck, lint, test) and verify spec-code file alignment (do files referenced in spec exist? do exports match?). Produces review.md artifact in .specify/reviews/ with pass/fail per check."

# F-007
update_spec "007" "Review command — AI spec-code alignment verification" \
"Layer 2 of \`specflow review\`: AI-powered analysis (headless Claude) that reads spec.md and the implementation code, then evaluates whether the code faithfully implements the specification. Extends the Doctorow Gate pattern to review scope. Appends findings to review.md."

# F-008
update_spec "008" "Review command — structured human review template" \
"Layer 3 of \`specflow review\`: generates a structured review template for human reviewers with sections pre-filled from automated and AI findings. Includes checklist items, risk areas flagged by AI, and a sign-off section. Output appended to review.md."

# F-009
update_spec "009" "Release command — gate evaluation engine" \
"New \`specflow release\` command that evaluates 8 gates sequentially: (1) all features complete, (2) quality evals pass, (3) CHANGELOG generated from spec deltas, (4) file inventory produced. Stops on first failure with actionable guidance. Produces release-readiness.md report."

# F-010
update_spec "010" "Release command — contribution packaging" \
"Gates 5-8 of \`specflow release\`: (5) PII/secrets scan, (6) contribution branch creation from upstream/main, (7) sanitization verification (no personal paths, no credentials), (8) PR template generation. Integrates with existing contrib-prep command. Output: ready-to-push branch with PR description."

echo ""
echo "✅ Updated 9 placeholder specs with honest labeling"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff .specify/specs/"
echo "  2. Commit: git add .specify/specs/ && git commit -m 'docs: Update placeholder specs with honest verification status'"
