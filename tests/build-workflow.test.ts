import { describe, expect, it, vi } from "vitest"
import { N8nBuilderError } from "../src/errors.js"
import { buildWorkflow } from "../src/tools/build-workflow.js"
import type { PluginConfig } from "../src/types.js"
import type { WorkflowPlan } from "../src/workflow-plan.js"
import { simpleWebhookPlan } from "./fixtures/workflows.js"

const config: PluginConfig = {
  baseUrl: "https://demo/api/v1",
  apiKey: "key",
  mcpUrl: "https://demo/mcp",
  workspaceDir: "/tmp/project",
  registryPath: "/tmp/project/.opencode/n8n-workflows.json",
  previewDir: "/tmp/project/.opencode/n8n-update-previews",
  credentialEnv: {},
  pluginVersion: "0.1.0",
}

describe("buildWorkflow", () => {
  it("creates an inactive managed workflow and records it", async () => {
    const api = {
      createWorkflow: vi.fn(async (workflow) => ({ ...workflow, id: "wf_1" })),
    }
    const registry = { upsert: vi.fn(async () => undefined) }
    const planner = { createPlan: vi.fn(async () => simpleWebhookPlan) }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(
        async () => "Webhook Trigger node: n8n-nodes-base.webhook\nSlack nodeType=n8n-nodes-base.slack",
      ),
      getNodeTypes: vi.fn(async () => "node schemas"),
    }

    const result = await buildWorkflow({
      args: { prompt: "Build an order webhook", name: "Orders" },
      config,
      api,
      registry,
      planner,
      mcp,
      now: () => new Date("2026-06-04T00:00:00.000Z"),
    })

    expect(mcp.getSdkReference).toHaveBeenCalledWith("all")
    expect(mcp.searchNodes).toHaveBeenCalledWith("Build an order webhook")
    expect(mcp.getNodeTypes).toHaveBeenCalledWith([
      "n8n-nodes-base.webhook",
      "n8n-nodes-base.slack",
    ])
    expect(planner.createPlan).toHaveBeenCalledWith({
      prompt: "Build an order webhook",
      sdkReference: "SDK rules",
      nodeDocumentation: [{ nodeType: "selected", documentation: "node schemas" }],
    })
    expect(api.createWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Orders",
        active: false,
        meta: {
          managedBy: "opencode-n8n-builder",
          managedByVersion: "0.1.0",
          createdAt: "2026-06-04T00:00:00.000Z",
        },
      }),
    )
    expect(registry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "wf_1",
        name: "Orders",
        url: "https://demo/workflow/wf_1",
        baseUrl: "https://demo/api/v1",
        managedBy: "opencode-n8n-builder",
        managedByVersion: "0.1.0",
        lastUpdatedAt: "2026-06-04T00:00:00.000Z",
      }),
    )
    expect(result).toEqual({
      workflowId: "wf_1",
      name: "Orders",
      url: "https://demo/workflow/wf_1",
      nodeCount: 2,
      summary: "Receive order webhooks and alert Slack.",
      missingCredentials: [],
      warnings: [],
    })
  })

  it("throws and does not create a workflow when validation fails", async () => {
    const invalidPlan: WorkflowPlan = {
      ...simpleWebhookPlan,
      nodes: simpleWebhookPlan.nodes.map((node) => ({ ...node, name: "Duplicate" })),
    }
    const api = {
      createWorkflow: vi.fn(async (workflow) => ({ ...workflow, id: "wf_1" })),
    }
    const registry = { upsert: vi.fn(async () => undefined) }
    const planner = { createPlan: vi.fn(async () => invalidPlan) }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "n8n-nodes-base.webhook"),
      getNodeTypes: vi.fn(async () => "node schemas"),
    }

    await expect(
      buildWorkflow({
        args: { prompt: "Build an order webhook" },
        config,
        api,
        registry,
        planner,
        mcp,
        now: () => new Date("2026-06-04T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_CREATE_INVALID",
      details: {
        issues: [
          expect.objectContaining({
            code: "DUPLICATE_NODE_NAME",
            nodeName: "Duplicate",
          }),
        ],
      },
    } satisfies Partial<N8nBuilderError>)
    expect(api.createWorkflow).not.toHaveBeenCalled()
    expect(registry.upsert).not.toHaveBeenCalled()
  })
})
