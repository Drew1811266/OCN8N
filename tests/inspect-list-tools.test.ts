import { describe, expect, it, vi } from "vitest"
import { N8nBuilderError } from "../src/errors.js"
import type { WorkflowRegistryRecord } from "../src/registry.js"
import { inspectWorkflow } from "../src/tools/inspect-workflow.js"
import { listManagedWorkflows } from "../src/tools/list-managed-workflows.js"
import type { N8nWorkflow } from "../src/validator.js"

describe("inspectWorkflow", () => {
  const baseUrl = "https://demo/api/v1"
  const registryRecord: WorkflowRegistryRecord = {
    workflowId: "wf_1",
    name: "Orders",
    url: "https://demo/workflow/wf_1",
    baseUrl,
    managedBy: "opencode-n8n-builder",
    managedByVersion: "0.1.0",
    lastPlanHash: "hash",
    lastUpdatedAt: "2026-06-04T00:00:00.000Z",
  }

  function workflow(overrides: Partial<N8nWorkflow & { id: string }> = {}): N8nWorkflow & { id: string } {
    return {
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
        {
          name: "Slack",
          type: "n8n-nodes-base.slack",
          typeVersion: 2,
          position: [320, 0],
          parameters: {},
          credentials: {
            slackApi: { id: "cred_1", name: "Slack" },
          },
        },
      ],
      connections: {
        Start: {
          main: [[{ node: "Slack", type: "main", index: 0 }]],
        },
      },
      settings: {},
      tags: [{ name: "opencode-n8n-builder" }],
      ...overrides,
    }
  }

  it("summarizes a managed workflow", async () => {
    const managedWorkflow = workflow()
    const api = {
      getWorkflow: vi.fn(async () => managedWorkflow),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
    }

    const result = await inspectWorkflow({ args: { workflowId: "wf_1" }, baseUrl, api, registry })

    expect(api.getWorkflow).toHaveBeenCalledWith("wf_1")
    expect(registry.get).toHaveBeenCalledWith("wf_1")
    expect(result).toEqual({
      workflowId: "wf_1",
      name: "Orders",
      active: false,
      nodes: [
        {
          name: "Start",
          type: "n8n-nodes-base.manualTrigger",
          credentialTypes: [],
        },
        {
          name: "Slack",
          type: "n8n-nodes-base.slack",
          credentialTypes: ["slackApi"],
        },
      ],
      connections: [
        {
          source: "Start",
          outputs: {
            main: [[{ node: "Slack", type: "main", index: 0 }]],
          },
        },
      ],
      issues: [],
    })
  })

  it("rejects unmanaged workflows before returning details", async () => {
    const unmanagedWorkflow = workflow({
      name: "Sensitive Orders",
      tags: [],
      nodes: [
        {
          name: "Secret Slack",
          type: "n8n-nodes-base.slack",
          typeVersion: 2,
          position: [0, 0],
          parameters: {},
        },
      ],
      connections: {},
    })
    const api = {
      getWorkflow: vi.fn(async () => unmanagedWorkflow),
    }
    const registry = {
      get: vi.fn(async () => registryRecord),
    }

    try {
      await inspectWorkflow({ args: { workflowId: "wf_1" }, baseUrl, api, registry })
      throw new Error("Expected inspectWorkflow to reject")
    } catch (error) {
      expect(error).toMatchObject({
        code: "WORKFLOW_INSPECT_BLOCKED",
        details: {
          workflowId: "wf_1",
          issues: [
            expect.objectContaining({
              code: "UNMANAGED_WORKFLOW",
            }),
          ],
        },
      } satisfies Partial<N8nBuilderError>)
      expect(JSON.stringify((error as N8nBuilderError).details)).not.toContain("Sensitive Orders")
      expect(JSON.stringify((error as N8nBuilderError).details)).not.toContain("Secret Slack")
    }

    expect(registry.get).not.toHaveBeenCalled()
  })

  it("rejects marker-tagged workflows missing from the local registry", async () => {
    const api = {
      getWorkflow: vi.fn(async () => workflow()),
    }
    const registry = {
      get: vi.fn(async () => undefined),
    }

    await expect(
      inspectWorkflow({ args: { workflowId: "wf_1" }, baseUrl, api, registry }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_INSPECT_BLOCKED",
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
  })

  it("rejects marker-tagged workflows with a registry record from a different base URL", async () => {
    const api = {
      getWorkflow: vi.fn(async () => workflow()),
    }
    const registry = {
      get: vi.fn(async () => ({
        ...registryRecord,
        baseUrl: "https://other-demo/api/v1",
      })),
    }

    await expect(
      inspectWorkflow({ args: { workflowId: "wf_1" }, baseUrl, api, registry }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_INSPECT_BLOCKED",
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
  })
})

describe("listManagedWorkflows", () => {
  it("returns registry records", async () => {
    const registry = {
      list: vi.fn(async () => [
        {
          workflowId: "wf_1",
          name: "Orders",
          url: "https://demo/workflow/wf_1",
          baseUrl: "https://demo/api/v1",
          managedBy: "opencode-n8n-builder" as const,
          managedByVersion: "0.1.0",
          lastPlanHash: "hash",
          lastUpdatedAt: "2026-06-04T00:00:00.000Z",
        },
      ]),
    }

    const result = await listManagedWorkflows({ registry })

    expect(result.workflows).toEqual([
      {
        workflowId: "wf_1",
        name: "Orders",
        url: "https://demo/workflow/wf_1",
        lastUpdatedAt: "2026-06-04T00:00:00.000Z",
      },
    ])
  })
})
