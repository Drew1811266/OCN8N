import { describe, expect, it, vi } from "vitest"
import { N8nBuilderError } from "../src/errors.js"
import { stableHash } from "../src/hash.js"
import type { UpdatePreview } from "../src/preview-store.js"
import type { WorkflowRegistryRecord } from "../src/registry.js"
import type { PluginConfig } from "../src/types.js"
import { updateWorkflow } from "../src/tools/update-workflow.js"
import type { N8nWorkflow } from "../src/validator.js"
import { compileWorkflowPlan } from "../src/workflow-compiler.js"
import { workflowPlanSchema, type WorkflowPlan } from "../src/workflow-plan.js"
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

const now = new Date("2026-06-04T00:00:00.000Z")

const currentWorkflow: N8nWorkflow & { id: string } = {
  id: "wf_1",
  name: "Orders",
  active: false,
  nodes: [
    {
      name: "Start",
      type: "n8n-nodes-base.manualTrigger",
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    },
  ],
  connections: {},
  settings: {},
  tags: [{ name: "opencode-n8n-builder" }],
}

const proposedWorkflow = compileWorkflowPlan({
  plan: simpleWebhookPlan,
  marker: {
    managedBy: "opencode-n8n-builder",
    managedByVersion: "0.1.0",
    createdAt: now.toISOString(),
  },
})

const registryRecord: WorkflowRegistryRecord = {
  workflowId: "wf_1",
  name: "Orders",
  url: "https://demo/workflow/wf_1",
  baseUrl: "https://demo/api/v1",
  managedBy: "opencode-n8n-builder",
  managedByVersion: "0.1.0",
  lastPlanHash: "abc",
  lastUpdatedAt: now.toISOString(),
}

const otherBaseUrlRegistryRecord: WorkflowRegistryRecord = {
  ...registryRecord,
  url: "https://other-demo/workflow/wf_1",
  baseUrl: "https://other-demo/api/v1",
}

describe("updateWorkflow", () => {
  it("validates patch draft SDK code with MCP before saving the preview", async () => {
    const api = {
      getWorkflow: vi.fn(async () => currentWorkflow),
      updateWorkflow: vi.fn(),
    }
    const planner = {
      createPatchDraft: vi.fn(async () => ({
        summary: "Add Slack notification",
        changes: ["Add Slack node"],
        replacementPlan: simpleWebhookPlan,
        sdkCode: "const workflow = {}",
        nodeSelection: [],
      })),
    }
    const mcp = {
      validationRequests: [] as string[],
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "Slack node: n8n-nodes-base.slack"),
      getNodeTypes: vi.fn(async () => "Slack schema"),
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
    const previewStore = {
      save: vi.fn(async (preview) => ({
        previewId: "preview_1",
        ...preview,
      })),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }

    await updateWorkflow({
      args: { workflowId: "wf_1", mode: "preview", prompt: "Add Slack" },
      config,
      api,
      planner,
      mcp,
      previewStore,
      registry,
      now: () => now,
    })

    expect(mcp.validateWorkflowCode).toHaveBeenCalledWith(expect.stringContaining("new Workflow"))
    expect(mcp.validationRequests).toHaveLength(1)
    expect(mcp.validationRequests[0]).toContain('"name": "Order webhook to Slack"')
    expect(mcp.validationRequests[0]).toContain('"type": "n8n-nodes-base.webhook"')
    expect(mcp.validationRequests[0]).toContain('"type": "n8n-nodes-base.slack"')
    expect(mcp.validationRequests[0]).toContain('"Send Slack Alert"')
    expect(previewStore.save).toHaveBeenCalled()
    expect(mcp.validateWorkflowCode.mock.invocationCallOrder[0]).toBeLessThan(
      previewStore.save.mock.invocationCallOrder[0],
    )
  })

  it("throws and skips preview save and n8n update when MCP patch draft validation fails", async () => {
    const api = {
      getWorkflow: vi.fn(async () => currentWorkflow),
      updateWorkflow: vi.fn(),
    }
    const planner = {
      createPatchDraft: vi.fn(async () => ({
        summary: "Add Slack notification",
        changes: ["Add Slack node"],
        replacementPlan: simpleWebhookPlan,
        sdkCode: "const workflow = {}",
        nodeSelection: [],
      })),
    }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "Slack node: n8n-nodes-base.slack"),
      getNodeTypes: vi.fn(async () => "Slack schema"),
      validateWorkflowCode: vi.fn(async () => ({
        valid: false,
        errors: ["Invalid connection"],
        warnings: [],
      })),
    }
    const previewStore = {
      save: vi.fn(async (preview) => ({
        previewId: "preview_1",
        ...preview,
      })),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }

    await expect(
      updateWorkflow({
        args: { workflowId: "wf_1", mode: "preview", prompt: "Add Slack" },
        config,
        api,
        planner,
        mcp,
        previewStore,
        registry,
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: "MCP_WORKFLOW_VALIDATION_FAILED",
    } satisfies Partial<N8nBuilderError>)
    expect(previewStore.save).not.toHaveBeenCalled()
    expect(api.updateWorkflow).not.toHaveBeenCalled()
  })

  it("previews an update without calling the n8n update API", async () => {
    const api = {
      getWorkflow: vi.fn(async () => currentWorkflow),
      updateWorkflow: vi.fn(),
    }
    const planner = {
      createPatchPlan: vi.fn(async () => ({
        summary: "Add Slack notification",
        changes: ["Add Slack node"],
        replacementPlan: simpleWebhookPlan,
      })),
    }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "Slack node: n8n-nodes-base.slack"),
      getNodeTypes: vi.fn(async () => "Slack schema"),
    }
    const previewStore = {
      save: vi.fn(async (preview) => ({
        previewId: "preview_1",
        ...preview,
      })),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }

    const result = await updateWorkflow({
      args: { workflowId: "wf_1", mode: "preview", prompt: "Add Slack" },
      config,
      api,
      planner,
      mcp,
      previewStore,
      registry,
      now: () => now,
    })

    expect(api.getWorkflow).toHaveBeenCalledWith("wf_1")
    expect(registry.get).toHaveBeenCalledWith("wf_1")
    expect(mcp.getSdkReference).toHaveBeenCalledWith("all")
    expect(mcp.searchNodes).toHaveBeenCalledWith("Add Slack")
    expect(mcp.getNodeTypes).toHaveBeenCalledWith(["n8n-nodes-base.slack"])
    expect(planner.createPatchPlan).toHaveBeenCalledWith({
      prompt: "Add Slack",
      currentWorkflowJson: JSON.stringify(currentWorkflow, null, 2),
      sdkReference: "SDK rules",
      nodeDocumentation: [{ nodeType: "selected", documentation: "Slack schema" }],
      compatibilityGuidance: expect.stringContaining("n8n-nodes-base.slack: tier_2_modeled"),
    })
    expect(previewStore.save).toHaveBeenCalledWith({
      workflowId: "wf_1",
      baseWorkflowHash: stableHash(currentWorkflow),
      proposedWorkflowHash: stableHash(proposedWorkflow),
      summary: "Add Slack notification",
      changes: ["Add Slack node"],
      proposedWorkflow,
      createdAt: "2026-06-04T00:00:00.000Z",
      expiresAt: "2026-06-04T00:30:00.000Z",
    })
    expect(api.updateWorkflow).not.toHaveBeenCalled()
    expect(result).toEqual({
      workflowId: "wf_1",
      name: "Order webhook to Slack",
      url: "https://demo/workflow/wf_1",
      mode: "preview",
      previewId: "preview_1",
      summary: "Add Slack notification",
      changes: ["Add Slack node"],
      missingCredentials: [],
      warnings: [],
    })
  })

  it("passes node compatibility guidance to the patch planner", async () => {
    const api = {
      getWorkflow: vi.fn(async () => currentWorkflow),
      updateWorkflow: vi.fn(),
    }
    const planner = {
      createPatchPlan: vi.fn(async () => ({
        summary: "Add Slack notification",
        changes: ["Add Slack node"],
        replacementPlan: simpleWebhookPlan,
      })),
    }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "Slack node: n8n-nodes-base.slack"),
      getNodeTypes: vi.fn(async () => "Slack schema"),
    }
    const previewStore = {
      save: vi.fn(async (preview) => ({
        previewId: "preview_1",
        ...preview,
      })),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }

    await updateWorkflow({
      args: { workflowId: "wf_1", mode: "preview", prompt: "Add Slack" },
      config,
      api,
      planner,
      mcp,
      previewStore,
      registry,
      now: () => now,
    })

    expect(planner.createPatchPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        compatibilityGuidance: expect.stringContaining("n8n-nodes-base.slack: tier_2_modeled"),
      }),
    )
  })

  it("returns compatibility warnings for dynamic node types in preview", async () => {
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
      getWorkflow: vi.fn(async () => currentWorkflow),
      updateWorkflow: vi.fn(),
    }
    const planner = {
      createPatchPlan: vi.fn(async () => ({
        summary: "Add dynamic node",
        changes: ["Add Dynamic Node"],
        replacementPlan: dynamicPlan,
      })),
    }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "n8n-nodes-base.unknownService"),
      getNodeTypes: vi.fn(async () => "Dynamic schema"),
    }
    const previewStore = {
      save: vi.fn(async (preview) => ({
        previewId: "preview_1",
        ...preview,
      })),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }

    const result = await updateWorkflow({
      args: { workflowId: "wf_1", mode: "preview", prompt: "Add dynamic node" },
      config,
      api,
      planner,
      mcp,
      previewStore,
      registry,
      now: () => now,
    })

    expect(result.warnings).toEqual([
      {
        code: "NODE_COMPATIBILITY_DYNAMIC",
        message:
          "Node Dynamic Node uses n8n-nodes-base.unknownService, which was discovered dynamically and has no committed compatibility scenario.",
        nodeName: "Dynamic Node",
      },
    ])
    expect(previewStore.save).toHaveBeenCalled()
  })

  it("blocks preview updates for marker-tagged workflows missing from the registry before planning", async () => {
    const api = {
      getWorkflow: vi.fn(async () => currentWorkflow),
      updateWorkflow: vi.fn(),
    }
    const planner = {
      createPatchPlan: vi.fn(async () => ({
        summary: "Add Slack notification",
        changes: ["Add Slack node"],
        replacementPlan: simpleWebhookPlan,
      })),
    }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "Slack node: n8n-nodes-base.slack"),
      getNodeTypes: vi.fn(async () => "Slack schema"),
    }
    const previewStore = { save: vi.fn() }
    const registry = {
      get: vi.fn(async () => undefined),
      upsert: vi.fn(async () => undefined),
    }

    await expect(
      updateWorkflow({
        args: { workflowId: "wf_1", mode: "preview", prompt: "Add Slack" },
        config,
        api,
        planner,
        mcp,
        previewStore,
        registry,
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_UPDATE_BLOCKED",
      details: {
        workflowId: "wf_1",
        issues: [
          expect.objectContaining({
            code: "WORKFLOW_NOT_IN_REGISTRY",
          }),
        ],
      },
    } satisfies Partial<N8nBuilderError>)
    expect(registry.get).toHaveBeenCalledWith("wf_1")
    expect(mcp.getSdkReference).not.toHaveBeenCalled()
    expect(mcp.searchNodes).not.toHaveBeenCalled()
    expect(mcp.getNodeTypes).not.toHaveBeenCalled()
    expect(planner.createPatchPlan).not.toHaveBeenCalled()
    expect(previewStore.save).not.toHaveBeenCalled()
    expect(api.updateWorkflow).not.toHaveBeenCalled()
  })

  it("blocks preview updates for registry records from a different n8n base URL before planning", async () => {
    const api = {
      getWorkflow: vi.fn(async () => currentWorkflow),
      updateWorkflow: vi.fn(),
    }
    const planner = {
      createPatchPlan: vi.fn(async () => ({
        summary: "Add Slack notification",
        changes: ["Add Slack node"],
        replacementPlan: simpleWebhookPlan,
      })),
    }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "Slack node: n8n-nodes-base.slack"),
      getNodeTypes: vi.fn(async () => "Slack schema"),
    }
    const previewStore = { save: vi.fn() }
    const registry = {
      get: vi.fn(async () => otherBaseUrlRegistryRecord),
      upsert: vi.fn(async () => undefined),
    }

    await expect(
      updateWorkflow({
        args: { workflowId: "wf_1", mode: "preview", prompt: "Add Slack" },
        config,
        api,
        planner,
        mcp,
        previewStore,
        registry,
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_UPDATE_BLOCKED",
      details: {
        workflowId: "wf_1",
        issues: [
          expect.objectContaining({
            code: "WORKFLOW_REGISTRY_BASE_URL_MISMATCH",
          }),
        ],
      },
    } satisfies Partial<N8nBuilderError>)
    expect(registry.get).toHaveBeenCalledWith("wf_1")
    expect(mcp.getSdkReference).not.toHaveBeenCalled()
    expect(mcp.searchNodes).not.toHaveBeenCalled()
    expect(mcp.getNodeTypes).not.toHaveBeenCalled()
    expect(planner.createPatchPlan).not.toHaveBeenCalled()
    expect(previewStore.save).not.toHaveBeenCalled()
    expect(api.updateWorkflow).not.toHaveBeenCalled()
  })

  it("resolves credential references in preview workflows before saving the preview", async () => {
    const resolvedProposedWorkflow: N8nWorkflow = {
      ...proposedWorkflow,
      nodes: proposedWorkflow.nodes.map((node) =>
        node.name === "Send Slack Alert"
          ? {
              ...node,
              credentials: {
                slackApi: {
                  id: "cred_1",
                  name: "OpenCode Slack",
                },
              },
            }
          : node,
      ),
    }
    const api = {
      getWorkflow: vi.fn(async () => currentWorkflow),
      updateWorkflow: vi.fn(),
    }
    const planner = {
      createPatchPlan: vi.fn(async () => ({
        summary: "Add Slack notification",
        changes: ["Add Slack node"],
        replacementPlan: simpleWebhookPlan,
      })),
    }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "Slack node: n8n-nodes-base.slack"),
      getNodeTypes: vi.fn(async () => "Slack schema"),
    }
    const previewStore = {
      save: vi.fn(async (preview) => ({
        previewId: "preview_1",
        ...preview,
      })),
    }
    const credentialResolver = {
      resolve: vi.fn(async () => ({
        reference: {
          id: "cred_1",
          name: "OpenCode Slack",
        },
      })),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }

    const result = await updateWorkflow({
      args: { workflowId: "wf_1", mode: "preview", prompt: "Add Slack" },
      config,
      api,
      planner,
      mcp,
      previewStore,
      registry,
      credentialResolver,
      now: () => now,
    })

    expect(credentialResolver.resolve).toHaveBeenCalledWith({
      nodeName: "Send Slack Alert",
      credentialType: "slackApi",
    })
    expect(previewStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        proposedWorkflowHash: stableHash(resolvedProposedWorkflow),
        proposedWorkflow: resolvedProposedWorkflow,
      }),
    )
    expect(result.missingCredentials).toEqual([])
  })

  it("passes MCP suggested-node guidance into preview planning when prompt matches categories", async () => {
    const api = {
      getWorkflow: vi.fn(async () => currentWorkflow),
      updateWorkflow: vi.fn(),
    }
    const planner = {
      createPatchPlan: vi.fn(async () => ({
        summary: "Add Slack notification",
        changes: ["Add Slack node"],
        replacementPlan: simpleWebhookPlan,
      })),
    }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "Slack node: n8n-nodes-base.slack"),
      getNodeTypes: vi.fn(async () => "Slack schema"),
      getSuggestedNodes: vi.fn(async () => "Use Schedule Trigger for recurring execution."),
    }
    const previewStore = {
      save: vi.fn(async (preview) => ({
        previewId: "preview_1",
        ...preview,
      })),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }

    await updateWorkflow({
      args: { workflowId: "wf_1", mode: "preview", prompt: "每天 fetch API then 通知 Slack" },
      config,
      api,
      planner,
      mcp,
      previewStore,
      registry,
      now: () => now,
    })

    expect(mcp.getSuggestedNodes).toHaveBeenCalledWith(["scheduling", "data_extraction", "notification"])
    expect(planner.createPatchPlan).toHaveBeenCalledWith({
      prompt: "每天 fetch API then 通知 Slack",
      currentWorkflowJson: JSON.stringify(currentWorkflow, null, 2),
      sdkReference: "SDK rules",
      nodeDocumentation: [{ nodeType: "selected", documentation: "Slack schema" }],
      suggestedNodes: "Use Schedule Trigger for recurring execution.",
      compatibilityGuidance: expect.stringContaining("n8n-nodes-base.slack: tier_2_modeled"),
    })
  })

  it("applies a fresh preview and updates n8n and the registry", async () => {
    const api = {
      getWorkflow: vi.fn(async () => currentWorkflow),
      updateWorkflow: vi.fn(async () => ({ ...proposedWorkflow, id: "wf_1" })),
    }
    const previewStore = {
      get: vi.fn(async () => ({
        previewId: "preview_1",
        workflowId: "wf_1",
        baseWorkflowHash: stableHash(currentWorkflow),
        proposedWorkflowHash: stableHash(proposedWorkflow),
        summary: "Apply Slack",
        changes: ["Add Slack node"],
        proposedWorkflow,
        createdAt: "2026-06-04T00:00:00.000Z",
        expiresAt: "2026-06-04T00:30:00.000Z",
      })),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }

    const result = await updateWorkflow({
      args: { workflowId: "wf_1", mode: "apply", previewId: "preview_1" },
      config,
      api,
      previewStore,
      registry,
      now: () => new Date("2026-06-04T00:10:00.000Z"),
    })

    expect(previewStore.get).toHaveBeenCalledWith("preview_1", new Date("2026-06-04T00:10:00.000Z"))
    expect(api.getWorkflow).toHaveBeenCalledWith("wf_1")
    expect(registry.get).toHaveBeenCalledWith("wf_1")
    expect(api.updateWorkflow).toHaveBeenCalledWith("wf_1", proposedWorkflow)
    expect(registry.upsert).toHaveBeenCalledWith({
      workflowId: "wf_1",
      name: "Order webhook to Slack",
      url: "https://demo/workflow/wf_1",
      baseUrl: "https://demo/api/v1",
      managedBy: "opencode-n8n-builder",
      managedByVersion: "0.1.0",
      lastPlanHash: stableHash(proposedWorkflow),
      lastUpdatedAt: "2026-06-04T00:10:00.000Z",
    })
    expect(result).toEqual({
      workflowId: "wf_1",
      name: "Order webhook to Slack",
      url: "https://demo/workflow/wf_1",
      mode: "apply",
      summary: "Apply Slack",
      changes: ["Add Slack node"],
      missingCredentials: [],
      warnings: [],
    })
  })

  it("blocks apply updates when a valid preview targets a workflow missing from the registry", async () => {
    const api = {
      getWorkflow: vi.fn(async () => currentWorkflow),
      updateWorkflow: vi.fn(async () => ({ ...proposedWorkflow, id: "wf_1" })),
    }
    const previewStore = {
      get: vi.fn(async () => ({
        previewId: "preview_1",
        workflowId: "wf_1",
        baseWorkflowHash: stableHash(currentWorkflow),
        proposedWorkflowHash: stableHash(proposedWorkflow),
        summary: "Apply Slack",
        changes: ["Add Slack node"],
        proposedWorkflow,
        createdAt: "2026-06-04T00:00:00.000Z",
        expiresAt: "2026-06-04T00:30:00.000Z",
      })),
    }
    const registry = {
      get: vi.fn(async () => undefined),
      upsert: vi.fn(async () => undefined),
    }

    await expect(
      updateWorkflow({
        args: { workflowId: "wf_1", mode: "apply", previewId: "preview_1" },
        config,
        api,
        previewStore,
        registry,
        now: () => new Date("2026-06-04T00:10:00.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_UPDATE_BLOCKED",
      details: {
        workflowId: "wf_1",
        issues: [
          expect.objectContaining({
            code: "WORKFLOW_NOT_IN_REGISTRY",
          }),
        ],
      },
    } satisfies Partial<N8nBuilderError>)
    expect(registry.get).toHaveBeenCalledWith("wf_1")
    expect(api.updateWorkflow).not.toHaveBeenCalled()
    expect(registry.upsert).not.toHaveBeenCalled()
  })

  it("blocks apply updates when a valid preview targets a registry record from a different n8n base URL", async () => {
    const api = {
      getWorkflow: vi.fn(async () => currentWorkflow),
      updateWorkflow: vi.fn(async () => ({ ...proposedWorkflow, id: "wf_1" })),
    }
    const previewStore = {
      get: vi.fn(async () => ({
        previewId: "preview_1",
        workflowId: "wf_1",
        baseWorkflowHash: stableHash(currentWorkflow),
        proposedWorkflowHash: stableHash(proposedWorkflow),
        summary: "Apply Slack",
        changes: ["Add Slack node"],
        proposedWorkflow,
        createdAt: "2026-06-04T00:00:00.000Z",
        expiresAt: "2026-06-04T00:30:00.000Z",
      })),
    }
    const registry = {
      get: vi.fn(async () => otherBaseUrlRegistryRecord),
      upsert: vi.fn(async () => undefined),
    }

    await expect(
      updateWorkflow({
        args: { workflowId: "wf_1", mode: "apply", previewId: "preview_1" },
        config,
        api,
        previewStore,
        registry,
        now: () => new Date("2026-06-04T00:10:00.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_UPDATE_BLOCKED",
      details: {
        workflowId: "wf_1",
        issues: [
          expect.objectContaining({
            code: "WORKFLOW_REGISTRY_BASE_URL_MISMATCH",
          }),
        ],
      },
    } satisfies Partial<N8nBuilderError>)
    expect(registry.get).toHaveBeenCalledWith("wf_1")
    expect(api.updateWorkflow).not.toHaveBeenCalled()
    expect(registry.upsert).not.toHaveBeenCalled()
  })

  it("blocks active workflows during apply even when the preview hash matches", async () => {
    const activeCurrentWorkflow: N8nWorkflow & { id: string } = {
      ...currentWorkflow,
      active: true,
    }
    const api = {
      getWorkflow: vi.fn(async () => activeCurrentWorkflow),
      updateWorkflow: vi.fn(async () => ({ ...proposedWorkflow, id: "wf_1" })),
    }
    const previewStore = {
      get: vi.fn(async () => ({
        previewId: "preview_1",
        workflowId: "wf_1",
        baseWorkflowHash: stableHash(activeCurrentWorkflow),
        proposedWorkflowHash: stableHash(proposedWorkflow),
        summary: "Apply Slack",
        changes: ["Add Slack node"],
        proposedWorkflow,
        createdAt: "2026-06-04T00:00:00.000Z",
        expiresAt: "2026-06-04T00:30:00.000Z",
      })),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }

    await expect(
      updateWorkflow({
        args: { workflowId: "wf_1", mode: "apply", previewId: "preview_1" },
        config,
        api,
        previewStore,
        registry,
        now: () => new Date("2026-06-04T00:10:00.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_UPDATE_BLOCKED",
      details: {
        issues: [
          expect.objectContaining({
            code: "ACTIVE_WORKFLOW_BLOCKED",
          }),
        ],
      },
    } satisfies Partial<N8nBuilderError>)
    expect(api.updateWorkflow).not.toHaveBeenCalled()
    expect(registry.upsert).not.toHaveBeenCalled()
  })

  it("blocks unmanaged workflows during apply even when the preview hash matches", async () => {
    const unmanagedCurrentWorkflow: N8nWorkflow & { id: string } = {
      ...currentWorkflow,
      tags: [],
    }
    const api = {
      getWorkflow: vi.fn(async () => unmanagedCurrentWorkflow),
      updateWorkflow: vi.fn(async () => ({ ...proposedWorkflow, id: "wf_1" })),
    }
    const previewStore = {
      get: vi.fn(async () => ({
        previewId: "preview_1",
        workflowId: "wf_1",
        baseWorkflowHash: stableHash(unmanagedCurrentWorkflow),
        proposedWorkflowHash: stableHash(proposedWorkflow),
        summary: "Apply Slack",
        changes: ["Add Slack node"],
        proposedWorkflow,
        createdAt: "2026-06-04T00:00:00.000Z",
        expiresAt: "2026-06-04T00:30:00.000Z",
      })),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }

    await expect(
      updateWorkflow({
        args: { workflowId: "wf_1", mode: "apply", previewId: "preview_1" },
        config,
        api,
        previewStore,
        registry,
        now: () => new Date("2026-06-04T00:10:00.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_UPDATE_BLOCKED",
      details: {
        issues: [
          expect.objectContaining({
            code: "UNMANAGED_WORKFLOW",
          }),
        ],
      },
    } satisfies Partial<N8nBuilderError>)
    expect(api.updateWorkflow).not.toHaveBeenCalled()
    expect(registry.upsert).not.toHaveBeenCalled()
  })

  it("preserves workflow-level settings, tags, and meta through preview and apply", async () => {
    const currentWithWorkflowFields: N8nWorkflow & { id: string } = {
      ...currentWorkflow,
      settings: {
        timezone: "America/New_York",
        executionOrder: "v1",
      },
      tags: [{ name: "finance" }, { name: "opencode-n8n-builder" }],
      meta: {
        managedBy: "opencode-n8n-builder",
        managedByVersion: "0.0.9",
        createdAt: "old",
        workspaceId: "workspace_1",
        custom: "keep",
      },
    }
    let savedPreview: UpdatePreview | undefined
    const api = {
      getWorkflow: vi.fn(async () => currentWithWorkflowFields),
      updateWorkflow: vi.fn(async (workflowId: string, workflow: N8nWorkflow) => ({ ...workflow, id: workflowId })),
    }
    const planner = {
      createPatchPlan: vi.fn(async () => ({
        summary: "Add Slack notification",
        changes: ["Add Slack node"],
        replacementPlan: simpleWebhookPlan,
      })),
    }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "Slack node: n8n-nodes-base.slack"),
      getNodeTypes: vi.fn(async () => "Slack schema"),
    }
    const previewStore = {
      save: vi.fn(async (preview) => {
        const previewRecord: UpdatePreview = {
          previewId: "preview_1",
          ...preview,
        }
        savedPreview = previewRecord
        return previewRecord
      }),
      get: vi.fn(async () => savedPreview),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }

    await updateWorkflow({
      args: { workflowId: "wf_1", mode: "preview", prompt: "Add Slack" },
      config,
      api,
      planner,
      mcp,
      previewStore,
      registry,
      now: () => now,
    })

    expect(savedPreview?.proposedWorkflow).toMatchObject({
      active: false,
      settings: {
        timezone: "America/New_York",
        executionOrder: "v1",
      },
      tags: [{ name: "finance" }, { name: "opencode-n8n-builder" }],
      meta: {
        custom: "keep",
        createdAt: "old",
        workspaceId: "workspace_1",
        managedBy: "opencode-n8n-builder",
        managedByVersion: "0.1.0",
      },
    })

    await updateWorkflow({
      args: { workflowId: "wf_1", mode: "apply", previewId: "preview_1" },
      config,
      api,
      previewStore,
      registry,
      now: () => new Date("2026-06-04T00:10:00.000Z"),
    })

    expect(api.updateWorkflow).toHaveBeenCalledWith("wf_1", savedPreview?.proposedWorkflow)
    expect(api.updateWorkflow).toHaveBeenCalledWith(
      "wf_1",
      expect.objectContaining({
        active: false,
        settings: {
          timezone: "America/New_York",
          executionOrder: "v1",
        },
        tags: [{ name: "finance" }, { name: "opencode-n8n-builder" }],
        meta: {
          custom: "keep",
          createdAt: "old",
          workspaceId: "workspace_1",
          managedBy: "opencode-n8n-builder",
          managedByVersion: "0.1.0",
        },
      }),
    )
  })

  it("rejects a stale preview without updating n8n", async () => {
    const changedWorkflow: N8nWorkflow & { id: string } = {
      ...currentWorkflow,
      name: "Orders changed in n8n",
    }
    const api = {
      getWorkflow: vi.fn(async () => changedWorkflow),
      updateWorkflow: vi.fn(),
    }
    const previewStore = {
      get: vi.fn(async () => ({
        previewId: "preview_1",
        workflowId: "wf_1",
        baseWorkflowHash: stableHash(currentWorkflow),
        proposedWorkflowHash: stableHash(proposedWorkflow),
        summary: "Apply Slack",
        changes: ["Add Slack node"],
        proposedWorkflow,
        createdAt: "2026-06-04T00:00:00.000Z",
        expiresAt: "2026-06-04T00:30:00.000Z",
      })),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }

    await expect(
      updateWorkflow({
        args: { workflowId: "wf_1", mode: "apply", previewId: "preview_1" },
        config,
        api,
        previewStore,
        registry,
        now: () => new Date("2026-06-04T00:10:00.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "UPDATE_PREVIEW_STALE",
    } satisfies Partial<N8nBuilderError>)
    expect(api.updateWorkflow).not.toHaveBeenCalled()
    expect(registry.upsert).not.toHaveBeenCalled()
  })

  it("blocks unmanaged workflows during preview", async () => {
    const unmanagedWorkflow: N8nWorkflow & { id: string } = {
      ...currentWorkflow,
      tags: [],
    }
    const api = {
      getWorkflow: vi.fn(async () => unmanagedWorkflow),
      updateWorkflow: vi.fn(),
    }
    const planner = { createPatchPlan: vi.fn() }
    const mcp = {
      getSdkReference: vi.fn(),
      searchNodes: vi.fn(),
      getNodeTypes: vi.fn(),
    }
    const previewStore = { save: vi.fn() }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }

    await expect(
      updateWorkflow({
        args: { workflowId: "wf_1", mode: "preview", prompt: "Add Slack" },
        config,
        api,
        planner,
        mcp,
        previewStore,
        registry,
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_UPDATE_BLOCKED",
      details: {
        issues: [
          expect.objectContaining({
            code: "UNMANAGED_WORKFLOW",
          }),
        ],
      },
    } satisfies Partial<N8nBuilderError>)
    expect(api.updateWorkflow).not.toHaveBeenCalled()
    expect(previewStore.save).not.toHaveBeenCalled()
  })

  it("blocks active workflows during preview", async () => {
    const activeWorkflow: N8nWorkflow & { id: string } = {
      ...currentWorkflow,
      active: true,
    }
    const api = {
      getWorkflow: vi.fn(async () => activeWorkflow),
      updateWorkflow: vi.fn(),
    }
    const planner = { createPatchPlan: vi.fn() }
    const mcp = {
      getSdkReference: vi.fn(),
      searchNodes: vi.fn(),
      getNodeTypes: vi.fn(),
    }
    const previewStore = { save: vi.fn() }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }

    await expect(
      updateWorkflow({
        args: { workflowId: "wf_1", mode: "preview", prompt: "Add Slack" },
        config,
        api,
        planner,
        mcp,
        previewStore,
        registry,
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_UPDATE_BLOCKED",
      details: {
        issues: [
          expect.objectContaining({
            code: "ACTIVE_WORKFLOW_BLOCKED",
          }),
        ],
      },
    } satisfies Partial<N8nBuilderError>)
    expect(api.updateWorkflow).not.toHaveBeenCalled()
    expect(previewStore.save).not.toHaveBeenCalled()
  })
})
