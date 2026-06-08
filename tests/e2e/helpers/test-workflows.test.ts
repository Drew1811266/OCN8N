import { describe, expect, it } from "vitest"
import { compileWorkflowPlan } from "../../../src/workflow-compiler.js"
import { workflowPatchPlanSchema, workflowPlanSchema } from "../../../src/workflow-plan.js"
import {
  e2eManualSetPlan,
  e2eWebhookSetPlan,
  e2eScheduleHttpIfPlan,
  e2eUpdatedManualIfPlan,
} from "./test-workflows.js"

describe("e2e workflow fixtures", () => {
  it("validates all base plans against workflowPlanSchema", () => {
    for (const plan of [e2eManualSetPlan, e2eWebhookSetPlan, e2eScheduleHttpIfPlan]) {
      expect(() => workflowPlanSchema.parse(plan)).not.toThrow()
    }
  })

  it("validates update patch plan against workflowPatchPlanSchema", () => {
    expect(() => workflowPatchPlanSchema.parse(e2eUpdatedManualIfPlan)).not.toThrow()
  })

  it("compiles manual workflow as inactive managed workflow", () => {
    const workflow = compileWorkflowPlan({
      plan: e2eManualSetPlan,
      marker: {
        managedBy: "opencode-n8n-builder",
        managedByVersion: "0.2.0-e2e",
        createdAt: "2026-06-08T00:00:00.000Z",
      },
    })

    expect(workflow.active).toBe(false)
    expect(workflow.tags).toEqual([{ name: "opencode-n8n-builder" }])
    expect(workflow.nodes.map((node) => node.type)).toEqual([
      "n8n-nodes-base.manualTrigger",
      "n8n-nodes-base.set",
    ])
  })
})
