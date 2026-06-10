import { describe, expect, it } from "vitest"
import {
  analyzeWorkflowNodeCompatibility,
  buildNodeCompatibilityGuidance,
  getNodeCompatibility,
  nodeCompatibilityCatalog,
} from "../src/node-compatibility.js"
import type { N8nWorkflow } from "../src/validator.js"

describe("node compatibility catalog", () => {
  it("classifies committed low-risk scenario nodes as tier 1 verified", () => {
    expect(getNodeCompatibility("n8n-nodes-base.manualTrigger")).toMatchObject({
      tier: "tier_1_verified",
      nodeType: "n8n-nodes-base.manualTrigger",
    })
    expect(getNodeCompatibility("n8n-nodes-base.webhook")).toMatchObject({
      tier: "tier_1_verified",
      nodeType: "n8n-nodes-base.webhook",
    })
    expect(getNodeCompatibility("n8n-nodes-base.scheduleTrigger")).toMatchObject({
      tier: "tier_1_verified",
      nodeType: "n8n-nodes-base.scheduleTrigger",
    })
    expect(getNodeCompatibility("n8n-nodes-base.set")).toMatchObject({
      tier: "tier_1_verified",
      nodeType: "n8n-nodes-base.set",
    })
    expect(getNodeCompatibility("n8n-nodes-base.if")).toMatchObject({
      tier: "tier_1_verified",
      nodeType: "n8n-nodes-base.if",
    })
    expect(getNodeCompatibility("n8n-nodes-base.httpRequest")).toMatchObject({
      tier: "tier_1_verified",
      nodeType: "n8n-nodes-base.httpRequest",
    })
  })

  it("keeps credential-heavy known nodes modeled instead of verified", () => {
    expect(getNodeCompatibility("n8n-nodes-base.slack")).toMatchObject({
      tier: "tier_2_modeled",
      nodeType: "n8n-nodes-base.slack",
    })
  })

  it("classifies unknown official nodes as tier 3 dynamic", () => {
    expect(getNodeCompatibility("n8n-nodes-base.unknownService")).toEqual({
      nodeType: "n8n-nodes-base.unknownService",
      displayName: "n8n-nodes-base.unknownService",
      tier: "tier_3_dynamic",
      scenarios: [],
      notes: ["Discovered dynamically through MCP; no committed compatibility scenario exists yet."],
    })
  })

  it("builds concise planner guidance from selected node types", () => {
    const guidance = buildNodeCompatibilityGuidance([
      "n8n-nodes-base.webhook",
      "n8n-nodes-base.slack",
      "n8n-nodes-base.unknownService",
    ])

    expect(guidance).toContain("Node compatibility guidance:")
    expect(guidance).toContain("n8n-nodes-base.webhook: tier_1_verified")
    expect(guidance).toContain("n8n-nodes-base.slack: tier_2_modeled")
    expect(guidance).toContain("n8n-nodes-base.unknownService: tier_3_dynamic")
    expect(guidance).toContain("Prefer tier_1_verified nodes when they satisfy the user request.")
  })

  it("returns warnings for dynamic nodes in a generated workflow", () => {
    const workflow: N8nWorkflow = {
      name: "Dynamic Workflow",
      active: false,
      nodes: [
        {
          name: "Known",
          type: "n8n-nodes-base.webhook",
          typeVersion: 2,
          position: [0, 0],
          parameters: {},
        },
        {
          name: "Dynamic",
          type: "n8n-nodes-base.unknownService",
          typeVersion: 1,
          position: [300, 0],
          parameters: {},
        },
      ],
      connections: {},
      settings: {},
      tags: [{ name: "opencode-n8n-builder" }],
    }

    expect(analyzeWorkflowNodeCompatibility(workflow)).toEqual([
      {
        code: "NODE_COMPATIBILITY_DYNAMIC",
        message:
          "Node Dynamic uses n8n-nodes-base.unknownService, which was discovered dynamically and has no committed compatibility scenario.",
        nodeName: "Dynamic",
      },
    ])
  })

  it("does not duplicate catalog node types", () => {
    const nodeTypes = nodeCompatibilityCatalog.map((entry) => entry.nodeType)
    expect(new Set(nodeTypes).size).toBe(nodeTypes.length)
  })
})
