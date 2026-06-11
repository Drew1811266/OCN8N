import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reverseV2WorkflowPlan } from "../src/tools/v2-reverse-plan.js"
import type { N8nWorkflow } from "../src/validator.js"
import { V2PlanStore } from "../src/v2/plan-store.js"
import { V2WorkflowRegistry } from "../src/v2/registry.js"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ocn8n-v2-reverse-plan-tool-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function planStore(): V2PlanStore {
  return new V2PlanStore(path.join(dir, ".opencode", "n8n-v2", "plans"))
}

function registry(): V2WorkflowRegistry {
  return new V2WorkflowRegistry(path.join(dir, ".opencode", "n8n-v2", "registry", "workflows.json"))
}

function workflow(overrides: Partial<N8nWorkflow & { id: string }> = {}): N8nWorkflow & { id: string } {
  return {
    id: "wf_active",
    name: "Production Orders",
    active: true,
    nodes: [
      {
        name: "Webhook",
        type: "n8n-nodes-base.webhook",
        typeVersion: 2,
        position: [0, 0],
        parameters: {},
      },
      {
        name: "Fulfillment API",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4,
        position: [220, 0],
        parameters: { url: "https://api.example.com/orders", token: "secret-token" },
        credentials: { httpHeaderAuth: { id: "cred_1", name: "Orders API" } },
      },
      {
        name: "Respond",
        type: "n8n-nodes-base.respondToWebhook",
        typeVersion: 1,
        position: [440, 0],
        parameters: {},
      },
    ],
    connections: {
      Webhook: { main: [[{ node: "Fulfillment API", type: "main", index: 0 }]] },
      "Fulfillment API": { main: [[{ node: "Respond", type: "main", index: 0 }]] },
    },
    settings: {},
    tags: [],
    ...overrides,
  }
}

const config = {
  baseUrl: "https://demo/api/v1",
  pluginVersion: "2.0.0",
}

describe("reverseV2WorkflowPlan", () => {
  it("requires an existing v2 registry claim before fetching the workflow", async () => {
    const api = { getWorkflow: vi.fn(async () => workflow()) }

    await expect(
      reverseV2WorkflowPlan({
        args: { workflowId: "wf_active" },
        config,
        api,
        registry: registry(),
        planStore: planStore(),
      }),
    ).rejects.toMatchObject({ code: "V2_WORKFLOW_NOT_CLAIMED" })
    expect(api.getWorkflow).not.toHaveBeenCalled()
  })

  it("reverse plans an active read-only claimed workflow and updates local artifacts only", async () => {
    const v2Registry = registry()
    const plans = planStore()
    await v2Registry.upsert({
      workflowId: "wf_active",
      name: "Production Orders",
      url: "https://demo/workflow/wf_active",
      baseUrl: "https://demo/api/v1",
      claimMode: "read_only",
      activeAtClaim: true,
      managedBy: "opencode-n8n-builder-v2",
      managedByVersion: "2.0.0",
      latestWorkflowHash: "old-hash",
      lastUpdatedAt: "2026-06-11T03:00:00.000Z",
    })
    const api = { getWorkflow: vi.fn(async () => workflow()) }

    const result = await reverseV2WorkflowPlan({
      args: { workflowId: "wf_active" },
      config,
      api,
      registry: v2Registry,
      planStore: plans,
      now: () => new Date("2026-06-11T04:00:00.000Z"),
    })

    expect(api.getWorkflow).toHaveBeenCalledWith("wf_active")
    expect(result).toEqual(
      expect.objectContaining({
        workflowId: "wf_active",
        planVersion: 1,
        source: "reverse",
        confidence: "low",
        riskLevel: "medium",
        mappedStepCount: 3,
        unmappedNodes: [],
      }),
    )
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "V2_REVERSE_ACTIVE_READ_ONLY" }),
        expect.objectContaining({ code: "V2_REVERSE_INFERRED_EXTERNAL_CONTRACT" }),
      ]),
    )

    const persisted = await plans.get(result.planId, result.planVersion)
    expect(persisted).toEqual(
      expect.objectContaining({
        planId: result.planId,
        planVersion: 1,
        source: "reverse",
        summary: "Reverse planned workflow Production Orders.",
      }),
    )
    expect(JSON.stringify(persisted?.plan)).not.toContain("secret-token")
    await expect(v2Registry.get("wf_active")).resolves.toEqual(
      expect.objectContaining({
        workflowId: "wf_active",
        claimMode: "read_only",
        activeAtClaim: true,
        latestPlanId: result.planId,
        latestPlanVersion: 1,
        latestWorkflowHash: expect.not.stringMatching(/^old-hash$/),
        lastUpdatedAt: "2026-06-11T04:00:00.000Z",
      }),
    )
  })

  it("blocks registry base URL mismatches before fetching the workflow", async () => {
    const v2Registry = registry()
    await v2Registry.upsert({
      workflowId: "wf_active",
      name: "Production Orders",
      url: "https://other/workflow/wf_active",
      baseUrl: "https://other/api/v1",
      claimMode: "read_only",
      activeAtClaim: true,
      managedBy: "opencode-n8n-builder-v2",
      managedByVersion: "2.0.0",
      latestWorkflowHash: "old-hash",
      lastUpdatedAt: "2026-06-11T03:00:00.000Z",
    })
    const api = { getWorkflow: vi.fn(async () => workflow()) }

    await expect(
      reverseV2WorkflowPlan({
        args: { workflowId: "wf_active" },
        config,
        api,
        registry: v2Registry,
        planStore: planStore(),
      }),
    ).rejects.toMatchObject({ code: "V2_REGISTRY_BASE_URL_MISMATCH" })
    expect(api.getWorkflow).not.toHaveBeenCalled()
  })
})
