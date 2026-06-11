# Security Review

Review date: 2026-06-11

Scope: v2.0 public contract reset for `opencode-n8n-builder`.

## Findings

### No silent n8n writes

`n8n_v2_auto_preview`, `n8n_v2_create_plan`, `n8n_v2_review_plan`, `n8n_v2_patch_plan`, `n8n_v2_validate_simulate`, `n8n_v2_compile_preview`, and `n8n_v2_reverse_plan` do not write to n8n. `n8n_v2_apply` requires `confirm: true` and creates a new inactive workflow from a validated compiled preview. `n8n_v2_claim_workflow` requires `confirm: true` for apply.

### No active workflow structural apply

Active workflows can be v2 claimed only in read-only mode. Active read-only claims can be reviewed, simulated, and reverse planned, but v2.0 does not structurally apply changes to active workflows.

### No silent migration from v1 artifacts

v2 artifacts are isolated under `.opencode/n8n-v2/`. The v1 `.opencode/n8n-workflows.json` registry and update preview artifacts are not treated as v2 ownership. Old workflows must be explicitly claimed into the `opencode-n8n-builder-v2` registry.

### No plaintext secrets in persisted artifacts

Workflow validation blocks common plaintext secret fields. v2 plan-store and preview-store persistence redacts secret-looking values. Reverse planning intentionally avoids copying raw node parameter values into plans.

### No execution-history sampling without opt-in

v2.0 public tools do not sample execution history. Any future sampling must be explicit opt-in, minimized, and redacted.

### No trial run without opt-in

v2.0 public tools do not trigger trial runs or real external API calls. Any future `n8n_v2_run_trial` path must be explicit opt-in and test-environment oriented.

### Claim/import requires explicit intent

`n8n_v2_claim_workflow` preview is read-only. Claim apply requires `confirm: true`, re-reads the workflow, and blocks incompatible owners, registry base URL mismatch, invalid structure, and plaintext secret issues. Active workflows are read-only claims.

### Apply remains preview-guarded

`n8n_v2_apply` requires a stored compiled preview, passing validation status, and no blocking credential requirements before writing to n8n.

### Error and artifact redaction

n8n API details and persisted plan/preview artifacts use redaction for secret-looking keys and token-like strings before being returned to the user or written locally.

## Cross-version safety commitments

- No silent n8n writes.
- No active workflow structural apply.
- No silent migration from v1 artifacts.
- No plaintext secrets in persisted artifacts.
- No execution-history sampling without opt-in.
- No trial run without opt-in.
- No apply without validated preview version.
- No v2 claim/import without explicit user intent.
- Clear error codes and redacted details.

## Residual risks

- Dynamic pattern/node support is not exhaustive proof for every node configuration.
- Docker E2E requires a Docker-capable environment and a test API key.
- OAuth credential completion remains user/manual in n8n UI.
- `npm pack --dry-run` must run in an environment with npm before publishing.
- GitHub workflow files require a token with `workflow` scope before branches containing `.github/workflows/check.yml` can be pushed.
- Opt-in trial runs remain a target capability, not part of this public reset stage.

## Decision

No known critical safety blocker remains for the v2.0 public contract reset, pending owner approval and completion of Docker/npm checks in capable environments.
