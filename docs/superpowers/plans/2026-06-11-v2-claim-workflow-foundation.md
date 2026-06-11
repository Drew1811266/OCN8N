# v2 Claim Workflow Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add v2 workflow claim/import foundation so existing n8n workflows can be explicitly registered under v2 ownership rules.

**Architecture:** `src/tools/v2-claim-workflow.ts` evaluates an existing n8n workflow through the REST API, checks v2 ownership, local registry state, structure, plaintext secret risks, and active/inactive policy. Inactive workflows can be full-claimed with a v2 marker write plus v2 registry record; active workflows can only be read-only claimed by writing a v2 registry record and never updating the workflow. `src/plugin.ts` registers `n8n_v2_claim_workflow` through API-only dependencies, with no MCP, reverse planning, trial run, or execution-history sampling.

**Tech Stack:** TypeScript, Vitest, existing `N8nApiClient`, existing `V2WorkflowRegistry`, existing `validateWorkflowForSave`, existing `stableHash`.

---

## Scope Check

This plan implements only v2 claim/import foundation. It does not implement reverse planning, plan generation from claimed workflows, update of claimed workflows, active structural apply, execution-history sampling, trial runs, or MCP validation.

## File Structure

- Create `src/tools/v2-claim-workflow.ts`: v2 claim evaluation and apply orchestration.
- Create `tests/v2-claim-workflow-tool.test.ts`: direct tool tests for inactive full claim, active read-only claim, confirmation, and blocking risks.
- Modify `src/plugin.ts`: register `n8n_v2_claim_workflow` after `n8n_v2_apply`.
- Modify `src/index.ts`: export `V2ClaimWorkflowArgs`, `V2ClaimWorkflowResult`, and supporting claim types.
- Modify `tests/plugin.test.ts`: registration order, args, and API-only plugin smoke path for v2 claim.
- Modify `tests/public-contract.test.ts`: public type contract coverage.

## Task 1: Add v2 Claim Workflow Tool

**Files:**
- Create: `src/tools/v2-claim-workflow.ts`
- Test: `tests/v2-claim-workflow-tool.test.ts`

- [ ] **Step 1: Write failing claim tool tests**

Create tests covering:

- previewing an inactive unmanaged workflow returns `action: "claim_full"` and does not write marker or registry;
- applying an inactive unmanaged workflow requires `confirm: true`, writes a v2 marker/tag through `updateWorkflow`, and writes a `claimMode: "full"` v2 registry record;
- applying an active workflow writes only a `claimMode: "read_only"` v2 registry record and never calls `updateWorkflow`;
- incompatible owner and plaintext secret risks block claim and skip writes.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-claim-workflow-tool.test.ts
```

Expected: FAIL because `src/tools/v2-claim-workflow.ts` does not exist.

- [ ] **Step 3: Implement v2 claim tool**

Implement:

- `V2ClaimWorkflowArgs`
- `V2ClaimWorkflowAction`
- `V2ClaimWorkflowRiskCode`
- `V2ClaimWorkflowRisk`
- `V2ClaimedWorkflowSummary`
- `V2ClaimWorkflowResult`
- `claimV2Workflow(input)`

Rules:

- `mode: "apply"` requires `confirm: true`.
- Fetch workflow through `api.getWorkflow`.
- Validate workflow with `validateWorkflowForSave({ requireManagedMarker: false, allowActiveUpdate: true })`.
- Treat `PLAINTEXT_SECRET`, duplicate node names, missing connection source/target, incompatible owner, and registry base URL mismatch as blocking.
- Treat private network URL as non-blocking risk.
- Treat v1 marker/tag as external but claimable, with a `V1_OWNERSHIP_RESET` risk.
- Inactive unmanaged or v1-managed workflows use `action: "claim_full"` and `claimMode: "full"`.
- Active workflows use `action: "claim_read_only"` and `claimMode: "read_only"`.
- Inactive full apply writes v2 marker/tag through `api.updateWorkflow`.
- Active read-only apply never calls `api.updateWorkflow`.
- Registry record uses `managedBy: "opencode-n8n-builder-v2"`, `latestWorkflowHash`, `claimMode`, `activeAtClaim`, and `lastUpdatedAt`.

- [ ] **Step 4: Verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-claim-workflow-tool.test.ts tests/v2-registry.test.ts tests/v2-apply-tool.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/tools/v2-claim-workflow.ts tests/v2-claim-workflow-tool.test.ts
git commit -m "feat: add v2 workflow claim tool"
```

## Task 2: Register Claim Tool And Export Contract

**Files:**
- Modify: `src/plugin.ts`
- Modify: `src/index.ts`
- Modify: `tests/plugin.test.ts`
- Modify: `tests/public-contract.test.ts`

- [ ] **Step 1: Write failing plugin and public-contract tests**

Modify tests to require:

- `n8n_v2_claim_workflow` appears after `n8n_v2_apply`.
- tool args are `{ workflowId, mode, confirm }`.
- plugin can preview and apply active read-only claim with API config and no MCP config.
- public package exports `V2ClaimWorkflowArgs`, `V2ClaimWorkflowResult`, and supporting v2 claim types.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/plugin.test.ts tests/public-contract.test.ts
```

Expected: FAIL because the tool is not registered and public types are not exported.

- [ ] **Step 3: Implement plugin registration and exports**

In `src/plugin.ts`:

- import `claimV2Workflow`;
- register `n8n_v2_claim_workflow` after `n8n_v2_apply`;
- use `apiDeps()` only;
- pass `api`, base URL/plugin version config, and `v2Registry`.

In `src/index.ts` export claim types from `./tools/v2-claim-workflow.js`.

- [ ] **Step 4: Verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/plugin.test.ts tests/public-contract.test.ts tests/v2-claim-workflow-tool.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/plugin.ts src/index.ts tests/plugin.test.ts tests/public-contract.test.ts
git commit -m "feat: register v2 claim workflow tool"
```

## Task 3: Final Verification

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

Confirm this stage delivered v2 claim foundation only and did not add reverse planning, claimed workflow update apply, active structural apply, trial runs, MCP validation, credential creation, or execution-history sampling.

- [ ] **Step 3: Commit final fixes if needed**

Only commit if verification or scope review required changes.

