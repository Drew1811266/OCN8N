# v2 Auto Preview Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the default v2 convenience-track tool that turns a natural-language request into a reviewed, validated, simulated, and compiled local workflow preview without writing to n8n.

**Architecture:** `src/tools/v2-auto-preview.ts` orchestrates the existing local v2 stages: create plan, review plan, validate/simulate, and compile preview. It persists the plan and preview through the existing v2 stores, returns compact review/simulation/preview metadata, and keeps the full flow local-only. `src/plugin.ts` registers `n8n_v2_auto_preview` before explicit v2 stage tools, and `src/index.ts` exports the public args/result contract.

**Tech Stack:** TypeScript, Vitest, existing v2 plan store, existing v2 preview store, existing v2 tool orchestration, existing local plugin config.

---

## Scope Check

This plan implements only the local convenience-track `n8n_v2_auto_preview` foundation. It does not implement `n8n_v2_apply`, claim/import, reverse planning, trial runs, MCP validation, n8n API calls, or active workflow operations.

## File Structure

- Create `src/tools/v2-auto-preview.ts`: local orchestration for create/review/validate/simulate/compile.
- Create `tests/v2-auto-preview-tool.test.ts`: direct tool tests for artifact persistence and returned metadata.
- Modify `src/plugin.ts`: register `n8n_v2_auto_preview` with args `{ prompt, name? }` and execute via `localDeps()` only.
- Modify `src/index.ts`: export `V2AutoPreviewArgs` and `V2AutoPreviewResult`.
- Modify `tests/plugin.test.ts`: registration order and local-only plugin smoke path.
- Modify `tests/public-contract.test.ts`: public type contract coverage.

## Task 1: Add v2 Auto Preview Tool

**Files:**
- Create: `src/tools/v2-auto-preview.ts`
- Test: `tests/v2-auto-preview-tool.test.ts`

- [ ] **Step 1: Write failing auto-preview tool tests**

Create `tests/v2-auto-preview-tool.test.ts` with tests equivalent to:

```ts
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { autoPreviewV2Workflow } from "../src/tools/v2-auto-preview.js"
import { V2PlanStore } from "../src/v2/plan-store.js"
import { V2PreviewStore } from "../src/v2/preview-store.js"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ocn8n-v2-auto-preview-tool-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function planStore(): V2PlanStore {
  return new V2PlanStore(path.join(dir, ".opencode", "n8n-v2", "plans"))
}

function previewStore(): V2PreviewStore {
  return new V2PreviewStore(path.join(dir, ".opencode", "n8n-v2", "previews"))
}

describe("autoPreviewV2Workflow", () => {
  it("creates, reviews, simulates, compiles, and stores a local preview", async () => {
    const plans = planStore()
    const previews = previewStore()

    const result = await autoPreviewV2Workflow({
      args: {
        name: "Order fulfillment",
        prompt:
          "Create a webhook order workflow that maps fields, filters invalid orders, branches by status with a default path, processes each item in batches, calls an external fulfillment API with API key auth and mock response schema, retries failures, sends Slack notification, writes the result, and responds to the webhook.",
      },
      planStore: plans,
      previewStore: previews,
      pluginVersion: "2.0.0",
      now: () => new Date("2026-06-11T01:00:00.000Z"),
    })

    expect(result).toEqual(
      expect.objectContaining({
        planVersion: 1,
        workflowName: "Order fulfillment",
        nodeCount: 7,
        validationStatus: "passed",
        confidence: "medium",
        riskLevel: "medium",
      }),
    )
    expect(result.previewId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(result.review.summary).toContain("pattern")
    expect(result.simulation.status).toBe("passed")
    expect(result.mappingTrace).toEqual(expect.arrayContaining([expect.objectContaining({ stepId: "step_external_call" })]))

    const storedPlan = await plans.get(result.planId, result.planVersion)
    const storedPreview = await previews.get(result.previewId)
    expect(storedPlan?.plan.intent.scope).toEqual(["Order fulfillment"])
    expect(storedPreview?.planId).toBe(result.planId)
    expect(storedPreview?.workflowHash).toBe(result.workflowHash)
  })

  it("rejects blank prompts before creating artifacts", async () => {
    const plans = planStore()
    const previews = previewStore()

    await expect(
      autoPreviewV2Workflow({
        args: { prompt: "   " },
        planStore: plans,
        previewStore: previews,
        pluginVersion: "2.0.0",
      }),
    ).rejects.toMatchObject({
      code: "TOOL_ARGS_INVALID",
      details: { field: "prompt" },
    })
  })
})
```

- [ ] **Step 2: Verify tests fail**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-auto-preview-tool.test.ts
```

Expected: FAIL because `src/tools/v2-auto-preview.ts` does not exist.

- [ ] **Step 3: Implement auto-preview tool**

Create `src/tools/v2-auto-preview.ts` with:

```ts
import { N8nBuilderError } from "../errors.js"
import { compileV2Preview, type V2CompilePreviewResult } from "./v2-compile-preview.js"
import { createV2Plan, type V2CreatePlanArgs } from "./v2-create-plan.js"
import { reviewV2PlanTool } from "./v2-review-plan.js"
import { validateSimulateV2Plan } from "./v2-validate-simulate.js"
import type { V2PlanStore } from "../v2/plan-store.js"
import type { V2PreviewMappingTrace, V2PreviewStore } from "../v2/preview-store.js"
import type { V2Confidence, V2PlanReview, V2RiskLevel, V2SimulationResult, V2Warning } from "../v2/types.js"

export type V2AutoPreviewArgs = V2CreatePlanArgs

export type V2AutoPreviewResult = {
  planId: string
  planVersion: number
  summary: string
  previewId: string
  workflowName: string
  nodeCount: number
  workflowHash: string
  validationStatus: V2SimulationResult["status"]
  confidence: V2Confidence
  riskLevel: V2RiskLevel
  review: V2PlanReview
  simulation: V2SimulationResult
  mappingTrace: V2PreviewMappingTrace[]
  warnings: V2Warning[]
}

export async function autoPreviewV2Workflow(input: {
  args: V2AutoPreviewArgs
  planStore: V2PlanStore
  previewStore: V2PreviewStore
  pluginVersion: string
  now?: () => Date
}): Promise<V2AutoPreviewResult> {
  if (input.args.prompt.trim().length === 0) {
    throw new N8nBuilderError("Auto preview requires a prompt.", "TOOL_ARGS_INVALID", { field: "prompt" })
  }

  const created = await createV2Plan({
    args: input.args,
    planStore: input.planStore,
    now: input.now,
  })
  const planRef = { planId: created.planId, planVersion: created.planVersion }
  const review = await reviewV2PlanTool({ args: planRef, planStore: input.planStore })
  const simulation = await validateSimulateV2Plan({ args: planRef, planStore: input.planStore, now: input.now })
  const preview: V2CompilePreviewResult = await compileV2Preview({
    args: planRef,
    planStore: input.planStore,
    previewStore: input.previewStore,
    pluginVersion: input.pluginVersion,
    now: input.now,
  })

  return {
    planId: created.planId,
    planVersion: created.planVersion,
    summary: created.summary,
    previewId: preview.previewId,
    workflowName: preview.workflowName,
    nodeCount: preview.nodeCount,
    workflowHash: preview.workflowHash,
    validationStatus: preview.validationStatus,
    confidence: created.confidence,
    riskLevel: created.riskLevel,
    review,
    simulation,
    mappingTrace: preview.mappingTrace,
    warnings: mergeWarnings(created.warnings, preview.warnings),
  }
}

function mergeWarnings(...groups: V2Warning[][]): V2Warning[] {
  const seen = new Set<string>()
  const warnings: V2Warning[] = []

  for (const warning of groups.flat()) {
    const key = `${warning.code}:${warning.stepId ?? ""}:${warning.patternId ?? ""}:${warning.message}`
    if (!seen.has(key)) {
      seen.add(key)
      warnings.push(warning)
    }
  }

  return warnings
}
```

- [ ] **Step 4: Verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-auto-preview-tool.test.ts tests/v2-compile-preview-tool.test.ts tests/v2-tools.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/tools/v2-auto-preview.ts tests/v2-auto-preview-tool.test.ts
git commit -m "feat: add v2 auto preview orchestration"
```

## Task 2: Register Tool And Export Contract

**Files:**
- Modify: `src/plugin.ts`
- Modify: `src/index.ts`
- Modify: `tests/plugin.test.ts`
- Modify: `tests/public-contract.test.ts`

- [ ] **Step 1: Write failing plugin and public-contract tests**

Modify tests to require:

- `n8n_v2_auto_preview` appears before `n8n_v2_create_plan`.
- tool args are `{ prompt, name }`.
- plugin local-only v2 flow can execute `n8n_v2_auto_preview` without n8n API/MCP env and returns `previewId`, `planId`, `planVersion`, `nodeCount`, and `validationStatus`.
- `V2AutoPreviewArgs` and `V2AutoPreviewResult` are exported from `src/index.ts`.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/plugin.test.ts tests/public-contract.test.ts
```

Expected: FAIL because the tool is not registered and public types are not exported.

- [ ] **Step 3: Implement plugin registration and exports**

In `src/plugin.ts`:

- import `autoPreviewV2Workflow` from `./tools/v2-auto-preview.js`;
- register `n8n_v2_auto_preview` before `n8n_v2_create_plan`;
- use `localDeps()` only;
- pass `planStore`, `previewStore`, and `pluginVersion`;
- return `jsonOutput("v2 n8n workflow auto preview compiled", result)`.

In `src/index.ts`:

```ts
export type { V2AutoPreviewArgs, V2AutoPreviewResult } from "./tools/v2-auto-preview.js"
```

- [ ] **Step 4: Verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/plugin.test.ts tests/public-contract.test.ts tests/v2-auto-preview-tool.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/plugin.ts src/index.ts tests/plugin.test.ts tests/public-contract.test.ts
git commit -m "feat: register v2 auto preview tool"
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

Confirm this stage delivered local auto preview only and did not add apply, n8n API writes, MCP validation, trial runs, reverse planning, or active workflow operations.

- [ ] **Step 3: Commit final fixes if needed**

Only commit if verification or scope review required changes.

