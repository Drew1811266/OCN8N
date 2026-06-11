# v2 Mapping Trace Detail

**Goal:** Enrich `V2PreviewMappingTrace` so compiled previews link business intent, plan steps, pattern instances, n8n nodes, node parameter paths, expressions, source fields, and output fields.

## Scope

- Keep workflow JSON unchanged.
- Extend persisted `V2PreviewMappingTrace` with required detail fields.
- Derive parameter paths and expressions from compiled node parameters.
- Derive source and output fields from plan input/entity/output refs.
- Avoid copying arbitrary parameter values into trace.
- Update public contract and docs.

## TDD Checklist

- [x] Add compiler tests for parameter paths, expressions, source fields, and output fields.
- [x] Add preview store and public contract fixture updates for required trace fields.
- [x] Update docs tests for detailed mapping trace contract.
- [x] Implement trace enrichment in compiler and artifact schema.
- [x] Run targeted tests red, then green.
- [x] Run full verification before merge.
