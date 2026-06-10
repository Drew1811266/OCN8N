# Security Review

Review date: 2026-06-10

Scope: v1.0 release candidate for `opencode-n8n-builder`.

## Findings

### No silent active workflow writes

`n8n_update_workflow` remains inactive-only. Active workflow activation and deactivation are only available through `n8n_check_workflow_readiness`, and both modes require `confirm: true`.

### No plaintext secrets in persisted artifacts

Workflow validation blocks common plaintext secret fields. Credential values come from environment variables or n8n credentials and are not written into registry records, preview files, or ordinary tool output.

### Update apply requires stale preview checks

Update apply requires a valid preview ID, non-expired preview, matching proposed workflow hash, and current workflow hash matching the preview base hash. This prevents accidental overwrite of changes made directly in n8n UI.

### rollback remains hash guarded

Rollback preview and rollback apply require the current workflow to match the applied proposed workflow hash. This prevents rollback from overwriting unrelated changes.

### Claim/import requires explicit intent

`n8n_claim_workflow` preview is read-only. Claim apply requires `confirm: true`, re-reads the workflow, and blocks active workflows, other owners, registry base URL mismatch, invalid structure, and plaintext secret issues.

### Activation/deactivation is explicit

Activation and deactivation require `confirm: true`. Activation blocks hard readiness failures and requires `allowWarnings: true` when warnings remain.

### Error and diff redaction

n8n API details, MCP error details, and workflow diff values use redaction for secret-looking keys and token-like strings before being returned to the user.

## Cross-version safety commitments

- No silent active workflow writes.
- No plaintext secrets in persisted artifacts.
- No update apply without stale preview checks.
- No claim/import without explicit user intent.
- Clear error codes and redacted details.

## Residual risks

- Dynamic MCP node support is not exhaustive proof for every node configuration.
- Docker E2E requires a Docker-capable environment and a test API key.
- OAuth credential completion remains user/manual in n8n UI.
- `npm pack --dry-run` must run in an environment with npm before publishing.
- GitHub workflow files require a token with `workflow` scope before branches containing `.github/workflows/check.yml` can be pushed.

## Decision

No known critical safety blocker remains for the v1.0 release candidate, pending owner approval and completion of Docker/npm checks in capable environments.
