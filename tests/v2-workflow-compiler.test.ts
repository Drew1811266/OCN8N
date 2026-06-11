import { describe, expect, it } from "vitest"
import { containsPlaintextSecret } from "../src/security.js"
import { createInitialV2Plan } from "../src/v2/plan-service.js"
import { compileV2PlanToWorkflowPreview } from "../src/v2/workflow-compiler.js"
import { validateWorkflowForSave } from "../src/validator.js"

function complexPlan() {
  return createInitialV2Plan({
    name: "Order fulfillment",
    prompt:
      "Create a webhook order workflow that maps fields, filters invalid orders, branches by status with a default path, paginates API items in batches, calls an external fulfillment API with API key auth and mock response schema, retries failures, sends Slack notification, writes the result, and responds to the webhook.",
  })
}

describe("compileV2PlanToWorkflowPreview", () => {
  it("compiles a complex v2 plan into inactive n8n workflow preview JSON", () => {
    const compiled = compileV2PlanToWorkflowPreview({
      plan: complexPlan(),
      pluginVersion: "2.0.0",
      createdAt: "2026-06-11T00:00:00.000Z",
    })

    expect(compiled.workflow.name).toBe("Order fulfillment")
    expect(compiled.workflow.active).toBe(false)
    expect(compiled.workflow.tags).toEqual([{ name: "opencode-n8n-builder-v2" }])
    expect(compiled.workflow.meta).toEqual({
      managedBy: "opencode-n8n-builder-v2",
      managedByVersion: "2.0.0",
      createdAt: "2026-06-11T00:00:00.000Z",
    })
    expect(compiled.workflow.nodes.map((node) => node.name)).toEqual([
      "Receive input",
      "Transform payload",
      "Route by status",
      "Process batch",
      "Call fulfillment API",
      "Handle failures",
      "Return output",
    ])
    expect(compiled.workflow.nodes.map((node) => node.type)).toEqual([
      "n8n-nodes-base.webhook",
      "n8n-nodes-base.set",
      "n8n-nodes-base.if",
      "n8n-nodes-base.splitInBatches",
      "n8n-nodes-base.httpRequest",
      "n8n-nodes-base.noOp",
      "n8n-nodes-base.respondToWebhook",
    ])
    expect(compiled.workflow.connections["Receive input"].main[0][0].node).toBe("Transform payload")
    expect(compiled.workflow.connections["Call fulfillment API"].main[0][0].node).toBe("Handle failures")
    expect(
      validateWorkflowForSave({
        workflow: compiled.workflow,
        requireManagedMarker: false,
      }),
    ).toMatchObject({ valid: true, issues: [] })
  })

  it("emits mapping trace from plan steps and patterns to workflow nodes", () => {
    const compiled = compileV2PlanToWorkflowPreview({
      plan: complexPlan(),
      pluginVersion: "2.0.0",
      createdAt: "2026-06-11T00:00:00.000Z",
    })

    expect(compiled.mappingTrace).toEqual(
      expect.arrayContaining([
        {
          stepId: "step_external_call",
          patternIds: ["pattern_external_http", "pattern_external_auth", "pattern_external_response"],
          nodeNames: ["Call fulfillment API"],
          notes: ["Compiled external_call pattern(s) into n8n-nodes-base.httpRequest."],
        },
        {
          stepId: "step_output",
          patternIds: ["pattern_output_response", "pattern_output_write", "pattern_output_notification"],
          nodeNames: ["Return output"],
          notes: ["Compiled output pattern(s) into n8n-nodes-base.respondToWebhook."],
        },
      ]),
    )
  })

  it("does not emit plaintext secret parameters", () => {
    const compiled = compileV2PlanToWorkflowPreview({
      plan: complexPlan(),
      pluginVersion: "2.0.0",
      createdAt: "2026-06-11T00:00:00.000Z",
    })

    expect(containsPlaintextSecret(compiled.workflow)).toBe(false)
    expect(JSON.stringify(compiled.workflow)).not.toMatch(/Bearer|secret|api[_-]?key/i)
  })
})
