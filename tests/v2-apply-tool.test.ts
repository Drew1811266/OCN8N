import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { stableHash } from "../src/hash.js"
import { applyV2Preview } from "../src/tools/v2-apply.js"
import { compileV2Preview } from "../src/tools/v2-compile-preview.js"
import type { N8nWorkflow } from "../src/validator.js"
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
      createWorkflow: vi.fn(async (workflow: N8nWorkflow) => ({ ...workflow, id: "wf_v2_1" })),
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
    const createdWorkflow = { ...api.createWorkflow.mock.calls[0][0], id: "wf_v2_1" }
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
        workflowHash: stableHash(createdWorkflow),
        validationStatus: "passed",
      }),
    )

    const record = await v2Registry.get("wf_v2_1")
    expect(record).toEqual(
      expect.objectContaining({
        workflowId: "wf_v2_1",
        name: "Order intake",
        url: "https://demo/workflow/wf_v2_1",
        baseUrl: "https://demo/api/v1",
        claimMode: "full",
        activeAtClaim: false,
        managedBy: "opencode-n8n-builder-v2",
        managedByVersion: "2.0.0",
        latestPlanId: compiled.planId,
        latestPlanVersion: compiled.planVersion,
        latestPreviewId: compiled.previewId,
        latestWorkflowHash: stableHash(createdWorkflow),
        lastValidationStatus: "passed",
        lastUpdatedAt: "2026-06-11T02:10:00.000Z",
      }),
    )
  })

  it("requires explicit confirmation before writing through the API", async () => {
    const { plans, previews, compiled } = await createCompiledPreview({
      prompt: "Receive an order webhook and respond to the webhook.",
    })
    const api = { createWorkflow: vi.fn(async (workflow: N8nWorkflow) => ({ ...workflow, id: "wf_v2_1" })) }

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
    const api = { createWorkflow: vi.fn(async (workflow: N8nWorkflow) => ({ ...workflow, id: "wf_v2_1" })) }

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
    const api = { createWorkflow: vi.fn(async (workflow: N8nWorkflow) => ({ ...workflow, id: "wf_v2_1" })) }

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
