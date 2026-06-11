import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { stableHash } from "../src/hash.js"
import { compileV2Preview } from "../src/tools/v2-compile-preview.js"
import type { N8nWorkflow } from "../src/validator.js"
import { createInitialV2Plan } from "../src/v2/plan-service.js"
import { V2PlanStore } from "../src/v2/plan-store.js"
import { V2PreviewStore } from "../src/v2/preview-store.js"
import { V2WorkflowRegistry } from "../src/v2/registry.js"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ocn8n-v2-compile-preview-tool-"))
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
    lastUpdatedAt: "2026-06-11T00:00:00.000Z",
  })
}

describe("compileV2Preview", () => {
  it("compiles and stores a preview for a valid plan version", async () => {
    const plans = planStore()
    const previews = previewStore()
    const version = await plans.saveInitial({
      plan: createInitialV2Plan({
        name: "Order fulfillment",
        prompt:
          "Create a webhook order workflow that maps fields, branches by status with a default path, calls an external fulfillment API with API key auth and mock response schema, retries failures, sends Slack notification, writes the result, and responds to the webhook.",
      }),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Initial plan",
    })

    const result = await compileV2Preview({
      args: { planId: version.planId, planVersion: version.planVersion },
      planStore: plans,
      previewStore: previews,
      pluginVersion: "2.0.0",
      now: () => new Date("2026-06-11T00:10:00.000Z"),
    })

    expect(result).toEqual(
      expect.objectContaining({
        planId: version.planId,
        planVersion: version.planVersion,
        validationStatus: "passed",
        mcpValidationStatus: "not_configured",
        nodeCount: 6,
        workflowName: "Order fulfillment",
      }),
    )
    expect(result.previewId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(result.mappingTrace).toEqual(
      expect.arrayContaining([expect.objectContaining({ stepId: "step_external_call" })]),
    )

    const stored = await previews.get(result.previewId)
    expect(stored?.workflowHash).toBe(result.workflowHash)
    expect(stored?.workflowHash).toBe(stableHash(stored?.workflow))
  })

  it("validates a compiled preview through MCP when configured", async () => {
    const plans = planStore()
    const previews = previewStore()
    const mcp = {
      validateWorkflowCode: vi.fn().mockResolvedValue({
        valid: true,
        nodeCount: 6,
        warnings: [
          {
            code: "NODE_PARAMETER_OPTIONAL",
            message: "Optional response field is not configured.",
            nodeName: "Respond to Webhook",
          },
        ],
        errors: [],
      }),
    }
    const version = await plans.saveInitial({
      plan: createInitialV2Plan({
        name: "Order fulfillment",
        prompt:
          "Create a webhook order workflow that maps fields, branches by status with a default path, calls an external fulfillment API with API key auth and mock response schema, retries failures, sends Slack notification, writes the result, and responds to the webhook.",
      }),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Initial plan",
    })

    const result = await compileV2Preview({
      args: { planId: version.planId, planVersion: version.planVersion },
      planStore: plans,
      previewStore: previews,
      pluginVersion: "2.0.0",
      mcp,
      now: () => new Date("2026-06-11T00:10:00.000Z"),
    })

    expect(mcp.validateWorkflowCode).toHaveBeenCalledTimes(1)
    expect(mcp.validateWorkflowCode.mock.calls[0]?.[0]).toContain("new Workflow")
    expect(result.mcpValidationStatus).toBe("warning")
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MCP_NODE_PARAMETER_OPTIONAL",
          message: "Optional response field is not configured.",
        }),
      ]),
    )

    const stored = await previews.get(result.previewId)
    expect(stored?.warnings).toEqual(result.warnings)
  })

  it("marks configured MCP validation as passed when it returns no warnings", async () => {
    const plans = planStore()
    const previews = previewStore()
    const mcp = {
      validateWorkflowCode: vi.fn().mockResolvedValue({
        valid: true,
        warnings: [],
        errors: [],
      }),
    }
    const version = await plans.saveInitial({
      plan: createInitialV2Plan({
        prompt:
          "Create a webhook order workflow that maps fields, branches by status, calls an external fulfillment API, retries failures, and responds to the webhook.",
      }),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Initial plan",
    })

    const result = await compileV2Preview({
      args: { planId: version.planId, planVersion: version.planVersion },
      planStore: plans,
      previewStore: previews,
      pluginVersion: "2.0.0",
      mcp,
    })

    expect(mcp.validateWorkflowCode).toHaveBeenCalledTimes(1)
    expect(result.mcpValidationStatus).toBe("passed")
    expect(result.warnings.some((warning) => warning.code.startsWith("MCP_"))).toBe(false)
  })

  it("returns and persists an update diff for a v2-claimed inactive workflow", async () => {
    const plans = planStore()
    const previews = previewStore()
    const v2Registry = registry()
    const current = claimedWorkflow()
    await saveClaim({ registry: v2Registry, workflow: current })
    const version = await plans.saveInitial({
      plan: createInitialV2Plan({
        name: "Updated claimed orders",
        prompt: "Receive an order webhook and respond to the webhook.",
      }),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Initial plan",
    })
    const api = {
      getWorkflow: vi.fn(async () => current),
    }

    const result = await compileV2Preview({
      args: { planId: version.planId, planVersion: version.planVersion, workflowId: current.id },
      planStore: plans,
      previewStore: previews,
      pluginVersion: "2.0.0",
      config: { baseUrl: "https://demo/api/v1" },
      api,
      registry: v2Registry,
    })

    expect(api.getWorkflow).toHaveBeenCalledWith("wf_claimed")
    expect(result.updateTarget).toEqual(
      expect.objectContaining({
        workflowId: "wf_claimed",
        name: "Claimed orders",
        url: "https://demo/workflow/wf_claimed",
        currentWorkflowHash: stableHash(current),
        registryWorkflowHash: stableHash(current),
        hasChanges: true,
      }),
    )
    expect(result.updateTarget?.diff.removedNodes).toEqual([
      { nodeName: "Manual Trigger", nodeType: "n8n-nodes-base.manualTrigger" },
    ])
    expect(result.updateTarget?.diff.addedNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeName: "Receive input", nodeType: "n8n-nodes-base.webhook" }),
        expect.objectContaining({ nodeName: "Return output", nodeType: "n8n-nodes-base.respondToWebhook" }),
      ]),
    )

    const stored = await previews.get(result.previewId)
    expect(stored?.updateTarget).toEqual(result.updateTarget)
  })

  it("requires update preview dependencies when workflowId is supplied", async () => {
    const plans = planStore()
    const previews = previewStore()
    const version = await plans.saveInitial({
      plan: createInitialV2Plan({ prompt: "Receive an order webhook and respond to the webhook." }),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Initial plan",
    })

    await expect(
      compileV2Preview({
        args: { planId: version.planId, planVersion: version.planVersion, workflowId: "wf_claimed" },
        planStore: plans,
        previewStore: previews,
        pluginVersion: "2.0.0",
      }),
    ).rejects.toMatchObject({
      code: "V2_COMPILE_UPDATE_UNSUPPORTED",
      details: { workflowId: "wf_claimed" },
    })
  })

  it("blocks update diff for read-only, active, and stale claimed workflows", async () => {
    const plans = planStore()
    const previews = previewStore()
    const version = await plans.saveInitial({
      plan: createInitialV2Plan({ prompt: "Receive an order webhook and respond to the webhook." }),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Initial plan",
    })

    const readOnlyRegistry = registry()
    const readOnly = claimedWorkflow({ id: "wf_read_only" })
    await saveClaim({ registry: readOnlyRegistry, workflow: readOnly, claimMode: "read_only" })
    await expect(
      compileV2Preview({
        args: { planId: version.planId, planVersion: version.planVersion, workflowId: readOnly.id },
        planStore: plans,
        previewStore: previews,
        pluginVersion: "2.0.0",
        config: { baseUrl: "https://demo/api/v1" },
        api: { getWorkflow: vi.fn(async () => readOnly) },
        registry: readOnlyRegistry,
      }),
    ).rejects.toMatchObject({ code: "V2_COMPILE_UPDATE_READ_ONLY_CLAIM" })

    const activeRegistry = registry()
    const inactiveAtClaim = claimedWorkflow({ id: "wf_active" })
    const active = claimedWorkflow({ id: "wf_active", active: true })
    await saveClaim({ registry: activeRegistry, workflow: inactiveAtClaim })
    await expect(
      compileV2Preview({
        args: { planId: version.planId, planVersion: version.planVersion, workflowId: active.id },
        planStore: plans,
        previewStore: previews,
        pluginVersion: "2.0.0",
        config: { baseUrl: "https://demo/api/v1" },
        api: { getWorkflow: vi.fn(async () => active) },
        registry: activeRegistry,
      }),
    ).rejects.toMatchObject({ code: "V2_COMPILE_UPDATE_ACTIVE_WORKFLOW" })

    const staleRegistry = registry()
    const claimed = claimedWorkflow({ id: "wf_stale" })
    const changed = claimedWorkflow({ id: "wf_stale", name: "Changed outside v2" })
    await saveClaim({ registry: staleRegistry, workflow: claimed })
    await expect(
      compileV2Preview({
        args: { planId: version.planId, planVersion: version.planVersion, workflowId: changed.id },
        planStore: plans,
        previewStore: previews,
        pluginVersion: "2.0.0",
        config: { baseUrl: "https://demo/api/v1" },
        api: { getWorkflow: vi.fn(async () => changed) },
        registry: staleRegistry,
      }),
    ).rejects.toMatchObject({ code: "V2_COMPILE_UPDATE_STALE" })
  })

  it("blocks preview persistence when MCP validation fails", async () => {
    const plans = planStore()
    const previews = previewStore()
    const version = await plans.saveInitial({
      plan: createInitialV2Plan({
        prompt:
          "Create a webhook order workflow that maps fields, branches by status, calls an external fulfillment API, retries failures, and responds to the webhook.",
      }),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Initial plan",
    })

    await expect(
      compileV2Preview({
        args: { planId: version.planId, planVersion: version.planVersion },
        planStore: plans,
        previewStore: previews,
        pluginVersion: "2.0.0",
        mcp: {
          validateWorkflowCode: vi.fn().mockResolvedValue({
            valid: false,
            nodeCount: 6,
            warnings: [],
            errors: ["Webhook node path is invalid."],
          }),
        },
      }),
    ).rejects.toMatchObject({
      code: "MCP_WORKFLOW_VALIDATION_FAILED",
      details: { errors: ["Webhook node path is invalid."] },
    })
  })

  it("throws typed errors for missing and invalid plan versions", async () => {
    const plans = planStore()
    const previews = previewStore()
    const missingPlan = {
      planId: "123e4567-e89b-12d3-a456-426614174000",
      planVersion: 1,
    }

    await expect(
      compileV2Preview({
        args: missingPlan,
        planStore: plans,
        previewStore: previews,
        pluginVersion: "2.0.0",
      }),
    ).rejects.toMatchObject({ code: "V2_PLAN_NOT_FOUND", details: missingPlan })

    const invalid = await plans.saveInitial({
      plan: {
        ...createInitialV2Plan({ prompt: "Create a webhook workflow" }),
        outputs: [],
      },
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Invalid plan",
    })

    await expect(
      compileV2Preview({
        args: { planId: invalid.planId, planVersion: invalid.planVersion },
        planStore: plans,
        previewStore: previews,
        pluginVersion: "2.0.0",
      }),
    ).rejects.toMatchObject({ code: "V2_PLAN_NOT_VALID" })
  })
})
