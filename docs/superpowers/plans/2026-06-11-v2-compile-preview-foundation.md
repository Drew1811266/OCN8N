# v2 Compile Preview Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first v2 compile-preview stage: a validated v2 business plan can be compiled into a local n8n workflow JSON preview artifact without writing to n8n.

**Architecture:** This stage stays local-only. `src/v2/workflow-compiler.ts` maps `V2Plan` steps/patterns to a conservative inactive `N8nWorkflow` preview with v2 marker metadata and mapping trace. `src/v2/preview-store.ts` persists redacted immutable preview artifacts under `.opencode/n8n-v2/previews/`. `src/tools/v2-compile-preview.ts` loads an exact plan version, validates/simulates it inline, compiles it, runs local workflow validation, saves a preview, and returns preview metadata. It does not call n8n APIs, MCP, apply workflows, or update active workflows.

**Tech Stack:** TypeScript, Vitest, Node.js `fs/promises`, `crypto.randomUUID`, existing v2 plan store/service, existing validator and stable hashing helpers.

---

## Scope Check

This plan covers only the advanced-track `n8n_v2_compile_preview` foundation. It intentionally does not implement `n8n_v2_auto_preview`, `n8n_v2_apply`, reverse planning, trial runs, MCP validation, visual diffs, or v2 registry claim/update workflows. The output is a preview artifact and metadata only.

## File Structure

- Create `src/v2/workflow-compiler.ts`: deterministic `V2Plan` to inactive `N8nWorkflow` preview compiler plus mapping trace.
- Create `src/v2/preview-store.ts`: immutable v2 preview artifact save/get with redaction and workflow hash checking.
- Create `src/tools/v2-compile-preview.ts`: local tool orchestration for compile preview.
- Modify `src/plugin.ts`: register `n8n_v2_compile_preview` after validate/simulate and wire a local `V2PreviewStore`.
- Modify `src/index.ts`: export public compile-preview tool and preview artifact contract types.
- Test `tests/v2-workflow-compiler.test.ts`: compiler output, node mapping, local workflow validation, and secret-free parameters.
- Test `tests/v2-preview-store.test.ts`: save/get, invalid IDs, hash mismatch, immutable writes, redaction.
- Test `tests/v2-compile-preview-tool.test.ts`: missing plan, invalid plan rejection, successful compile preview.
- Modify `tests/plugin.test.ts`: tool registration and local-only compile-preview flow.
- Modify `tests/public-contract.test.ts`: public type contract coverage.

## Task 1: Add v2 Preview Store

**Files:**
- Create: `src/v2/preview-store.ts`
- Test: `tests/v2-preview-store.test.ts`

- [ ] **Step 1: Write failing preview-store tests**

Create tests covering:

- saving a preview returns a UUID `previewId`, persists under `previews/<previewId>.json`, and reads it back;
- raw persisted JSON does not contain secret-looking workflow parameters;
- invalid preview IDs return `undefined`;
- malformed JSON, metadata mismatch, and workflow hash mismatch return `undefined`;
- saving over an existing preview file throws `V2_PREVIEW_EXISTS`.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-preview-store.test.ts
```

Expected: FAIL because `src/v2/preview-store.ts` does not exist.

- [ ] **Step 3: Implement preview store**

Implement:

- `V2PreviewMappingTrace`
- `V2CompiledPreview`
- `SaveV2CompiledPreviewInput`
- `V2PreviewStore.save(input)`
- `V2PreviewStore.get(previewId)`

Rules:

- Use `randomUUID()`.
- Use `redactSecrets` before persistence.
- Compute `workflowHash` from the sanitized workflow.
- Write with `flag: "wx"`.
- Validate loaded preview shape and reject mismatched `previewId` or hash.

- [ ] **Step 4: Verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-preview-store.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/v2/preview-store.ts tests/v2-preview-store.test.ts
git commit -m "feat: add v2 preview store"
```

## Task 2: Add v2 Workflow Compiler

**Files:**
- Create: `src/v2/workflow-compiler.ts`
- Test: `tests/v2-workflow-compiler.test.ts`

- [ ] **Step 1: Write failing compiler tests**

Create tests covering:

- complex seven-pattern plan compiles into an inactive workflow with v2 tags/meta;
- nodes are connected in sequence and pass `validateWorkflowForSave({ requireManagedMarker: false })`;
- mapping trace links plan steps and pattern IDs to node names;
- workflow parameters do not include plaintext secrets.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-workflow-compiler.test.ts
```

Expected: FAIL because compiler module does not exist.

- [ ] **Step 3: Implement compiler**

Implement `compileV2PlanToWorkflowPreview(input)` with:

- input: `{ plan, pluginVersion, createdAt }`;
- output: `{ workflow, mappingTrace, warnings }`;
- one conservative n8n node per v2 plan step;
- public placeholder URL `https://api.example.com/fulfillment` for external calls;
- no secret values in parameters;
- v2 metadata `{ managedBy: "opencode-n8n-builder-v2", managedByVersion, createdAt }`;
- tag `{ name: "opencode-n8n-builder-v2" }`;
- sequential main connections.

- [ ] **Step 4: Verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-workflow-compiler.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/v2/workflow-compiler.ts tests/v2-workflow-compiler.test.ts
git commit -m "feat: compile v2 plans to workflow previews"
```

## Task 3: Add Compile Preview Tool And Plugin Wiring

**Files:**
- Create: `src/tools/v2-compile-preview.ts`
- Modify: `src/plugin.ts`
- Modify: `src/index.ts`
- Test: `tests/v2-compile-preview-tool.test.ts`
- Test: `tests/plugin.test.ts`
- Test: `tests/public-contract.test.ts`

- [ ] **Step 1: Write failing tool/plugin/public-contract tests**

Add tests covering:

- successful tool compile loads a stored plan version, saves a preview, and returns `previewId`, `planId`, `planVersion`, `workflowHash`, `nodeCount`, `mappingTrace`, and warnings;
- missing plan returns `V2_PLAN_NOT_FOUND`;
- structurally invalid plan returns `V2_PLAN_NOT_VALID`;
- plugin registers `n8n_v2_compile_preview` after `n8n_v2_validate_simulate`;
- plugin local-only v2 flow can create, validate/simulate, and compile without n8n API/MCP env;
- public package exports `V2CompilePreviewArgs`, `V2CompilePreviewResult`, and v2 preview artifact types.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-compile-preview-tool.test.ts tests/plugin.test.ts tests/public-contract.test.ts
```

Expected: FAIL because the tool and exports are missing.

- [ ] **Step 3: Implement tool and plugin wiring**

Implement `compileV2Preview(input)`:

- Load exact plan version from `V2PlanStore`.
- Run `validateAndSimulateV2Plan`.
- Throw `V2_PLAN_NOT_VALID` if status is `failed`.
- Compile with `compileV2PlanToWorkflowPreview`.
- Validate compiled workflow locally with `validateWorkflowForSave({ requireManagedMarker: false })`.
- Throw `V2_PREVIEW_INVALID` on workflow validation issues.
- Save through `V2PreviewStore`.
- Return preview metadata.

Plugin wiring:

- `localDeps()` returns `v2PreviewStore: new V2PreviewStore(config.v2.previewsDir)`.
- Register `n8n_v2_compile_preview` with args `{ planId, planVersion }`.
- Execute through `localDeps()` only.

- [ ] **Step 4: Verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-compile-preview-tool.test.ts tests/plugin.test.ts tests/public-contract.test.ts tests/v2-workflow-compiler.test.ts tests/v2-preview-store.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/tools/v2-compile-preview.ts src/plugin.ts src/index.ts tests/v2-compile-preview-tool.test.ts tests/plugin.test.ts tests/public-contract.test.ts
git commit -m "feat: add v2 compile preview tool"
```

## Task 4: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run full verification**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsup
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" node scripts/check-package-files.mjs
git diff --check
```

Expected: all pass.

- [ ] **Step 2: Scope review**

Confirm this stage delivered local compile preview only and did not add apply, n8n writes, MCP validation, or auto-preview.

- [ ] **Step 3: Commit final fixes if needed**

Only commit if verification or scope review required changes.

