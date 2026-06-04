import { describe, expect, it, vi } from "vitest"
import { inspectWorkflow } from "../src/tools/inspect-workflow.js"
import { listManagedWorkflows } from "../src/tools/list-managed-workflows.js"
import type { N8nWorkflow } from "../src/validator.js"

describe("inspectWorkflow", () => {
  it("summarizes a managed workflow", async () => {
    const workflow: N8nWorkflow & { id: string } = {
      id: "wf_1",
      name: "Orders",
      active: true,
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
    }
    const api = {
      getWorkflow: vi.fn(async () => workflow),
    }

    const result = await inspectWorkflow({ args: { workflowId: "wf_1" }, api })

    expect(api.getWorkflow).toHaveBeenCalledWith("wf_1")
    expect(result).toEqual({
      workflowId: "wf_1",
      name: "Orders",
      active: true,
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
