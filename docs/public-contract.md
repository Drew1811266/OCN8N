# Public Contract

This document defines the stable v2 public contract for `opencode-n8n-builder`.
v2.0 is a Breaking Reset: the default plugin entrypoint exposes the v2
pattern-first tool contract and does not expose the v1 build/update/inspect
tools. v1 artifacts are not silently migrated into v2.

## Package Entrypoint

The package entrypoint exports:

- `N8nBuilderPlugin`
- `createN8nBuilderPlugin`
- `N8nBuilderError`
- v2 tool argument and result types
- v2 persisted artifact types
- common n8n workflow and warning types

The exported types are for consumers that build wrappers, tests, docs, or
integration tooling around the v2 plugin.

## Tools

### `n8n_v2_auto_preview`

Creates, reviews, validates, simulates, and compiles a v2 workflow preview from
a natural-language request without writing to n8n.

- Args type: `V2AutoPreviewArgs`
- Result type: `V2AutoPreviewResult`
- Writes: local v2 plan and preview artifacts under `.opencode/n8n-v2/`
- Safety: no n8n API writes; returns review, simulation, mapping trace, warnings, confidence, risk, and `mcpValidationStatus`.

### `n8n_v2_create_plan`

Creates a v2 business workflow plan artifact.

- Args type: `V2CreatePlanArgs`
- Result type: `V2CreatePlanResult`
- Writes: `.opencode/n8n-v2/plans/<planId>/v1.json`
- Safety: local-only; no n8n API or MCP configuration required.

### `n8n_v2_review_plan`

Reviews an exact stored plan version.

- Args type: `V2ReviewPlanArgs`
- Result type: `V2PlanReview`
- Writes: none
- Safety: exact `planId` and `planVersion` lookup; missing versions fail with typed errors.

### `n8n_v2_patch_plan`

Creates a new version of an existing v2 plan.

- Args type: `V2PatchPlanArgs`
- Result type: `V2PatchPlanResult`
- Writes: next immutable plan version under `.opencode/n8n-v2/plans/`
- Safety: parent version must be current; stale or invalid references are blocked.

### `n8n_v2_validate_simulate`

Runs foundation validation and sample simulation for a stored plan version.

- Args type: `V2ValidateSimulateArgs`
- Result type: `V2SimulationResult`
- Writes: none in v2.0 foundation
- Safety: checks required inputs, steps, patterns, outputs, examples, branch defaults, loop bounds, external response contracts, and credential requirements.

### `n8n_v2_compile_preview`

Compiles a validated plan version into an inactive n8n workflow preview.

- Args type: `V2CompilePreviewArgs`
- Result type: `V2CompilePreviewResult`
- Writes: `.opencode/n8n-v2/previews/<previewId>.json`
- Safety: validates and simulates before compile; preview workflow is inactive and marked `opencode-n8n-builder-v2`; compiler emits detailed `V2PreviewMappingTrace`; MCP validation after compile runs when `N8N_MCP_URL` or `n8n.mcpUrl` is configured.
- Mapping trace: each trace links `businessIntent`, plan step ID, pattern IDs, n8n node names, `nodeParameters`, `expressions`, `sourceFields`, and `outputFields` without copying arbitrary parameter values.
- Update diff: when optional `workflowId` is supplied, compile preview reads the v2-claimed inactive workflow and returns a diff when updating a claimed inactive workflow in `updateTarget`. This mode requires API config, a full v2 claim, matching base URL, inactive current workflow, and matching registry workflow hash.
- MCP validation: `mcpValidationStatus` is `not_configured`, `passed`, or `warning`. MCP validation warnings are merged into `warnings`; `MCP_WORKFLOW_VALIDATION_FAILED` blocks preview persistence.

### `n8n_v2_apply`

Creates a new inactive n8n workflow from a compiled v2 preview, or updates a v2-claimed inactive workflow when `workflowId` is supplied.

- Args type: `V2ApplyArgs`
- Result type: `V2ApplyResult`
- Writes: n8n workflow create/update API and `.opencode/n8n-v2/registry/workflows.json`
- Safety: requires `confirm: true`, a valid compiled preview, passing validation status, and no blocking credential requirements. Update apply also requires an existing full v2 registry claim, matching base URL, inactive current workflow, and matching current workflow hash.

### `n8n_v2_claim_workflow`

Explicitly claims an existing workflow into the v2 registry.

- Args type: `V2ClaimWorkflowArgs`
- Result type: `V2ClaimWorkflowResult`
- Writes: inactive full claim may write a v2 marker/tag; active read-only claim writes only local v2 registry.
- Safety: `apply` requires `confirm: true`; active workflows are read-only; incompatible owners, invalid structure, base URL mismatch, and plaintext secret issues are blocked.

### `n8n_v2_reverse_plan`

Reverse plans a v2-claimed workflow into a local v2 plan artifact.

- Args type: `V2ReversePlanArgs`
- Result type: `V2ReversePlanResult`
- Writes: local plan version with `source: "reverse"` and updated v2 registry plan metadata.
- Safety: requires existing v2 registry claim; blocks base URL mismatch; does not write to n8n; returns `V2ReverseUnmappedNode[]` and warnings for unsupported or uncertain semantics.

### `n8n_v2_run_trial`

Runs a confirm-gated dry-run trial for a compiled preview.

- Args type: `V2RunTrialArgs`
- Result type: `V2RunTrialResult`
- Writes: immutable `V2TrialRunArtifact` under `.opencode/n8n-v2/runs/`
- Safety: supports only `mode: "dry_run"`; requires `confirm: true`; re-runs local validation/simulation and does not trigger n8n, create temporary workflows, activate workflows, call external APIs, or sample execution history.

## Result Types

- `V2CreatePlanResult`: plan ID/version, summary, pattern count, confidence, risk level, and warnings.
- `V2AutoPreviewResult`: plan metadata, preview ID, review, simulation, mapping trace, confidence, risk level, `mcpValidationStatus`, and warnings.
- `V2CompilePreviewResult`: preview ID, plan reference, workflow name, node count, workflow hash, validation status, `mcpValidationStatus`, optional `updateTarget`, mapping trace, and warnings.
- `V2ApplyResult`: created or updated workflow ID, URL, `mode: "create" | "update"`, preview reference, plan reference, node count, workflow hash, validation status, and warnings.
- `V2ClaimWorkflowResult`: claim action, eligibility, claim mode, active state, workflow summary, risks, marker/registry write status, and workflow hash.
- `V2ReversePlanResult`: reverse plan ID/version, confidence, risk level, mapped step count, unmapped nodes, warnings, and workflow hash.
- `V2RunTrialResult`: run ID, preview and plan reference, dry-run status, `triggered: false`, execution mode, cleanup flag, warnings, and summary.
- `V2RegistryRecord`: v2 registry ownership record with `managedBy: "opencode-n8n-builder-v2"`, claim mode, active-at-claim flag, latest plan/preview metadata, and last update timestamp.
- `V2CompiledPreview`: immutable local preview artifact with workflow JSON, workflow hash, validation status, `mcpValidationStatus`, optional `updateTarget`, warnings, and detailed `V2PreviewMappingTrace[]`.
- `V2PreviewMappingTrace`: per-step compile trace with `businessIntent`, pattern/node links, parameter paths, expression traces, source fields, and output fields.
- `V2PreviewUpdateTarget`: update preview metadata with target workflow ID, current workflow hash, `hasChanges`, and structured `V2WorkflowDiff`.
- `V2TrialRunArtifact`: immutable local dry-run artifact with simulation result, provenance, warnings, timing, and non-triggered execution metadata.
- `V2ArtifactPaths`: isolated v2 artifact paths under `.opencode/n8n-v2/`.
- `V2ArtifactStorage`: storage adapter interface used by v2 plan, preview, registry, and run stores.
- `V2FileArtifactStorage`: default filesystem implementation of `V2ArtifactStorage`.

## Persisted Artifacts

v2 artifacts are isolated under `.opencode/n8n-v2/`:

- `plans/`: immutable `V2PlanVersion` files; `source` is `create`, `patch`, or `reverse`.
- `previews/`: immutable `V2CompiledPreview` files.
- `registry/workflows.json`: v2 workflow registry records.
- `runs/`: immutable `V2TrialRunArtifact` dry-run records.
- `claims/` and `exports/`: reserved v2 paths for future opt-in capabilities.

The v1 `.opencode/n8n-workflows.json` and `.opencode/n8n-update-previews/`
locations are not read as v2 ownership.

v2 stores use `V2ArtifactStorage` internally. The default plugin path uses
`V2FileArtifactStorage`, while tests and future integrations can inject another
adapter without changing the public tool contract.

## Error Contract

Errors use `N8nBuilderError` with `message`, `code`, and redacted `details`.
Known v2 codes include:

- `V2_PLAN_NOT_FOUND`
- `V2_PLAN_INVALID`
- `V2_PLAN_VERSION_EXISTS`
- `V2_PREVIEW_NOT_FOUND`
- `V2_PREVIEW_NOT_VALID`
- `V2_APPLY_CONFIRM_REQUIRED`
- `V2_APPLY_ACTIVE_WORKFLOW`
- `V2_APPLY_READ_ONLY_CLAIM`
- `V2_APPLY_WORKFLOW_STALE`
- `V2_CREDENTIALS_BLOCK_APPLY`
- `V2_CLAIM_CONFIRM_REQUIRED`
- `V2_WORKFLOW_NOT_CLAIMED`
- `V2_REGISTRY_BASE_URL_MISMATCH`
- `V2_COMPILE_UPDATE_UNSUPPORTED`
- `V2_COMPILE_UPDATE_READ_ONLY_CLAIM`
- `V2_COMPILE_UPDATE_ACTIVE_WORKFLOW`
- `V2_COMPILE_UPDATE_STALE`
- `V2_TRIAL_CONFIRM_REQUIRED`
- `V2_TRIAL_SAMPLE_NOT_FOUND`
- `MCP_WORKFLOW_VALIDATION_FAILED`
- `MCP_WORKFLOW_VALIDATION_MISMATCH`

Consumers should branch on `code` and treat `details` as diagnostic context,
not as a stable exhaustive schema.
