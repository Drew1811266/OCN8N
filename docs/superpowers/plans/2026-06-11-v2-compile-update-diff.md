# v2 Compile Update Diff

**Goal:** `n8n_v2_compile_preview` returns an auditable diff when compiling against a v2-claimed inactive workflow.

## Scope

- Add optional `workflowId` to `V2CompilePreviewArgs`.
- When `workflowId` is omitted, keep local-only compile behavior.
- When `workflowId` is present, require API config, v2 registry, workflow read support, full claim, inactive current workflow, matching registry hash, and matching base URL.
- Reuse the existing structured workflow diff helper.
- Persist the update target and diff inside `V2CompiledPreview`.
- Wire the plugin so `n8n_v2_compile_preview` uses API deps only for update preview mode.
- Update public contract and release docs.

## TDD Checklist

- [x] Add compile preview tests for update diff persistence and blocking update-preview guards.
- [x] Add plugin schema/wiring tests for `workflowId` update diff mode.
- [x] Add public contract tests for update diff types.
- [x] Update docs tests for compile update diff.
- [x] Implement compile update target resolution and persisted diff schema.
- [x] Run targeted tests red, then green.
- [x] Run full verification before merge.
