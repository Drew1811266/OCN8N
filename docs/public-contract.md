# Public Contract

This document defines the stable v1 public contract for `opencode-n8n-builder`. Patch releases may add optional fields, warnings, or error details, but should not remove documented fields or change required confirmation gates. Breaking schema changes require a new major version.

## Package Entrypoint

The package entrypoint exports:

- `N8nBuilderPlugin`
- `createN8nBuilderPlugin`
- `N8nBuilderError`
- tool argument and result types
- persisted artifact types
- workflow, registry, preview, diff, warning, and credential action types

The exported types are for consumers that want to build wrappers, tests, docs, or integration tooling around the plugin.

## Tools

### `n8n_build_workflow`

Creates an inactive managed workflow from a natural-language prompt.

- Args type: `BuildWorkflowArgs`
- Result type: `BuildWorkflowResult`
- Writes: n8n workflow and `WorkflowRegistryRecord`
- Safety: creates inactive workflows only; validates structure, managed marker, credentials, secrets, compatibility warnings, and MCP validation before persistence.

### `n8n_update_workflow`

Previews, applies, or rolls back an update to a managed inactive workflow.

- Args type: `UpdateWorkflowArgs`
- Result type: `UpdateWorkflowResult`
- Writes: apply and rollback-apply call n8n update API and refresh registry.
- Safety: update is inactive-only; apply requires a valid preview; stale preview and rollback stale checks must pass.

### `n8n_claim_workflow`

Explicitly onboards an existing inactive workflow into current workspace ownership.

- Args type: `ClaimWorkflowArgs`
- Result type: `ClaimWorkflowResult`
- Writes: `apply` with `confirm: true` writes marker/tag and registry, or repairs registry for already marked workflows.
- Safety: active workflows, other owners, registry base URL mismatch, invalid structure, and plaintext secret issues are blocked.

### `n8n_check_workflow_readiness`

Checks production readiness and explicitly activates or deactivates a managed workflow.

- Args type: `CheckWorkflowReadinessArgs`
- Result type: `CheckWorkflowReadinessResult`
- Writes: `activate` and `deactivate` require `confirm: true` and refresh registry.
- Safety: activation blocks hard failures and requires `allowWarnings: true` when warnings remain.

### `n8n_inspect_workflow`

Returns a summary of a managed inactive workflow.

- Args type: `InspectWorkflowArgs`
- Result type: `InspectWorkflowResult`
- Writes: none.
- Safety: requires managed marker, inactive state, registry record, and matching n8n base URL.

### `n8n_list_managed_workflows`

Lists workflows recorded in the current workspace registry.

- Args: none.
- Result type: `ListManagedWorkflowsResult`
- Writes: none.
- Safety: local-only; does not require n8n API or MCP.

## Result Types

- `BuildWorkflowResult`: created workflow ID, name, URL, node count, summary, credential actions, missing credentials, and warnings.
- `UpdateWorkflowResult`: workflow ID, name, URL, mode, preview ID when applicable, summary, changes, `WorkflowDiff`, credential actions, missing credentials, and warnings.
- `ClaimWorkflowResult`: workflow ID, name, mode, action, eligibility, risks, workflow summary, and registry repair status.
- `CheckWorkflowReadinessResult`: workflow ID, name, mode, active state, readiness status, checks, warnings, `RuntimeDiagnostics`, and activation policy.
- `InspectWorkflowResult`: workflow ID, name, active state, nodes, connections, and issues.
- `ListManagedWorkflowsResult`: local registry workflow summaries.

## Persisted Artifacts

### `WorkflowRegistryRecord`

Registry records live in `.opencode/n8n-workflows.json` and include workflow ID, name, URL, base URL, manager marker, manager version, last plan hash, and last update timestamp.

### `UpdatePreview`

Update previews live under `.opencode/n8n-update-previews`. They include preview ID, workflow ID, base/proposed hashes, summary, changes, `baseWorkflow`, `proposedWorkflow`, redacted `WorkflowDiff`, creation time, and expiry time.

### `WorkflowDiff`

Diff output covers added nodes, removed nodes, changed parameters, changed credential names, changed connections, and changed settings. Diff values are redacted where secret-looking keys or token-like strings are detected.

### `CredentialSetupAction`

Credential actions use `reuse_existing`, `create_from_env`, `set_missing_env`, `configure_mapping`, or `complete_oauth_in_n8n`. Secret values are not returned.

### `Warning`

Warnings are structured as `{ code, message, nodeName? }`. New warning codes may be added in minor or patch releases.

## Error Contract

Errors use `N8nBuilderError` with `message`, `code`, and redacted `details`. Known v1 codes include:

- `CONFIG_MISSING`
- `CONFIG_INVALID`
- `N8N_API_ERROR`
- `N8N_API_PARSE_ERROR`
- `N8N_MCP_TOOL_ERROR`
- `MCP_WORKFLOW_VALIDATION_FAILED`
- `MCP_WORKFLOW_VALIDATION_MISMATCH`
- `WORKFLOW_CREATE_INVALID`
- `WORKFLOW_UPDATE_BLOCKED`
- `WORKFLOW_READINESS_BLOCKED`
- `WORKFLOW_ACTIVATION_CONFIRMATION_REQUIRED`
- `WORKFLOW_ACTIVATION_BLOCKED`
- `CLAIM_CONFIRMATION_REQUIRED`
- `CLAIM_BLOCKED`
- `UPDATE_PREVIEW_INVALID`
- `UPDATE_PREVIEW_STALE`
- `UPDATE_ROLLBACK_STALE`

Consumers should branch on `code` and treat `details` as diagnostic context, not as a stable exhaustive schema.
