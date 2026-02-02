# Brownfield Workflow

## Trigger Phrases
- "scan codebase"
- "brownfield scan"
- "onboard existing code"
- "onboard project"
- "analyze existing codebase"

## Context Requirements
- [ ] Current directory contains source code
- [ ] SpecFlow may or may not be initialized

## Procedure

### Phase 1: SEARCH
```bash
specflow brownfield scan
```

STOP -- Display the structural inventory (files, directories, patterns detected). Wait for user direction before proceeding.

### Phase 2: LOAD (on user request only)

Show delta from last scan:
```bash
specflow brownfield diff
```

Apply changes (only with explicit user approval):
```bash
specflow brownfield apply
```

STOP -- Before applying, present what will change and ask for confirmation.

## Error Handling

| Error | Action |
|-------|--------|
| Empty directory | Report no source files found |
| Scan timeout | Suggest excluding large directories |
| Already scanned | Show diff from previous scan |

## Notification Tiers

| Event | Tier | Action |
|-------|------|--------|
| Scan complete | ambient | Voice: "Codebase scan complete" |
<!-- F-12 INTEGRATION POINT -->
