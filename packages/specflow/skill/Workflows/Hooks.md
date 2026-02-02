# Hooks Workflow

## Trigger Phrases
- "configure phase hooks"
- "add pre-implement hook"
- "setup hooks"
- "specflow hooks"

## Context Requirements
- [ ] SpecFlow project detected (`.specify/` exists)
- [ ] `.specflow/config.yaml` exists (or will be created)

## Procedure

### Step 1: Show Current Configuration
```bash
cat .specflow/config.yaml 2>/dev/null || echo "No config file found"
```

### Step 2: Configure Hooks

Phase hooks are configured in `.specflow/config.yaml` under the `hooks` section:

```yaml
hooks:
  default_timeout: 30
  specify:
    pre:
      - "echo 'Starting specify phase'"
    post:
      - "./scripts/notify-slack.sh"
  implement:
    pre:
      - command: "./scripts/lint-check.sh"
        timeout: 60
    post:
      - "./scripts/post-build-report.sh"
```

Available phases: `specify`, `plan`, `tasks`, `implement`

**Pre-hooks**: Run before the phase. Non-zero exit aborts the phase.
**Post-hooks**: Run after the phase. Failures are logged but do not block.

### Step 3: Environment Variables

Hooks receive these environment variables:
- `SPECFLOW_FEATURE_ID` - Current feature ID
- `SPECFLOW_PHASE` - Current phase name
- `SPECFLOW_PROJECT_PATH` - Absolute project path
- `SPECFLOW_PHASE_STATUS` - (post-hooks only) success/failed/skipped/blocked

### Step 4: Verify
After editing config, test a hook:
```bash
SPECFLOW_FEATURE_ID=F-1 SPECFLOW_PHASE=implement SPECFLOW_PROJECT_PATH=$(pwd) sh -c "<command>"
```

## Error Handling

| Error | Action |
|-------|--------|
| Invalid YAML | Show parse error, suggest fix |
| Unknown phase name | List valid phases |
| Hook timeout | Explain timeout configuration |

## Notification Tiers

This workflow is configuration-only. No notifications emitted.
