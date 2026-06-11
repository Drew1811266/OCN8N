# v1 to v2 Migration Guide

This guide documents the v2.0 breaking reset for users moving from the v1 managed workflow lifecycle to the v2 pattern-first planning contract.

## What Changed

v2 replaces the default public OpenCode tool surface. The v1 build, update, inspect, readiness, claim, and list tools are no longer registered by the default plugin entrypoint. The default tools are now the `n8n_v2_*` tools described in `docs/public-contract.md`.

v1 `.opencode/n8n-workflows.json` is not a v2 registry. v1 update preview files are not v2 preview artifacts. v2 stores plan versions, compiled previews, run artifacts, and registry records under `.opencode/n8n-v2/`.

There is no silent migration. This is deliberate: v2 ownership, plan versions, simulation results, compiled previews, and registry safety semantics are different from v1.

## Migration Paths

Use `n8n_v2_claim_workflow` for workflows that already exist in n8n.

Inactive workflows can be brought into v2 with a full claim. A full claim can write the `opencode-n8n-builder-v2` marker/tag to the workflow and record it in the v2 registry. After full claim, the workflow can be reverse planned, patched, compiled, and updated through `n8n_v2_apply` while it remains inactive and the current workflow hash matches the registry.

Active workflows can be brought into v2 with a read-only claim. A read-only claim writes only the local v2 registry record. It can support reverse planning, review, and simulation, but v2.0 does not structurally apply changes to active workflows.

## Recommended Sequence

1. Keep a copy of any v1 branch or release package you still need for old workflows.
2. Install or run v2.0 and confirm `README.md` shows current version `2.0.0`.
3. For an inactive v1-managed workflow, run `n8n_v2_claim_workflow` in `preview` mode.
4. Review risks, ownership state, base URL, active state, and plaintext secret warnings.
5. Run `n8n_v2_claim_workflow` in `apply` mode with `confirm: true` only if the preview is acceptable.
6. Run `n8n_v2_reverse_plan` to create a v2 plan artifact from the claimed workflow.
7. Review, patch, validate, simulate, compile, and apply through the v2 advanced track.

## Safety Notes

- v2 does not trust v1 markers as v2 ownership.
- v2 does not reuse v1 update preview files.
- v2 blocks incompatible ownership markers and registry base URL mismatches.
- v2 active workflow claims are read-only.
- v2 update apply requires a full claim and a matching current workflow hash.
- v2 does not import execution history as plan samples unless a future explicit opt-in feature is added.

## What To Do With Old Artifacts

Do not delete v1 artifacts until you know they are no longer needed. v2 will ignore them by default. If a workflow still matters, claim the live n8n workflow into v2 instead of copying v1 registry JSON into `.opencode/n8n-v2/`.

The expected migration unit is the n8n workflow, not the old local registry entry.
