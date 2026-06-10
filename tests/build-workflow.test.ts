import { describe, expect, it, vi } from "vitest"
import { N8nBuilderError } from "../src/errors.js"
import { buildWorkflow } from "../src/tools/build-workflow.js"
import type { PluginConfig } from "../src/types.js"
import { workflowPlanSchema, type WorkflowDraft, type WorkflowPlan } from "../src/workflow-plan.js"
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
      validationRequests: [] as string[],
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "n8n-nodes-base.webhook"),
      getNodeTypes: vi.fn(async () => "node schemas"),
      validateWorkflowCode: vi.fn(async function (this: { validationRequests: string[] }, code: string) {
        this.validationRequests.push(code)
        return {
          valid: true,
          errors: [],
          warnings: [],
          nodeCount: 2,
        }
      }),
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

    expect(mcp.validateWorkflowCode).toHaveBeenCalledWith(expect.stringContaining("new Workflow"))
    expect(mcp.validationRequests).toHaveLength(1)
    expect(mcp.validationRequests[0]).toContain('"name": "Order webhook to Slack"')
    expect(mcp.validationRequests[0]).toContain('"type": "n8n-nodes-base.webhook"')
    expect(mcp.validationRequests[0]).toContain('"type": "n8n-nodes-base.slack"')
    expect(mcp.validationRequests[0]).toContain('"Send Slack Alert"')
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
      compatibilityGuidance: expect.stringContaining("n8n-nodes-base.webhook: tier_1_verified"),
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
      credentialActions: [],
      warnings: [],
    })
  })

  it("passes node compatibility guidance to the planner", async () => {
    const api = {
      createWorkflow: vi.fn(async (workflow) => ({ ...workflow, id: "wf_1" })),
    }
    const registry = { upsert: vi.fn(async () => undefined) }
    const planner = { createPlan: vi.fn(async () => simpleWebhookPlan) }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "n8n-nodes-base.webhook\nn8n-nodes-base.slack"),
      getNodeTypes: vi.fn(async () => "node schemas"),
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

    expect(planner.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        compatibilityGuidance: expect.stringContaining("n8n-nodes-base.webhook: tier_1_verified"),
      }),
    )
    expect(planner.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        compatibilityGuidance: expect.stringContaining("n8n-nodes-base.slack: tier_2_modeled"),
      }),
    )
  })

  it("returns compatibility warnings for dynamic node types", async () => {
    const dynamicPlan: WorkflowPlan = workflowPlanSchema.parse({
      name: "Dynamic workflow",
      summary: "Uses an unverified node.",
      nodes: [
        {
          key: "manual",
          name: "Manual Trigger",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
        {
          key: "dynamic",
          name: "Dynamic Node",
          type: "n8n-nodes-base.unknownService",
          typeVersion: 1,
          position: [300, 0],
          parameters: {},
        },
      ],
      connections: [{ from: "manual", to: "dynamic" }],
    })
    const api = {
      createWorkflow: vi.fn(async (workflow) => ({ ...workflow, id: "wf_1" })),
    }
    const registry = { upsert: vi.fn(async () => undefined) }
    const planner = { createPlan: vi.fn(async () => dynamicPlan) }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "n8n-nodes-base.unknownService"),
      getNodeTypes: vi.fn(async () => "node schemas"),
    }

    const result = await buildWorkflow({
      args: { prompt: "Build with a special service" },
      config,
      api,
      registry,
      planner,
      mcp,
      now: () => new Date("2026-06-04T00:00:00.000Z"),
    })

    expect(result.warnings).toEqual([
      {
        code: "NODE_COMPATIBILITY_DYNAMIC",
        message:
          "Node Dynamic Node uses n8n-nodes-base.unknownService, which was discovered dynamically and has no committed compatibility scenario.",
        nodeName: "Dynamic Node",
      },
    ])
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
        action: {
          nodeName: "Send Slack Alert",
          credentialType: "slackApi",
          credentialName: "OpenCode Slack",
          action: "reuse_existing" as const,
          status: "resolved" as const,
          message: "Reusing existing n8n credential OpenCode Slack for Send Slack Alert.",
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
    expect(result.credentialActions).toEqual([
      {
        nodeName: "Send Slack Alert",
        credentialType: "slackApi",
        credentialName: "OpenCode Slack",
        action: "reuse_existing",
        status: "resolved",
        message: "Reusing existing n8n credential OpenCode Slack for Send Slack Alert.",
      },
    ])
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
        action: {
          nodeName: "Send Slack Alert",
          credentialType: "slackApi",
          credentialName: "OpenCode Slack",
          action: "set_missing_env" as const,
          status: "required" as const,
          message: "Set missing environment variables for OpenCode Slack: SLACK_BOT_TOKEN.",
          requiredEnv: ["SLACK_BOT_TOKEN"],
          manualSetupUrl: "https://demo/credentials",
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
    expect(result.credentialActions).toEqual([
      {
        nodeName: "Send Slack Alert",
        credentialType: "slackApi",
        credentialName: "OpenCode Slack",
        action: "set_missing_env",
        status: "required",
        message: "Set missing environment variables for OpenCode Slack: SLACK_BOT_TOKEN.",
        requiredEnv: ["SLACK_BOT_TOKEN"],
        manualSetupUrl: "https://demo/credentials",
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
      compatibilityGuidance: expect.stringContaining("n8n-nodes-base.slack: tier_2_modeled"),
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
      compatibilityGuidance: expect.stringContaining("No specific node types were extracted"),
    })
  })
})
