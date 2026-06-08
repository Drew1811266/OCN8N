import { describe, expect, it } from "vitest"
import { compileWorkflowPlan } from "../../../src/workflow-compiler.js"
import { workflowPatchPlanSchema, workflowPlanSchema, type WorkflowPlan } from "../../../src/workflow-plan.js"
import type { N8nWorkflowNode } from "../../../src/validator.js"
import {
  e2eManualSetSdkCode,
  e2eManualSetPlan,
  e2eScheduleHttpIfPlan,
  e2eUpdatedManualIfSdkCode,
  e2eUpdatedManualIfPlan,
  e2eWebhookSetPlan,
} from "./test-workflows.js"

const e2eMarker = {
  managedBy: "opencode-n8n-builder",
  managedByVersion: "0.3.0-e2e",
  createdAt: "2026-06-08T00:00:00.000Z",
} as const

function compileE2ePlan(plan: WorkflowPlan) {
  return compileWorkflowPlan({
    plan,
    marker: e2eMarker,
  })
}

function getNodeByName(nodes: N8nWorkflowNode[], name: string): N8nWorkflowNode {
  const node = nodes.find((candidate) => candidate.name === name)
  expect(node).toBeDefined()
  return node as N8nWorkflowNode
}

describe("e2e workflow fixtures", () => {
  it("provides SDK code fixtures without embedded secrets", () => {
    for (const sdkCode of [e2eManualSetSdkCode, e2eUpdatedManualIfSdkCode]) {
      expect(sdkCode).toContain("export default workflow")
      expect(sdkCode).toContain("n8n-nodes-base.manualTrigger")
      expect(sdkCode).toContain("n8n-nodes-base.set")
      expect(sdkCode).not.toMatch(/apiKey|Bearer|secret/i)
    }

    expect(e2eUpdatedManualIfSdkCode).toContain("n8n-nodes-base.if")
  })

  it("validates all base plans against workflowPlanSchema", () => {
    for (const plan of [e2eManualSetPlan, e2eWebhookSetPlan, e2eScheduleHttpIfPlan]) {
      expect(() => workflowPlanSchema.parse(plan)).not.toThrow()
    }
  })

  it("validates update patch plan against workflowPatchPlanSchema", () => {
    expect(() => workflowPatchPlanSchema.parse(e2eUpdatedManualIfPlan)).not.toThrow()
  })

  it("compiles manual workflow as inactive managed workflow", () => {
    const workflow = compileE2ePlan(e2eManualSetPlan)

    expect(workflow.active).toBe(false)
    expect(workflow.tags).toEqual([{ name: "opencode-n8n-builder" }])
    expect(workflow.nodes.map((node) => node.type)).toEqual([
      "n8n-nodes-base.manualTrigger",
      "n8n-nodes-base.set",
    ])
  })

  it("compiles manual Set node with n8n-compatible assignments", () => {
    const workflow = compileE2ePlan(e2eManualSetPlan)
    const setNode = getNodeByName(workflow.nodes, "Set Fields")

    expect(setNode.typeVersion).toBeGreaterThanOrEqual(3.3)
    expect(setNode.parameters.assignments).toEqual({
      assignments: [
        {
          id: "message",
          name: "message",
          type: "string",
          value: "created by opencode",
        },
      ],
    })
  })

  it("compiles webhook Set node with n8n-compatible assignments", () => {
    const workflow = compileE2ePlan(e2eWebhookSetPlan)
    const setNode = getNodeByName(workflow.nodes, "Set Payload")

    expect(setNode.typeVersion).toBeGreaterThanOrEqual(3.3)
    expect(setNode.parameters.assignments).toEqual({
      assignments: [
        {
          id: "source",
          name: "source",
          type: "string",
          value: "webhook",
        },
      ],
    })
  })

  it("compiles HTTP Request node with n8n-compatible text response options", () => {
    const workflow = compileE2ePlan(e2eScheduleHttpIfPlan)
    const httpNode = getNodeByName(workflow.nodes, "HTTP Request")

    expect(httpNode.parameters.url).toBe("https://example.com")
    expect(httpNode.parameters.options).toEqual({
      response: {
        response: {
          responseFormat: "text",
        },
      },
    })
    expect(httpNode.parameters).not.toHaveProperty("responseFormat")
  })

  it("compiles update replacement plan with Set assignment and IF node", () => {
    const workflow = compileE2ePlan(e2eUpdatedManualIfPlan.replacementPlan)
    const setNode = getNodeByName(workflow.nodes, "Set Fields")
    const ifNode = getNodeByName(workflow.nodes, "IF Message")

    expect(setNode.typeVersion).toBeGreaterThanOrEqual(3.3)
    expect(setNode.parameters.assignments).toEqual({
      assignments: [
        {
          id: "message",
          name: "message",
          type: "string",
          value: "created by opencode",
        },
      ],
    })
    expect(ifNode.parameters.conditions).toMatchObject({
      conditions: [
        {
          id: "message-check",
          leftValue: "={{ $json.message }}",
          rightValue: "created by opencode",
        },
      ],
    })
  })
})
