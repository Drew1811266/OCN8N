import { describe, expect, it } from "vitest"
import { compileWorkflowPlan } from "../src/workflow-compiler.js"
import { simpleWebhookPlan } from "./fixtures/workflows.js"

describe("compileWorkflowPlan", () => {
  it("compiles a workflow plan into n8n workflow JSON with marker metadata", () => {
    const workflow = compileWorkflowPlan({
      plan: simpleWebhookPlan,
      marker: {
        managedBy: "opencode-n8n-builder",
        managedByVersion: "0.1.0",
        createdAt: "2026-06-04T00:00:00.000Z",
        workspaceId: "test-workspace",
      },
    })

    expect(workflow.name).toBe("Order webhook to Slack")
    expect(workflow.active).toBe(false)
    expect(workflow.nodes.map((node) => node.name)).toEqual(["Receive Order", "Send Slack Alert"])
    expect(workflow.connections["Receive Order"].main[0][0].node).toBe("Send Slack Alert")
    expect(workflow.tags).toEqual([{ name: "opencode-n8n-builder" }])
    expect(workflow.meta?.managedBy).toBe("opencode-n8n-builder")
    expect(workflow.nodes[1].credentials?.slackApi.name).toBe("OpenCode Slack")
  })

  it("omits the credentials property for nodes without credential references", () => {
    const workflow = compileWorkflowPlan({
      plan: simpleWebhookPlan,
      marker: {
        managedBy: "opencode-n8n-builder",
        managedByVersion: "0.1.0",
        createdAt: "2026-06-04T00:00:00.000Z",
      },
    })

    expect(Object.hasOwn(workflow.nodes[0], "credentials")).toBe(false)
  })

  it("fills skipped output indexes with empty arrays", () => {
    const workflow = compileWorkflowPlan({
      plan: {
        ...simpleWebhookPlan,
        connections: [{ ...simpleWebhookPlan.connections[0], outputIndex: 1 }],
      },
      marker: {
        managedBy: "opencode-n8n-builder",
        managedByVersion: "0.1.0",
        createdAt: "2026-06-04T00:00:00.000Z",
      },
    })

    const mainConnections = workflow.connections["Receive Order"].main

    expect(mainConnections[0]).toEqual([])
    expect(mainConnections[1][0].node).toBe("Send Slack Alert")
    expect(JSON.stringify(mainConnections)).not.toContain("null")
  })
})
