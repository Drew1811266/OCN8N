import { describe, expect, it } from "vitest"
import { createPatternFirstV2Plan } from "../src/v2/pattern-planner.js"

describe("v2 pattern-first planner", () => {
  it("maps a complex automation prompt to all seven required pattern families", () => {
    const plan = createPatternFirstV2Plan({
      name: "Order fulfillment",
      prompt:
        "Create a webhook order workflow that maps fields, filters invalid orders, branches by status with a default path, paginates API items in batches, calls an external fulfillment API with API key auth and mock response schema, retries failures, sends Slack notification, writes the result, and responds to the webhook.",
    })

    expect([...new Set(plan.patterns.map((pattern) => pattern.family))]).toEqual([
      "trigger",
      "transform",
      "branch",
      "loop_batch",
      "external_call",
      "error_handling",
      "output",
    ])
    expect(plan.patterns.map((pattern) => pattern.variant)).toEqual(
      expect.arrayContaining([
        "webhook",
        "field_mapping",
        "filtering",
        "default_branch",
        "batch",
        "http_api_call",
        "auth_requirement",
        "mock_response_schema",
        "retry",
        "failure_notification",
        "respond_to_webhook",
        "write_service",
        "send_notification",
      ]),
    )
    expect(plan.steps.map((step) => step.id)).toEqual([
      "step_trigger",
      "step_transform",
      "step_branch",
      "step_loop",
      "step_external_call",
      "step_error_handling",
      "step_output",
    ])
    expect(plan.branches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceStepId: "step_branch", targetStepId: "step_loop" }),
        expect.objectContaining({ sourceStepId: "step_branch", targetStepId: "step_output", isDefault: true }),
      ]),
    )
    expect(plan.loops).toEqual([
      expect.objectContaining({
        sourceStepId: "step_loop",
        mode: "batch",
        maxIterations: 100,
        termination: "Stop after all items are processed or the maximum batch count is reached.",
      }),
    ])
    expect(plan.externalCalls).toEqual([
      expect.objectContaining({
        stepId: "step_external_call",
        service: "External API",
        operation: "fulfillment",
        credentialRequirementId: "credential_external_api",
        responseContract: { fulfillmentId: "string", status: "string" },
        responseContractSource: "inferred",
      }),
    ])
    expect(plan.credentialRequirements).toEqual([
      expect.objectContaining({
        id: "credential_external_api",
        authMode: "api_key",
        affectedStepIds: ["step_external_call"],
        blocksApply: true,
      }),
    ])
    expect(plan.errorPolicy).toEqual({
      strategy: "retry_then_fail",
      maxAttempts: 3,
      notifications: ["Slack"],
    })
    expect(plan.outputs.map((output) => output.mode)).toEqual([
      "respond_to_webhook",
      "write_service",
      "send_notification",
    ])
    expect(plan.testContract.examples).toHaveLength(1)
    expect(plan.testContract.edgeCases.map((example) => example.name)).toEqual(
      expect.arrayContaining(["invalid order", "external API failure"]),
    )
    expect(plan.confidence).toBe("medium")
    expect(plan.riskLevel).toBe("medium")
    expect(plan.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["V2_RESPONSE_CONTRACT_INFERRED", "V2_CREDENTIAL_SETUP_REQUIRED"]),
    )
  })

  it("keeps a minimal manual request to trigger and output patterns", () => {
    const plan = createPatternFirstV2Plan({
      prompt: "Create a manual workflow that returns accepted true.",
    })

    expect(plan.inputs).toEqual([
      expect.objectContaining({
        id: "input_manual",
        mode: "manual",
      }),
    ])
    expect(plan.patterns.map((pattern) => pattern.family)).toEqual(["trigger", "output"])
    expect(plan.patterns.map((pattern) => pattern.variant)).toEqual(["manual", "respond_to_webhook"])
    expect(plan.steps.map((step) => step.id)).toEqual(["step_trigger", "step_output"])
    expect(plan.branches).toEqual([])
    expect(plan.loops).toEqual([])
    expect(plan.externalCalls).toEqual([])
    expect(plan.credentialRequirements).toEqual([])
    expect(plan.confidence).toBe("high")
    expect(plan.riskLevel).toBe("low")
  })
})
