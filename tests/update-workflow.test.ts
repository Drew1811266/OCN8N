import { describe, expect, it, vi } from "vitest"
import { N8nBuilderError } from "../src/errors.js"
import { stableHash } from "../src/hash.js"
import type { UpdatePreview } from "../src/preview-store.js"
import type { PluginConfig } from "../src/types.js"
import { updateWorkflow } from "../src/tools/update-workflow.js"
import type { N8nWorkflow } from "../src/validator.js"
import { compileWorkflowPlan } from "../src/workflow-compiler.js"
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

describe("updateWorkflow", () => {
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

    const result = await updateWorkflow({
      args: { workflowId: "wf_1", mode: "preview", prompt: "Add Slack" },
      config,
      api,
      planner,
      mcp,
      previewStore,
      now: () => now,
    })

    expect(api.getWorkflow).toHaveBeenCalledWith("wf_1")
    expect(mcp.getSdkReference).toHaveBeenCalledWith("all")
    expect(mcp.searchNodes).toHaveBeenCalledWith("Add Slack")
    expect(mcp.getNodeTypes).toHaveBeenCalledWith(["n8n-nodes-base.slack"])
    expect(planner.createPatchPlan).toHaveBeenCalledWith({
      prompt: "Add Slack",
      currentWorkflowJson: JSON.stringify(currentWorkflow, null, 2),
      sdkReference: "SDK rules",
      nodeDocumentation: [{ nodeType: "selected", documentation: "Slack schema" }],
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
    const registry = { upsert: vi.fn(async () => undefined) }

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
    const registry = { upsert: vi.fn(async () => undefined) }

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
    const registry = { upsert: vi.fn(async () => undefined) }

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
    const registry = { upsert: vi.fn(async () => undefined) }

    await updateWorkflow({
      args: { workflowId: "wf_1", mode: "preview", prompt: "Add Slack" },
      config,
      api,
      planner,
      mcp,
      previewStore,
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
    const registry = { upsert: vi.fn(async () => undefined) }

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

    await expect(
      updateWorkflow({
        args: { workflowId: "wf_1", mode: "preview", prompt: "Add Slack" },
        config,
        api,
        planner,
        mcp,
        previewStore,
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

    await expect(
      updateWorkflow({
        args: { workflowId: "wf_1", mode: "preview", prompt: "Add Slack" },
        config,
        api,
        planner,
        mcp,
        previewStore,
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
