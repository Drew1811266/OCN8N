import { describe, expect, it } from "vitest"
import { validateAndSimulateV2Plan } from "../src/v2/plan-service.js"
import { reversePlanFromWorkflow } from "../src/v2/reverse-planner.js"
import type { N8nWorkflow } from "../src/validator.js"

function workflow(overrides: Partial<N8nWorkflow & { id: string }> = {}): N8nWorkflow & { id: string } {
  return {
    id: "wf_reverse",
    name: "Production Orders",
    active: false,
    nodes: [
      {
        name: "Webhook",
        type: "n8n-nodes-base.webhook",
        typeVersion: 2,
        position: [0, 0],
        parameters: { path: "orders" },
      },
      {
        name: "Normalize",
        type: "n8n-nodes-base.set",
        typeVersion: 3,
        position: [220, 0],
        parameters: { values: { string: [{ name: "token", value: "secret-token" }] } },
      },
      {
        name: "Route Paid Orders",
        type: "n8n-nodes-base.if",
        typeVersion: 2,
        position: [440, 0],
        parameters: { conditions: { string: [{ value1: "={{$json.status}}", operation: "equals", value2: "paid" }] } },
      },
      {
        name: "Batch Orders",
        type: "n8n-nodes-base.splitInBatches",
        typeVersion: 3,
        position: [660, -120],
        parameters: { batchSize: 10 },
      },
      {
        name: "Fulfillment API",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4,
        position: [880, -120],
        parameters: {
          method: "POST",
          url: "https://api.example.com/orders",
          headerParameters: {
            parameters: [{ name: "Authorization", value: "Bearer should-not-copy" }],
          },
        },
        credentials: {
          httpHeaderAuth: {
            id: "cred_1",
            name: "Orders API",
          },
        },
      },
      {
        name: "Community Enrich",
        type: "n8n-nodes-base.communityEnrich",
        typeVersion: 1,
        position: [1100, -120],
        parameters: { apiToken: "token=community-secret" },
      },
      {
        name: "Respond",
        type: "n8n-nodes-base.respondToWebhook",
        typeVersion: 1,
        position: [1320, 0],
        parameters: { responseBody: "={{$json}}" },
      },
    ],
    connections: {
      Webhook: { main: [[{ node: "Normalize", type: "main", index: 0 }]] },
      Normalize: { main: [[{ node: "Route Paid Orders", type: "main", index: 0 }]] },
      "Route Paid Orders": {
        main: [
          [{ node: "Batch Orders", type: "main", index: 0 }],
          [{ node: "Respond", type: "main", index: 0 }],
        ],
      },
      "Batch Orders": { main: [[{ node: "Fulfillment API", type: "main", index: 0 }]] },
      "Fulfillment API": { main: [[{ node: "Community Enrich", type: "main", index: 0 }]] },
      "Community Enrich": { main: [[{ node: "Respond", type: "main", index: 0 }]] },
    },
    settings: {},
    tags: [],
    ...overrides,
  }
}

describe("reversePlanFromWorkflow", () => {
  it("maps known n8n node families to a valid conservative v2 plan", () => {
    const result = reversePlanFromWorkflow({
      workflow: workflow(),
      workflowId: "wf_reverse",
    })

    expect(result.plan.intent.goal).toContain("Production Orders")
    expect(result.plan.patterns.map((pattern) => pattern.family)).toEqual(
      expect.arrayContaining(["trigger", "transform", "branch", "loop_batch", "external_call", "output"]),
    )
    expect(result.plan.branches).toEqual(expect.arrayContaining([expect.objectContaining({ isDefault: true })]))
    expect(result.plan.loops).toEqual(expect.arrayContaining([expect.objectContaining({ maxIterations: 100 })]))
    expect(result.plan.externalCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          service: "Fulfillment API",
          responseContractSource: "inferred",
          responseContract: { response: "unknown" },
          credentialRequirementId: expect.any(String),
        }),
      ]),
    )
    expect(result.plan.credentialRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          service: "Fulfillment API",
          credentialType: "httpHeaderAuth",
          status: "unknown",
          blocksApply: true,
        }),
      ]),
    )
    expect(result.unmappedNodes).toEqual([
      expect.objectContaining({
        name: "Community Enrich",
        type: "n8n-nodes-base.communityEnrich",
        reason: "unsupported_node_type",
      }),
    ])
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "V2_REVERSE_UNMAPPED_NODE" }),
        expect.objectContaining({ code: "V2_REVERSE_INFERRED_EXTERNAL_CONTRACT" }),
        expect.objectContaining({ code: "V2_REVERSE_CREDENTIAL_SEMANTICS_UNKNOWN" }),
      ]),
    )
    expect(JSON.stringify(result.plan)).not.toContain("secret-token")
    expect(JSON.stringify(result.plan)).not.toContain("should-not-copy")
    expect(JSON.stringify(result.plan)).not.toContain("community-secret")

    const simulation = validateAndSimulateV2Plan({
      planId: "123e4567-e89b-12d3-a456-426614174000",
      planVersion: 1,
      plan: result.plan,
      checkedAt: "2026-06-11T04:00:00.000Z",
    })
    expect(simulation.status).toBe("passed")
  })

  it("marks active workflows as read-only reverse plans", () => {
    const result = reversePlanFromWorkflow({
      workflow: workflow({ active: true }),
      workflowId: "wf_active",
    })

    expect(result.plan.riskLevel).toBe("medium")
    expect(result.plan.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "V2_REVERSE_ACTIVE_READ_ONLY" })]),
    )
    expect(result.plan.trace).toEqual(expect.arrayContaining(["Workflow was active at reverse planning time; plan is read-only."]))
  })
})
