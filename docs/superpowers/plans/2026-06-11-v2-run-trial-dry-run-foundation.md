# v2 Run Trial Dry-Run Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in `n8n_v2_run_trial` foundation that stores auditable dry-run trial artifacts without triggering n8n executions or external API calls.

**Architecture:** `src/v2/run-store.ts` persists redacted immutable trial artifacts under `.opencode/n8n-v2/runs/`. `src/tools/v2-run-trial.ts` loads a compiled preview and exact plan version, requires `confirm: true`, re-runs foundation validation/simulation, optionally filters by sample name, saves a `mode: "dry_run"` artifact, and returns clear provenance that no n8n execution was triggered.

**Tech Stack:** TypeScript, Vitest, existing v2 plan/preview stores, existing validator/simulator, existing OpenCode plugin API.

---

## Scope Check

This plan implements only dry-run trial foundation. It does not trigger arbitrary n8n workflow executions, create temporary workflows, activate workflows, call external APIs, sample execution history, or implement shadow trials for active workflows.

## File Structure

- Create `src/v2/run-store.ts`: immutable v2 trial run artifact persistence.
- Create `src/tools/v2-run-trial.ts`: `n8n_v2_run_trial` dry-run orchestration.
- Modify `src/plugin.ts`: register `n8n_v2_run_trial` after `n8n_v2_reverse_plan`.
- Modify `src/index.ts`: export run-trial args/result and artifact types.
- Modify docs/tests to include the new public v2 tool and dry-run-only safety contract.

## Task 1: Add Trial Run Store And Tool

**Files:**
- Create: `src/v2/run-store.ts`
- Create: `src/tools/v2-run-trial.ts`
- Test: `tests/v2-run-store.test.ts`
- Test: `tests/v2-run-trial-tool.test.ts`

- [ ] **Step 1: Write failing store and tool tests**

Tests require:

- run artifacts save under `.opencode/n8n-v2/runs/<runId>.json`;
- artifact IDs are UUIDs and do not overwrite existing files;
- persisted artifacts redact secret-looking values;
- `runV2Trial` requires `confirm: true`;
- `mode: "dry_run"` loads preview and plan, re-runs simulation, saves a run artifact, returns `triggered: false`, `cleanupRequired: false`, and warning `V2_TRIAL_DRY_RUN_ONLY`;
- missing preview, missing plan, failed preview, and missing sample names throw typed errors.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-run-store.test.ts tests/v2-run-trial-tool.test.ts
```

Expected: FAIL because store and tool do not exist.

- [ ] **Step 3: Implement store and tool**

Implement `V2TrialRunArtifact`, `V2RunStore`, `V2RunTrialArgs`, `V2RunTrialResult`, and `runV2Trial()`.

Rules:

- Only `mode: "dry_run"` is supported in this foundation.
- `confirm: true` is mandatory.
- Preview must exist and must not have `validationStatus: "failed"`.
- Exact plan version referenced by preview must exist.
- Simulation is re-run and attached to the artifact.
- Optional `sampleName` must match a simulation sample result.
- Persisted artifact records `triggered: false`, `executionMode: "not_triggered"`, and `cleanupRequired: false`.
- No n8n API dependency is accepted or called.

- [ ] **Step 4: Verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-run-store.test.ts tests/v2-run-trial-tool.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/v2/run-store.ts src/tools/v2-run-trial.ts tests/v2-run-store.test.ts tests/v2-run-trial-tool.test.ts docs/superpowers/plans/2026-06-11-v2-run-trial-dry-run-foundation.md
git commit -m "feat: add v2 dry-run trial foundation"
```

## Task 2: Register Trial Tool And Update Contract

**Files:**
- Modify: `src/plugin.ts`
- Modify: `src/index.ts`
- Modify: `tests/plugin.test.ts`
- Modify: `tests/public-contract.test.ts`
- Modify: `tests/docs-release.test.ts`
- Modify: `README.md`
- Modify: `docs/public-contract.md`
- Modify: `docs/operations.md`
- Modify: `docs/security-review.md`
- Modify: `docs/release-checklist.md`

- [ ] **Step 1: Write failing registration and docs tests**

Tests require:

- plugin tool list includes `n8n_v2_run_trial` after reverse planning;
- tool args are `{ previewId, mode, confirm, sampleName }`;
- plugin can run a local dry-run trial after auto preview without n8n API or MCP;
- public barrel exports `V2RunTrialArgs`, `V2RunTrialResult`, and `V2TrialRunArtifact`;
- docs describe dry-run-only trial foundation and no real execution trigger.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/plugin.test.ts tests/public-contract.test.ts tests/docs-release.test.ts
```

Expected: FAIL because plugin, exports, and docs do not include the tool.

- [ ] **Step 3: Implement registration, exports, docs**

Wire `V2RunStore` in local deps, register `n8n_v2_run_trial`, export public types, and update docs.

- [ ] **Step 4: Verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/plugin.test.ts tests/public-contract.test.ts tests/docs-release.test.ts tests/v2-run-trial-tool.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/plugin.ts src/index.ts tests/plugin.test.ts tests/public-contract.test.ts tests/docs-release.test.ts README.md docs/public-contract.md docs/operations.md docs/security-review.md docs/release-checklist.md
git commit -m "feat: register v2 dry-run trial tool"
```

## Task 3: Final Verification

- [ ] **Step 1: Run full verification**

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsup
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" node scripts/check-package-files.mjs
git diff --check
```

- [ ] **Step 2: Scope review**

Confirm this stage added dry-run trial foundation only and did not trigger n8n executions, create temporary workflows, activate workflows, sample execution history, call external APIs, or implement shadow trials.
