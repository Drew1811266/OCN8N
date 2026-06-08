import { describe, expect, it, vi } from "vitest"
import { N8nBuilderError } from "../src/errors.js"
import { buildWorkflow } from "../src/tools/build-workflow.js"
import type { PluginConfig } from "../src/types.js"
import type { WorkflowDraft, WorkflowPlan } from "../src/workflow-plan.js"
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
  it("validates draft SDK code with MCP before creating the workflow", async () => {
    const api = {
      createWorkflow: vi.fn(async (workflow) => ({ ...workflow, id: "wf_1" })),
    }
    const registry = { upsert: vi.fn(async () => undefined) }
    const draft: WorkflowDraft = {
      plan: simpleWebhookPlan,
      sdkCode: "const workflow = {}",
      nodeSelection: [],
    }
    const planner = { createDraft: vi.fn(async () => draft) }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "n8n-nodes-base.webhook"),
      getNodeTypes: vi.fn(async () => "node schemas"),
      validateWorkflowCode: vi.fn(async () => ({
        valid: true,
        errors: [],
        warnings: [],
        nodeCount: 2,
      })),
    }

    await buildWorkflow({
      args: { prompt: "Build an order webhook" },
      config,
      api,
      registry,
      planner,
      mcp,
      now: () => new Date("2026-06-04T00:00:00.000Z"),
    })

    expect(mcp.validateWorkflowCode).toHaveBeenCalledWith("const workflow = {}")
    expect(api.createWorkflow).toHaveBeenCalled()
    expect(mcp.validateWorkflowCode.mock.invocationCallOrder[0]).toBeLessThan(
      api.createWorkflow.mock.invocationCallOrder[0],
    )
  })

  it("throws and skips create and registry upsert when MCP draft validation fails", async () => {
    const api = {
      createWorkflow: vi.fn(async (workflow) => ({ ...workflow, id: "wf_1" })),
    }
    const registry = { upsert: vi.fn(async () => undefined) }
    const planner = {
      createDraft: vi.fn(async () => ({
        plan: simpleWebhookPlan,
        sdkCode: "const workflow = {}",
        nodeSelection: [],
      })),
    }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "n8n-nodes-base.webhook"),
      getNodeTypes: vi.fn(async () => "node schemas"),
      validateWorkflowCode: vi.fn(async () => ({
        valid: false,
        errors: ["Invalid connection"],
        warnings: [],
      })),
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
      code: "MCP_WORKFLOW_VALIDATION_FAILED",
    } satisfies Partial<N8nBuilderError>)
    expect(api.createWorkflow).not.toHaveBeenCalled()
    expect(registry.upsert).not.toHaveBeenCalled()
  })

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

  it("resolves existing credential references before creating the workflow", async () => {
    const api = {
      createWorkflow: vi.fn(async (workflow) => ({ ...workflow, id: "wf_1" })),
    }
    const registry = { upsert: vi.fn(async () => undefined) }
    const planner = { createPlan: vi.fn(async () => simpleWebhookPlan) }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "n8n-nodes-base.slack"),
      getNodeTypes: vi.fn(async () => "Slack schema"),
    }
    const credentialResolver = {
      resolve: vi.fn(async () => ({
        reference: {
          id: "cred_1",
          name: "OpenCode Slack",
        },
      })),
    }

    const result = await buildWorkflow({
      args: { prompt: "Build an order webhook" },
      config,
      api,
      registry,
      planner,
      mcp,
      credentialResolver,
      now: () => new Date("2026-06-04T00:00:00.000Z"),
    })

    expect(credentialResolver.resolve).toHaveBeenCalledWith({
      nodeName: "Send Slack Alert",
      credentialType: "slackApi",
    })
    expect(api.createWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            name: "Send Slack Alert",
            credentials: {
              slackApi: {
                id: "cred_1",
                name: "OpenCode Slack",
              },
            },
          }),
        ]),
      }),
    )
    expect(result.missingCredentials).toEqual([])
  })

  it("reports credential gaps while still creating a draft workflow", async () => {
    const api = {
      createWorkflow: vi.fn(async (workflow) => ({ ...workflow, id: "wf_1" })),
    }
    const registry = { upsert: vi.fn(async () => undefined) }
    const planner = { createPlan: vi.fn(async () => simpleWebhookPlan) }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "n8n-nodes-base.slack"),
      getNodeTypes: vi.fn(async () => "Slack schema"),
    }
    const credentialResolver = {
      resolve: vi.fn(async () => ({
        gap: {
          nodeName: "Send Slack Alert",
          credentialType: "slackApi",
          credentialName: "OpenCode Slack",
          reason: "Missing environment variables: SLACK_BOT_TOKEN",
        },
      })),
    }

    const result = await buildWorkflow({
      args: { prompt: "Build an order webhook" },
      config,
      api,
      registry,
      planner,
      mcp,
      credentialResolver,
      now: () => new Date("2026-06-04T00:00:00.000Z"),
    })

    expect(api.createWorkflow).toHaveBeenCalled()
    expect(result.missingCredentials).toEqual([
      {
        nodeName: "Send Slack Alert",
        credentialType: "slackApi",
        credentialName: "OpenCode Slack",
        reason: "Missing environment variables: SLACK_BOT_TOKEN",
      },
    ])
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

  it("preserves scoped n8n node ids from MCP search text", async () => {
    const api = {
      createWorkflow: vi.fn(async (workflow) => ({ ...workflow, id: "wf_1" })),
    }
    const registry = { upsert: vi.fn(async () => undefined) }
    const planner = { createPlan: vi.fn(async () => simpleWebhookPlan) }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "Use the LangChain Agent node @n8n/n8n-nodes-langchain.agent."),
      getNodeTypes: vi.fn(async () => "agent docs"),
    }

    await buildWorkflow({
      args: { prompt: "Build an agent workflow" },
      config,
      api,
      registry,
      planner,
      mcp,
      now: () => new Date("2026-06-04T00:00:00.000Z"),
    })

    expect(mcp.getNodeTypes).toHaveBeenCalledWith(["@n8n/n8n-nodes-langchain.agent"])
  })

  it("preserves MCP search JSON node discriminator objects with allowed fields only", async () => {
    const api = {
      createWorkflow: vi.fn(async (workflow) => ({ ...workflow, id: "wf_1" })),
    }
    const registry = { upsert: vi.fn(async () => undefined) }
    const planner = { createPlan: vi.fn(async () => simpleWebhookPlan) }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(
        async () =>
          JSON.stringify([
            {
              nodeId: "n8n-nodes-base.googleSheets",
              version: 4,
              resource: "sheet",
              operation: "append",
              ignored: "not sent",
            },
          ]),
      ),
      getNodeTypes: vi.fn(async () => "google sheets docs"),
    }

    await buildWorkflow({
      args: { prompt: "Append rows to Google Sheets" },
      config,
      api,
      registry,
      planner,
      mcp,
      now: () => new Date("2026-06-04T00:00:00.000Z"),
    })

    expect(mcp.getNodeTypes).toHaveBeenCalledWith([
      {
        nodeId: "n8n-nodes-base.googleSheets",
        version: 4,
        resource: "sheet",
        operation: "append",
      },
    ])
  })

  it("passes MCP suggested-node guidance into planning when prompt matches categories", async () => {
    const api = {
      createWorkflow: vi.fn(async (workflow) => ({ ...workflow, id: "wf_1" })),
    }
    const registry = { upsert: vi.fn(async () => undefined) }
    const planner = { createPlan: vi.fn(async () => simpleWebhookPlan) }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "n8n-nodes-base.slack"),
      getNodeTypes: vi.fn(async () => "Slack schema"),
      getSuggestedNodes: vi.fn(async () => "Use Schedule Trigger for recurring execution."),
    }

    await buildWorkflow({
      args: { prompt: "Every morning fetch an API and notify Slack" },
      config,
      api,
      registry,
      planner,
      mcp,
      now: () => new Date("2026-06-04T00:00:00.000Z"),
    })

    expect(mcp.getSuggestedNodes).toHaveBeenCalledWith(["scheduling", "data_extraction", "notification"])
    expect(planner.createPlan).toHaveBeenCalledWith({
      prompt: "Every morning fetch an API and notify Slack",
      sdkReference: "SDK rules",
      nodeDocumentation: [{ nodeType: "selected", documentation: "Slack schema" }],
      suggestedNodes: "Use Schedule Trigger for recurring execution.",
    })
  })

  it("skips node type lookup and plans without node documentation when no node ids match", async () => {
    const api = {
      createWorkflow: vi.fn(async (workflow) => ({ ...workflow, id: "wf_1" })),
    }
    const registry = { upsert: vi.fn(async () => undefined) }
    const planner = { createPlan: vi.fn(async () => simpleWebhookPlan) }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "No node identifiers in this search result."),
      getNodeTypes: vi.fn(async () => "unused docs"),
    }

    await buildWorkflow({
      args: { prompt: "Build an order webhook" },
      config,
      api,
      registry,
      planner,
      mcp,
      now: () => new Date("2026-06-04T00:00:00.000Z"),
    })

    expect(mcp.getNodeTypes).not.toHaveBeenCalled()
    expect(planner.createPlan).toHaveBeenCalledWith({
      prompt: "Build an order webhook",
      sdkReference: "SDK rules",
      nodeDocumentation: [],
    })
  })
})
