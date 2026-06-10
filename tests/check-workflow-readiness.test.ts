import { describe, expect, it, vi } from "vitest"
import { N8nBuilderError } from "../src/errors.js"
import type { N8nExecutionSummary } from "../src/n8n-api-client.js"
import type { WorkflowRegistryRecord } from "../src/registry.js"
import { checkWorkflowReadiness } from "../src/tools/check-workflow-readiness.js"
import type { N8nWorkflow } from "../src/validator.js"

const baseUrl = "https://demo/api/v1"
const now = new Date("2026-06-04T00:00:00.000Z")

const registryRecord: WorkflowRegistryRecord = {
  workflowId: "wf_1",
  name: "Orders",
  url: "https://demo/workflow/wf_1",
  baseUrl,
  managedBy: "opencode-n8n-builder",
  managedByVersion: "0.7.0",
  lastPlanHash: "hash",
  lastUpdatedAt: now.toISOString(),
}

function workflow(overrides: Partial<N8nWorkflow & { id: string }> = {}): N8nWorkflow & { id: string } {
  return {
    id: "wf_1",
    name: "Orders",
    active: false,
    nodes: [
      {
        name: "Receive Order",
        type: "n8n-nodes-base.webhook",
        typeVersion: 2,
        position: [0, 0],
        parameters: { path: "orders" },
      },
      {
        name: "Set Fields",
        type: "n8n-nodes-base.set",
        typeVersion: 3,
        position: [300, 0],
        parameters: {},
      },
    ],
    connections: {
      "Receive Order": {
        main: [[{ node: "Set Fields", type: "main", index: 0 }]],
      },
    },
    settings: {},
    tags: [{ name: "opencode-n8n-builder" }],
    ...overrides,
  }
}

function execution(overrides: Partial<N8nExecutionSummary> = {}): N8nExecutionSummary {
  return {
    id: "exec_1",
    workflowId: "wf_1",
    status: "success",
    mode: "trigger",
    startedAt: "2026-06-04T00:01:00.000Z",
    stoppedAt: "2026-06-04T00:01:02.000Z",
    ...overrides,
  }
}

describe("checkWorkflowReadiness", () => {
  it("returns readiness preview with checks and runtime diagnostics", async () => {
    const api = {
      getWorkflow: vi.fn(async () => workflow()),
      listExecutions: vi.fn(async () => [execution()]),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }
    const mcp = {
      validateWorkflowCode: vi.fn(async () => ({ valid: true, errors: [], warnings: [], nodeCount: 2 })),
    }

    const result = await checkWorkflowReadiness({
      args: { workflowId: "wf_1", mode: "preview" },
      config: { baseUrl, pluginVersion: "0.8.0" },
      api,
      registry,
      mcp,
      now: () => now,
    })

    expect(api.getWorkflow).toHaveBeenCalledWith("wf_1")
    expect(registry.get).toHaveBeenCalledWith("wf_1")
    expect(api.listExecutions).toHaveBeenCalledWith({ workflowId: "wf_1", limit: 5 })
    expect(result).toMatchObject({
      workflowId: "wf_1",
      name: "Orders",
      mode: "preview",
      active: false,
      status: "warning",
      activation: {
        allowed: false,
        requiresConfirmation: true,
      },
      diagnostics: {
        supported: true,
        executions: [execution()],
      },
    })
    expect(result.checks.map((check) => check.code)).toEqual(
      expect.arrayContaining(["MANAGED_WORKFLOW", "MCP_VALIDATION", "WEBHOOK_PRODUCTION_URL"]),
    )
  })

  it("blocks unmanaged workflows before returning readiness details", async () => {
    const api = {
      getWorkflow: vi.fn(async () => workflow({ tags: [] })),
      listExecutions: vi.fn(),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }

    await expect(
      checkWorkflowReadiness({
        args: { workflowId: "wf_1", mode: "preview" },
        config: { baseUrl, pluginVersion: "0.8.0" },
        api,
        registry,
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_READINESS_BLOCKED",
      details: {
        workflowId: "wf_1",
        issues: [expect.objectContaining({ code: "UNMANAGED_WORKFLOW" })],
      },
    } satisfies Partial<N8nBuilderError>)
    expect(registry.get).not.toHaveBeenCalled()
  })

  it("returns unsupported runtime diagnostics when executions API is unavailable", async () => {
    const api = {
      getWorkflow: vi.fn(async () => workflow()),
      listExecutions: vi.fn(async () => {
        throw new N8nBuilderError("n8n API request failed with status 403 for /executions.", "N8N_API_ERROR", {
          status: 403,
          path: "/executions?workflowId=wf_1&limit=5",
        })
      }),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }

    const result = await checkWorkflowReadiness({
      args: { workflowId: "wf_1", mode: "preview" },
      config: { baseUrl, pluginVersion: "0.8.0" },
      api,
      registry,
      now: () => now,
    })

    expect(result.diagnostics).toEqual({
      supported: false,
      executions: [],
      message: "Recent executions are unavailable from the configured n8n API or API key scope.",
    })
  })

  it("activates only with explicit confirmation and no blocking checks", async () => {
    const api = {
      getWorkflow: vi.fn(async () =>
        workflow({
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
        }),
      ),
      listExecutions: vi.fn(async () => []),
      activateWorkflow: vi.fn(async () => workflow({ active: true })),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }
    const mcp = {
      validateWorkflowCode: vi.fn(async () => ({ valid: true, errors: [], warnings: [], nodeCount: 1 })),
    }

    const result = await checkWorkflowReadiness({
      args: { workflowId: "wf_1", mode: "activate", confirm: true, allowWarnings: true },
      config: { baseUrl, pluginVersion: "0.8.0" },
      api,
      registry,
      mcp,
      now: () => now,
    })

    expect(api.activateWorkflow).toHaveBeenCalledWith("wf_1")
    expect(registry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "wf_1",
        name: "Orders",
        lastUpdatedAt: now.toISOString(),
      }),
    )
    expect(result.mode).toBe("activate")
    expect(result.active).toBe(true)
  })

  it("rejects activation without confirmation", async () => {
    const api = {
      getWorkflow: vi.fn(async () => workflow()),
      listExecutions: vi.fn(async () => []),
      activateWorkflow: vi.fn(),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }

    await expect(
      checkWorkflowReadiness({
        args: { workflowId: "wf_1", mode: "activate", confirm: false },
        config: { baseUrl, pluginVersion: "0.8.0" },
        api,
        registry,
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_ACTIVATION_CONFIRMATION_REQUIRED",
    } satisfies Partial<N8nBuilderError>)
    expect(api.activateWorkflow).not.toHaveBeenCalled()
  })

  it("deactivates managed workflows with explicit confirmation", async () => {
    const activeWorkflow = workflow({ active: true })
    const api = {
      getWorkflow: vi.fn(async () => activeWorkflow),
      listExecutions: vi.fn(async () => []),
      deactivateWorkflow: vi.fn(async () => workflow({ active: false })),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
      upsert: vi.fn(async () => undefined),
    }

    const result = await checkWorkflowReadiness({
      args: { workflowId: "wf_1", mode: "deactivate", confirm: true },
      config: { baseUrl, pluginVersion: "0.8.0" },
      api,
      registry,
      now: () => now,
    })

    expect(api.deactivateWorkflow).toHaveBeenCalledWith("wf_1")
    expect(result.mode).toBe("deactivate")
    expect(result.active).toBe(false)
  })
})
