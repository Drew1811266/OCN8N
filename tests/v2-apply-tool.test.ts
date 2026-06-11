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

function claimedWorkflow(overrides: Partial<N8nWorkflow & { id: string }> = {}): N8nWorkflow & { id: string } {
  return {
    id: "wf_claimed",
    name: "Claimed orders",
    active: false,
    nodes: [
      {
        name: "Manual Trigger",
        type: "n8n-nodes-base.manualTrigger",
        typeVersion: 1,
        position: [0, 0],
        parameters: {},
      },
    ],
    connections: {},
    settings: {},
    meta: { managedBy: "opencode-n8n-builder-v2" },
    tags: [{ name: "opencode-n8n-builder-v2" }],
    ...overrides,
  }
}

async function saveClaim(input: {
  registry: V2WorkflowRegistry
  workflow: N8nWorkflow & { id: string }
  baseUrl?: string
  claimMode?: "full" | "read_only"
}) {
  await input.registry.upsert({
    workflowId: input.workflow.id,
    name: input.workflow.name,
    url: `https://demo/workflow/${input.workflow.id}`,
    baseUrl: input.baseUrl ?? "https://demo/api/v1",
    claimMode: input.claimMode ?? "full",
    activeAtClaim: input.workflow.active,
    managedBy: "opencode-n8n-builder-v2",
    managedByVersion: "2.0.0",
    latestWorkflowHash: stableHash(input.workflow),
    lastUpdatedAt: "2026-06-11T02:00:00.000Z",
  })
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

  it("updates a v2-claimed inactive workflow when the current workflow hash matches the registry", async () => {
    const { plans, previews, compiled } = await createCompiledPreview({
      prompt: "Receive an order webhook and respond to the webhook.",
      name: "Updated claimed orders",
    })
    const v2Registry = registry()
    const current = claimedWorkflow()
    await saveClaim({ registry: v2Registry, workflow: current })
    const api = {
      createWorkflow: vi.fn(async (workflow: N8nWorkflow) => ({ ...workflow, id: "created_unexpected" })),
      getWorkflow: vi.fn(async () => current),
      updateWorkflow: vi.fn(async (workflowId: string, workflow: N8nWorkflow) => ({ ...workflow, id: workflowId })),
    }

    const result = await applyV2Preview({
      args: { previewId: compiled.previewId, workflowId: current.id, confirm: true },
      config: { baseUrl: "https://demo/api/v1", pluginVersion: "2.0.0" },
      api,
      planStore: plans,
      previewStore: previews,
      registry: v2Registry,
      now: () => new Date("2026-06-11T02:15:00.000Z"),
    })

    expect(api.createWorkflow).not.toHaveBeenCalled()
    expect(api.getWorkflow).toHaveBeenCalledWith("wf_claimed")
    expect(api.updateWorkflow).toHaveBeenCalledWith(
      "wf_claimed",
      expect.objectContaining({
        name: "Updated claimed orders",
        active: false,
        meta: expect.objectContaining({ managedBy: "opencode-n8n-builder-v2" }),
      }),
    )
    const updatedWorkflow = { ...api.updateWorkflow.mock.calls[0][1], id: "wf_claimed" }
    expect(result).toEqual(
      expect.objectContaining({
        workflowId: "wf_claimed",
        name: "Updated claimed orders",
        url: "https://demo/workflow/wf_claimed",
        mode: "update",
        previewId: compiled.previewId,
        workflowHash: stableHash(updatedWorkflow),
      }),
    )

    const record = await v2Registry.get("wf_claimed")
    expect(record).toEqual(
      expect.objectContaining({
        workflowId: "wf_claimed",
        claimMode: "full",
        latestPlanId: compiled.planId,
        latestPlanVersion: compiled.planVersion,
        latestPreviewId: compiled.previewId,
        latestWorkflowHash: stableHash(updatedWorkflow),
        lastValidationStatus: "passed",
        lastUpdatedAt: "2026-06-11T02:15:00.000Z",
      }),
    )
  })

  it("rejects update apply for unclaimed workflows", async () => {
    const { plans, previews, compiled } = await createCompiledPreview({
      prompt: "Receive an order webhook and respond to the webhook.",
    })
    const api = {
      createWorkflow: vi.fn(async (workflow: N8nWorkflow) => ({ ...workflow, id: "created_unexpected" })),
      getWorkflow: vi.fn(async () => claimedWorkflow()),
      updateWorkflow: vi.fn(async (workflowId: string, workflow: N8nWorkflow) => ({ ...workflow, id: workflowId })),
    }

    await expect(
      applyV2Preview({
        args: { previewId: compiled.previewId, workflowId: "wf_claimed", confirm: true },
        config: { baseUrl: "https://demo/api/v1", pluginVersion: "2.0.0" },
        api,
        planStore: plans,
        previewStore: previews,
        registry: registry(),
      }),
    ).rejects.toMatchObject({ code: "V2_WORKFLOW_NOT_CLAIMED" })
    expect(api.updateWorkflow).not.toHaveBeenCalled()
  })

  it("rejects update apply for read-only claims", async () => {
    const { plans, previews, compiled } = await createCompiledPreview({
      prompt: "Receive an order webhook and respond to the webhook.",
    })
    const v2Registry = registry()
    const current = claimedWorkflow()
    await saveClaim({ registry: v2Registry, workflow: current, claimMode: "read_only" })
    const api = {
      createWorkflow: vi.fn(async (workflow: N8nWorkflow) => ({ ...workflow, id: "created_unexpected" })),
      getWorkflow: vi.fn(async () => current),
      updateWorkflow: vi.fn(async (workflowId: string, workflow: N8nWorkflow) => ({ ...workflow, id: workflowId })),
    }

    await expect(
      applyV2Preview({
        args: { previewId: compiled.previewId, workflowId: current.id, confirm: true },
        config: { baseUrl: "https://demo/api/v1", pluginVersion: "2.0.0" },
        api,
        planStore: plans,
        previewStore: previews,
        registry: v2Registry,
      }),
    ).rejects.toMatchObject({ code: "V2_APPLY_READ_ONLY_CLAIM" })
    expect(api.updateWorkflow).not.toHaveBeenCalled()
  })

  it("rejects update apply when the current workflow is active", async () => {
    const { plans, previews, compiled } = await createCompiledPreview({
      prompt: "Receive an order webhook and respond to the webhook.",
    })
    const v2Registry = registry()
    const claimed = claimedWorkflow({ active: false })
    const current = claimedWorkflow({ active: true })
    await saveClaim({ registry: v2Registry, workflow: claimed })
    const api = {
      createWorkflow: vi.fn(async (workflow: N8nWorkflow) => ({ ...workflow, id: "created_unexpected" })),
      getWorkflow: vi.fn(async () => current),
      updateWorkflow: vi.fn(async (workflowId: string, workflow: N8nWorkflow) => ({ ...workflow, id: workflowId })),
    }

    await expect(
      applyV2Preview({
        args: { previewId: compiled.previewId, workflowId: current.id, confirm: true },
        config: { baseUrl: "https://demo/api/v1", pluginVersion: "2.0.0" },
        api,
        planStore: plans,
        previewStore: previews,
        registry: v2Registry,
      }),
    ).rejects.toMatchObject({ code: "V2_APPLY_ACTIVE_WORKFLOW" })
    expect(api.updateWorkflow).not.toHaveBeenCalled()
  })

  it("rejects update apply when the current workflow hash no longer matches the registry", async () => {
    const { plans, previews, compiled } = await createCompiledPreview({
      prompt: "Receive an order webhook and respond to the webhook.",
    })
    const v2Registry = registry()
    const claimed = claimedWorkflow()
    const current = claimedWorkflow({ name: "Changed outside v2" })
    await saveClaim({ registry: v2Registry, workflow: claimed })
    const api = {
      createWorkflow: vi.fn(async (workflow: N8nWorkflow) => ({ ...workflow, id: "created_unexpected" })),
      getWorkflow: vi.fn(async () => current),
      updateWorkflow: vi.fn(async (workflowId: string, workflow: N8nWorkflow) => ({ ...workflow, id: workflowId })),
    }

    await expect(
      applyV2Preview({
        args: { previewId: compiled.previewId, workflowId: current.id, confirm: true },
        config: { baseUrl: "https://demo/api/v1", pluginVersion: "2.0.0" },
        api,
        planStore: plans,
        previewStore: previews,
        registry: v2Registry,
      }),
    ).rejects.toMatchObject({ code: "V2_APPLY_WORKFLOW_STALE" })
    expect(api.updateWorkflow).not.toHaveBeenCalled()
  })
})
