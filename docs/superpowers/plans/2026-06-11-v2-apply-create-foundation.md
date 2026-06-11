# v2 Apply Create Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first v2 apply path: explicitly create a new inactive n8n workflow from an existing compiled v2 preview and record it in the v2 registry.

**Architecture:** `src/tools/v2-apply.ts` reads a local v2 preview artifact, rechecks the exact plan version and credential readiness, validates the preview workflow locally, requires `confirm: true`, calls the existing n8n REST API client to create an inactive workflow, and writes a v2 registry record. `src/plugin.ts` registers `n8n_v2_apply` after `n8n_v2_compile_preview` and wires API config plus v2 stores/registry. This stage intentionally supports create-new only; update of claimed inactive workflows is deferred until v2 claim/import and stale-hash update semantics are implemented.

**Tech Stack:** TypeScript, Vitest, existing `N8nApiClient`, existing `V2PlanStore`, existing `V2PreviewStore`, existing `V2WorkflowRegistry`, existing workflow validator and stable hashing helpers.

---

## Scope Check

This plan implements only explicit create-new apply from a compiled v2 preview. It does not implement update of claimed workflows, v2 claim/import, reverse planning, active workflow structural apply, trial runs, MCP validation, credential creation, or execution-history sampling.

## File Structure

- Create `src/tools/v2-apply.ts`: typed apply orchestration for `confirm: true` create-new apply.
- Create `tests/v2-apply-tool.test.ts`: direct unit tests for create apply, confirmation blocking, missing preview blocking, and credential blocking.
- Modify `src/plugin.ts`: add `V2WorkflowRegistry` wiring in API deps and register `n8n_v2_apply`.
- Modify `src/index.ts`: export `V2ApplyArgs` and `V2ApplyResult`.
- Modify `tests/plugin.test.ts`: registration order, args, and API-only plugin smoke path for v2 apply.
- Modify `tests/public-contract.test.ts`: public type contract coverage.

## Task 1: Add v2 Apply Tool

**Files:**
- Create: `src/tools/v2-apply.ts`
- Test: `tests/v2-apply-tool.test.ts`

- [ ] **Step 1: Write failing apply tool tests**

Create `tests/v2-apply-tool.test.ts` covering:

```ts
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { stableHash } from "../src/hash.js"
import { applyV2Preview } from "../src/tools/v2-apply.js"
import { compileV2Preview } from "../src/tools/v2-compile-preview.js"
import { createInitialV2Plan } from "../src/v2/plan-service.js"
import { V2PlanStore } from "../src/v2/plan-store.js"
import { V2PreviewStore } from "../src/v2/preview-store.js"
import { V2WorkflowRegistry } from "../src/v2/registry.js"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ocn8n-v2-apply-tool-"))
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

function registry(): V2WorkflowRegistry {
  return new V2WorkflowRegistry(path.join(dir, ".opencode", "n8n-v2", "registry", "workflows.json"))
}

async function createCompiledPreview(input: { prompt: string; name?: string }) {
  const plans = planStore()
  const previews = previewStore()
  const version = await plans.saveInitial({
    plan: createInitialV2Plan(input),
    createdAt: "2026-06-11T02:00:00.000Z",
    summary: "Initial plan",
  })
  const compiled = await compileV2Preview({
    args: { planId: version.planId, planVersion: version.planVersion },
    planStore: plans,
    previewStore: previews,
    pluginVersion: "2.0.0",
    now: () => new Date("2026-06-11T02:05:00.000Z"),
  })

  return { plans, previews, version, compiled }
}

describe("applyV2Preview", () => {
  it("creates an inactive workflow from a compiled preview and records v2 registry ownership", async () => {
    const { plans, previews, compiled } = await createCompiledPreview({
      prompt: "Receive an order webhook and respond to the webhook.",
      name: "Order intake",
    })
    const v2Registry = registry()
    const api = {
      createWorkflow: vi.fn(async (workflow) => ({ ...workflow, id: "wf_v2_1" })),
    }

    const result = await applyV2Preview({
      args: { previewId: compiled.previewId, confirm: true },
      config: { baseUrl: "https://demo/api/v1", pluginVersion: "2.0.0" },
      api,
      planStore: plans,
      previewStore: previews,
      registry: v2Registry,
      now: () => new Date("2026-06-11T02:10:00.000Z"),
    })

    expect(api.createWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Order intake",
        active: false,
        meta: expect.objectContaining({ managedBy: "opencode-n8n-builder-v2" }),
      }),
    )
    expect(result).toEqual(
      expect.objectContaining({
        workflowId: "wf_v2_1",
        name: "Order intake",
        url: "https://demo/workflow/wf_v2_1",
        mode: "create",
        previewId: compiled.previewId,
        planId: compiled.planId,
        planVersion: compiled.planVersion,
        nodeCount: expect.any(Number),
        validationStatus: "passed",
      }),
    )

    const record = await v2Registry.get("wf_v2_1")
    expect(record).toEqual(
      expect.objectContaining({
        workflowId: "wf_v2_1",
        claimMode: "full",
        activeAtClaim: false,
        managedBy: "opencode-n8n-builder-v2",
        latestPlanId: compiled.planId,
        latestPlanVersion: compiled.planVersion,
        latestPreviewId: compiled.previewId,
        latestWorkflowHash: result.workflowHash,
        lastValidationStatus: "passed",
      }),
    )
    expect(result.workflowHash).toBe(stableHash({ ...(api.createWorkflow.mock.results[0].value as unknown as object) }))
  })

  it("requires explicit confirmation before reading or writing through the API", async () => {
    const { plans, previews, compiled } = await createCompiledPreview({
      prompt: "Receive an order webhook and respond to the webhook.",
    })
    const api = { createWorkflow: vi.fn(async (workflow) => ({ ...workflow, id: "wf_v2_1" })) }

    await expect(
      applyV2Preview({
        args: { previewId: compiled.previewId, confirm: false },
        config: { baseUrl: "https://demo/api/v1", pluginVersion: "2.0.0" },
        api,
        planStore: plans,
        previewStore: previews,
        registry: registry(),
      }),
    ).rejects.toMatchObject({ code: "V2_APPLY_CONFIRM_REQUIRED" })
    expect(api.createWorkflow).not.toHaveBeenCalled()
  })

  it("rejects missing previews without creating workflows", async () => {
    const api = { createWorkflow: vi.fn(async (workflow) => ({ ...workflow, id: "wf_v2_1" })) }

    await expect(
      applyV2Preview({
        args: { previewId: "123e4567-e89b-42d3-a456-426614174000", confirm: true },
        config: { baseUrl: "https://demo/api/v1", pluginVersion: "2.0.0" },
        api,
        planStore: planStore(),
        previewStore: previewStore(),
        registry: registry(),
      }),
    ).rejects.toMatchObject({ code: "V2_PREVIEW_NOT_FOUND" })
    expect(api.createWorkflow).not.toHaveBeenCalled()
  })

  it("blocks apply when the referenced plan still has credential requirements that block apply", async () => {
    const { plans, previews, compiled } = await createCompiledPreview({
      prompt: "Create a webhook order workflow that calls an external fulfillment API with API key auth.",
      name: "Order fulfillment",
    })
    const api = { createWorkflow: vi.fn(async (workflow) => ({ ...workflow, id: "wf_v2_1" })) }

    await expect(
      applyV2Preview({
        args: { previewId: compiled.previewId, confirm: true },
        config: { baseUrl: "https://demo/api/v1", pluginVersion: "2.0.0" },
        api,
        planStore: plans,
        previewStore: previews,
        registry: registry(),
      }),
    ).rejects.toMatchObject({
      code: "V2_CREDENTIALS_BLOCK_APPLY",
      details: { credentialRequirementIds: ["credential_external_api"] },
    })
    expect(api.createWorkflow).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Verify tests fail**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-apply-tool.test.ts
```

Expected: FAIL because `src/tools/v2-apply.ts` does not exist.

- [ ] **Step 3: Implement apply tool**

Create `src/tools/v2-apply.ts` with:

- `V2ApplyArgs = { previewId: string; confirm: boolean }`
- `V2ApplyResult`
- `applyV2Preview(input)`
- confirmation check before preview lookup or API write
- preview lookup through `V2PreviewStore.get`
- exact plan lookup through `V2PlanStore.get`
- credential blocking when `credentialRequirements` has `blocksApply: true` and status other than `available`
- local workflow validation with `validateWorkflowForSave({ requireManagedMarker: false })`
- forced inactive workflow creation
- v2 registry upsert with `claimMode: "full"`, `activeAtClaim: false`, latest plan/preview/hash/status metadata

- [ ] **Step 4: Verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-apply-tool.test.ts tests/v2-compile-preview-tool.test.ts tests/v2-registry.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/tools/v2-apply.ts tests/v2-apply-tool.test.ts
git commit -m "feat: add v2 create apply tool"
```

## Task 2: Register Apply Tool And Export Contract

**Files:**
- Modify: `src/plugin.ts`
- Modify: `src/index.ts`
- Modify: `tests/plugin.test.ts`
- Modify: `tests/public-contract.test.ts`

- [ ] **Step 1: Write failing plugin and public-contract tests**

Modify tests to require:

- `n8n_v2_apply` appears after `n8n_v2_compile_preview`.
- tool args are `{ previewId, confirm }`.
- plugin API path can create a preview locally, then apply it through API config without MCP config.
- public package exports `V2ApplyArgs` and `V2ApplyResult`.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/plugin.test.ts tests/public-contract.test.ts
```

Expected: FAIL because the tool is not registered and public types are not exported.

- [ ] **Step 3: Implement plugin registration and exports**

In `src/plugin.ts`:

- import `applyV2Preview` from `./tools/v2-apply.js`;
- import `V2WorkflowRegistry` from `./v2/registry.js`;
- extend `apiDeps()` to return `v2PlanStore`, `v2PreviewStore`, and `v2Registry`;
- register `n8n_v2_apply` after `n8n_v2_compile_preview`;
- use `apiDeps()` only, so apply requires n8n API config but not MCP config.

In `src/index.ts`:

```ts
export type { V2ApplyArgs, V2ApplyResult } from "./tools/v2-apply.js"
```

- [ ] **Step 4: Verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/plugin.test.ts tests/public-contract.test.ts tests/v2-apply-tool.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/plugin.ts src/index.ts tests/plugin.test.ts tests/public-contract.test.ts
git commit -m "feat: register v2 apply tool"
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

Confirm this stage delivered create-new v2 apply only and did not add claimed workflow updates, active workflow apply, claim/import, reverse planning, trial runs, MCP validation, credential creation, or execution-history sampling.

- [ ] **Step 3: Commit final fixes if needed**

Only commit if verification or scope review required changes.

