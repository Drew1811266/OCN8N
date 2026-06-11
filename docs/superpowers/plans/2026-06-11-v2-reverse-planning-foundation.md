# v2 Reverse Planning Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add v2 reverse planning foundation so workflows claimed into the v2 registry can produce honest, reviewable v2 plan artifacts without modifying n8n.

**Architecture:** `src/v2/reverse-planner.ts` maps known n8n node families into conservative v2 plan patterns, returns unmapped nodes and warnings for unsupported or ambiguous semantics, and never copies raw node parameter values into the plan. `src/tools/v2-reverse-plan.ts` requires an existing v2 registry claim, fetches the workflow through the REST API, saves a plan version with `source: "reverse"`, and updates only local v2 registry metadata.

**Tech Stack:** TypeScript, Vitest, existing `N8nApiClient`, existing `V2PlanStore`, existing `V2WorkflowRegistry`, existing `validateAndSimulateV2Plan`, existing `stableHash`.

---

## Scope Check

This plan implements only v2 reverse planning foundation. It does not implement lossless import, claimed workflow structural updates, active workflow apply, execution-history sampling, trial runs, MCP validation, credential creation, or automatic redesign apply.

## File Structure

- Create `src/v2/reverse-planner.ts`: deterministic n8n workflow to v2 plan mapping.
- Create `src/tools/v2-reverse-plan.ts`: API-backed reverse planning tool for claimed workflows.
- Create `tests/v2-reverse-planner.test.ts`: direct planner tests for known patterns, unmapped nodes, warnings, secret safety, and simulation compatibility.
- Create `tests/v2-reverse-plan-tool.test.ts`: direct tool tests for registry claim requirements, active read-only reverse planning, and base URL mismatch blocking.
- Modify `src/v2/plan-store.ts`: add `saveReverse()` that persists plan version source `reverse`.
- Modify `src/plugin.ts`: register `n8n_v2_reverse_plan` after `n8n_v2_claim_workflow`.
- Modify `src/index.ts`: export reverse planning public types.
- Modify `tests/v2-plan-store.test.ts`: cover `source: "reverse"` persistence.
- Modify `tests/plugin.test.ts`: registration order, args, and API-only claim plus reverse smoke path.
- Modify `tests/public-contract.test.ts`: public reverse planning type contract coverage.

## Task 1: Add Reverse Planner And Store Source

**Files:**
- Create: `src/v2/reverse-planner.ts`
- Modify: `src/v2/plan-store.ts`
- Test: `tests/v2-reverse-planner.test.ts`
- Test: `tests/v2-plan-store.test.ts`

- [ ] **Step 1: Write failing planner and store tests**

Create tests covering:

- known n8n nodes map to v2 pattern families: trigger, transform, branch, loop, external call, and output;
- generated plan passes foundation validation and simulation;
- unknown/community nodes are returned as `unmappedNodes` and warning records;
- HTTP/external call response contracts are marked inferred and credential semantics unknown;
- raw node parameter values and secret-looking values are not copied into the v2 plan;
- `V2PlanStore.saveReverse()` writes a fresh plan with `source: "reverse"`.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-reverse-planner.test.ts tests/v2-plan-store.test.ts
```

Expected: FAIL because reverse planner and `saveReverse()` do not exist.

- [ ] **Step 3: Implement reverse planner and store support**

Implement:

- `V2ReverseUnmappedNode`
- `ReversePlanFromWorkflowInput`
- `ReversePlanFromWorkflowResult`
- `reversePlanFromWorkflow(input)`
- `V2PlanStore.saveReverse(input)`

Planner rules:

- Use node type, node name, connection position, and credential type names only; do not persist raw parameter values.
- Map trigger nodes to `trigger`, set/code nodes to `transform`, if/switch nodes to `branch`, split/batch nodes to `loop_batch`, http request nodes to `external_call`, and response/notification/write nodes to `output`.
- Always emit at least one input, step, pattern, output, and test example.
- Branch plans must include an explicit default branch.
- Loop plans must include a finite maximum iteration bound.
- External calls must include inferred response contracts and matching credential requirements with `status: "unknown"` and `blocksApply: true`.
- Active workflows produce a read-only warning.
- Unsupported nodes produce unmapped records and warnings.

- [ ] **Step 4: Verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-reverse-planner.test.ts tests/v2-plan-store.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/v2/reverse-planner.ts src/v2/plan-store.ts tests/v2-reverse-planner.test.ts tests/v2-plan-store.test.ts docs/superpowers/plans/2026-06-11-v2-reverse-planning-foundation.md
git commit -m "feat: add v2 reverse planner foundation"
```

## Task 2: Add Reverse Planning Tool And Public Contract

**Files:**
- Create: `src/tools/v2-reverse-plan.ts`
- Modify: `src/plugin.ts`
- Modify: `src/index.ts`
- Test: `tests/v2-reverse-plan-tool.test.ts`
- Test: `tests/plugin.test.ts`
- Test: `tests/public-contract.test.ts`

- [ ] **Step 1: Write failing tool, plugin, and public-contract tests**

Create tests requiring:

- reverse planning is blocked unless the workflow has an existing v2 registry claim;
- registry base URL mismatch blocks before fetching the workflow;
- active read-only claimed workflows can be reverse planned without n8n writes;
- reverse planning saves `source: "reverse"` plan versions and updates local registry latest plan metadata;
- plugin registers `n8n_v2_reverse_plan` after `n8n_v2_claim_workflow`;
- public package exports reverse planning args/result and unmapped-node types.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-reverse-plan-tool.test.ts tests/plugin.test.ts tests/public-contract.test.ts
```

Expected: FAIL because the tool is not registered and public types are not exported.

- [ ] **Step 3: Implement tool, registration, and exports**

In `src/tools/v2-reverse-plan.ts`:

- implement `V2ReversePlanArgs`;
- implement `V2ReversePlanResult`;
- implement `reverseV2WorkflowPlan(input)`;
- require v2 registry record before API fetch;
- block registry base URL mismatch;
- fetch workflow with `api.getWorkflow`;
- save plan with `planStore.saveReverse()`;
- update registry with `latestPlanId`, `latestPlanVersion`, `latestWorkflowHash`, and `lastUpdatedAt`;
- preserve claim mode, active-at-claim, preview metadata, and validation status.

In `src/plugin.ts`:

- import and register `n8n_v2_reverse_plan` after claim;
- use API-only dependencies and no MCP.

In `src/index.ts`:

- export reverse planning public types from the new tool and planner module.

- [ ] **Step 4: Verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-reverse-plan-tool.test.ts tests/plugin.test.ts tests/public-contract.test.ts tests/v2-reverse-planner.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/tools/v2-reverse-plan.ts src/plugin.ts src/index.ts tests/v2-reverse-plan-tool.test.ts tests/plugin.test.ts tests/public-contract.test.ts
git commit -m "feat: register v2 reverse planning tool"
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

Confirm this stage delivered reverse planning foundation only and did not add lossless import, claimed workflow structural updates, active workflow apply, execution-history sampling, trial runs, MCP validation, credential creation, or automatic redesign apply.

- [ ] **Step 3: Commit final fixes if needed**

Only commit if verification or scope review required changes.
