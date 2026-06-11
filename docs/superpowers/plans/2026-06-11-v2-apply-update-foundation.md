# v2 Apply Update Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `n8n_v2_apply` so it can update a v2-claimed inactive workflow from a compiled preview with stale-hash and ownership safeguards.

**Architecture:** Keep create-new apply as the default when `workflowId` is omitted. When `workflowId` is supplied, `applyV2Preview()` loads the v2 registry record, re-reads the current n8n workflow, blocks read-only or active workflows, checks base URL and current workflow hash against the registry, validates the preview workflow, calls `updateWorkflow()`, and refreshes the v2 registry metadata.

**Tech Stack:** TypeScript, Vitest, existing `N8nApiClient`, `V2PlanStore`, `V2PreviewStore`, `V2WorkflowRegistry`, stable hashing, local workflow validator.

---

## Scope Check

This plan implements only update apply for v2-claimed inactive workflows. It does not implement active workflow structural apply, real execution trial runs, temporary workflow trials, execution-history sampling, MCP compile validation, credential creation, or v1 artifact migration.

## File Structure

- Modify `src/tools/v2-apply.ts`: add optional `workflowId`, update-mode result, claim/hash/active/base URL checks, and API update path.
- Modify `src/plugin.ts`: expose optional `workflowId` on `n8n_v2_apply` schema and wire `getWorkflow`/`updateWorkflow` through the existing API client object.
- Modify `src/index.ts`: no new export path is required, but the exported `V2ApplyArgs` and `V2ApplyResult` shapes change through `src/tools/v2-apply.ts`.
- Modify `tests/v2-apply-tool.test.ts`: add update-mode success and safety failures.
- Modify `tests/plugin.test.ts`: update apply argument contract and add plugin smoke coverage for update apply.
- Modify `tests/public-contract.test.ts`: cover `workflowId` and `mode: "update"` in public types.
- Modify `tests/docs-release.test.ts`: assert docs mention claimed inactive update apply.
- Modify `README.md`, `CHANGELOG.md`, `docs/public-contract.md`, `docs/operations.md`, `docs/security-review.md`, and `docs/release-checklist.md`: document update apply safety semantics.

## Task 1: Add Update Apply Tool Behavior

**Files:**
- Modify: `src/tools/v2-apply.ts`
- Test: `tests/v2-apply-tool.test.ts`

- [ ] **Step 1: Write failing update tests**

Add tests requiring:

- `applyV2Preview({ args: { previewId, workflowId, confirm: true } })` reads a full-claimed inactive workflow, verifies its hash, calls `updateWorkflow()`, returns `mode: "update"`, and refreshes the registry.
- update apply rejects unclaimed workflow IDs with `V2_WORKFLOW_NOT_CLAIMED`.
- update apply rejects read-only claims with `V2_APPLY_READ_ONLY_CLAIM`.
- update apply rejects current active workflows with `V2_APPLY_ACTIVE_WORKFLOW`.
- update apply rejects current workflow hash mismatch with `V2_APPLY_WORKFLOW_STALE`.

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-apply-tool.test.ts
```

Expected: FAIL because `V2ApplyArgs` has no `workflowId` and `applyV2Preview()` does not call `getWorkflow()` or `updateWorkflow()`.

- [ ] **Step 2: Implement minimal update mode**

In `src/tools/v2-apply.ts`:

- Change `V2ApplyArgs` to `{ previewId: string; confirm: boolean; workflowId?: string }`.
- Change `V2ApplyResult.mode` to `"create" | "update"`.
- Change API dependency type to include `getWorkflow()` and `updateWorkflow()`.
- Keep existing create behavior when `workflowId` is omitted.
- Add an update branch when `workflowId` is present:
  - registry record must exist;
  - registry `baseUrl` must match config `baseUrl`;
  - registry `claimMode` must be `"full"`;
  - current workflow must have `active: false`;
  - current workflow hash must equal `record.latestWorkflowHash` when present;
  - proposed workflow is preview workflow forced to `active: false`;
  - `updateWorkflow(workflowId, proposedWorkflow)` is called;
  - registry is refreshed with latest plan/preview/hash/validation metadata.

- [ ] **Step 3: Verify targeted tests pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-apply-tool.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 4: Commit tool behavior**

```bash
git add src/tools/v2-apply.ts tests/v2-apply-tool.test.ts docs/superpowers/plans/2026-06-11-v2-apply-update-foundation.md
git commit -m "feat: update claimed inactive v2 workflows"
```

## Task 2: Register Schema, Public Contract, And Docs

**Files:**
- Modify: `src/plugin.ts`
- Modify: `tests/plugin.test.ts`
- Modify: `tests/public-contract.test.ts`
- Modify: `tests/docs-release.test.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/public-contract.md`
- Modify: `docs/operations.md`
- Modify: `docs/security-review.md`
- Modify: `docs/release-checklist.md`

- [ ] **Step 1: Write failing registration/docs tests**

Tests require:

- `n8n_v2_apply` args are `previewId`, `confirm`, and optional `workflowId`.
- plugin smoke test can claim an inactive workflow, compile a preview, then update the claimed workflow.
- public contract types accept `V2ApplyArgs.workflowId` and `V2ApplyResult.mode: "update"`.
- docs mention that `n8n_v2_apply` creates new inactive workflows or updates v2-claimed inactive workflows only.

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/plugin.test.ts tests/public-contract.test.ts tests/docs-release.test.ts
```

Expected: FAIL because schema/docs still describe create-only apply.

- [ ] **Step 2: Implement schema and docs**

- Add optional `workflowId` to `src/plugin.ts` apply args.
- Update README, changelog, public contract, operations guide, security review, and release checklist with claimed inactive update semantics.
- Keep active structural apply explicitly unsupported.

- [ ] **Step 3: Verify targeted tests pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/plugin.test.ts tests/public-contract.test.ts tests/docs-release.test.ts tests/v2-apply-tool.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 4: Commit public surface and docs**

```bash
git add src/plugin.ts tests/plugin.test.ts tests/public-contract.test.ts tests/docs-release.test.ts README.md CHANGELOG.md docs/public-contract.md docs/operations.md docs/security-review.md docs/release-checklist.md
git commit -m "docs: document v2 inactive update apply"
```

## Task 3: Final Verification And Scope Review

- [ ] **Step 1: Run full verification**

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsup
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" node scripts/check-package-files.mjs
git diff --check
```

- [ ] **Step 2: Scope review**

Confirm the stage added only v2-claimed inactive workflow update apply, and did not add active structural apply, execution triggering, temporary workflows, execution-history sampling, credential creation, or v1 migration.
