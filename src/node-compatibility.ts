import type { Warning } from "./types.js"
import type { N8nWorkflow } from "./validator.js"

export type NodeCompatibilityTier = "tier_1_verified" | "tier_2_modeled" | "tier_3_dynamic"

export type NodeCompatibilityEntry = {
  nodeType: string
  displayName: string
  tier: NodeCompatibilityTier
  scenarios: string[]
  notes: string[]
}

export const nodeCompatibilityCatalog: NodeCompatibilityEntry[] = [
  {
    nodeType: "n8n-nodes-base.manualTrigger",
    displayName: "Manual Trigger",
    tier: "tier_1_verified",
    scenarios: ["manual-set", "webhook-branch-merge"],
    notes: ["Safe trigger for deterministic local and E2E workflow scenarios."],
  },
  {
    nodeType: "n8n-nodes-base.webhook",
    displayName: "Webhook",
    tier: "tier_1_verified",
    scenarios: ["webhook-transform-response", "webhook-branch-merge"],
    notes: ["Verified for inactive draft creation and response-oriented workflow shapes."],
  },
  {
    nodeType: "n8n-nodes-base.scheduleTrigger",
    displayName: "Schedule Trigger",
    tier: "tier_1_verified",
    scenarios: ["schedule-http-filter-transform", "api-polling-error-notice"],
    notes: ["Verified for schedule-driven draft workflow scenarios without activation."],
  },
  {
    nodeType: "n8n-nodes-base.set",
    displayName: "Edit Fields / Set",
    tier: "tier_1_verified",
    scenarios: ["manual-set", "webhook-transform-response", "schedule-http-filter-transform"],
    notes: ["Verified with n8n-compatible assignments shape."],
  },
  {
    nodeType: "n8n-nodes-base.if",
    displayName: "IF",
    tier: "tier_1_verified",
    scenarios: ["schedule-http-filter-transform", "api-polling-error-notice"],
    notes: ["Verified with string and number condition examples."],
  },
  {
    nodeType: "n8n-nodes-base.switch",
    displayName: "Switch",
    tier: "tier_1_verified",
    scenarios: ["webhook-branch-merge"],
    notes: ["Verified for deterministic branch routing examples."],
  },
  {
    nodeType: "n8n-nodes-base.merge",
    displayName: "Merge",
    tier: "tier_1_verified",
    scenarios: ["webhook-branch-merge"],
    notes: ["Verified for reconnecting low-risk branches."],
  },
  {
    nodeType: "n8n-nodes-base.httpRequest",
    displayName: "HTTP Request",
    tier: "tier_1_verified",
    scenarios: ["schedule-http-filter-transform", "api-polling-error-notice"],
    notes: ["Verified with public URL examples that do not require credentials."],
  },
  {
    nodeType: "n8n-nodes-base.respondToWebhook",
    displayName: "Respond to Webhook",
    tier: "tier_1_verified",
    scenarios: ["webhook-transform-response"],
    notes: ["Verified as a terminal response node for webhook draft scenarios."],
  },
  {
    nodeType: "n8n-nodes-base.code",
    displayName: "Code",
    tier: "tier_2_modeled",
    scenarios: [],
    notes: ["Allowed only for narrow documented transformations; not used in default E2E scenarios."],
  },
  {
    nodeType: "n8n-nodes-base.slack",
    displayName: "Slack",
    tier: "tier_2_modeled",
    scenarios: [],
    notes: ["Credential-heavy notification node; unit fixtures may model it but Docker E2E does not authenticate it."],
  },
  {
    nodeType: "n8n-nodes-base.gmail",
    displayName: "Gmail",
    tier: "tier_2_modeled",
    scenarios: [],
    notes: ["OAuth-heavy node; v0.4 documents dynamic support but does not automate OAuth consent."],
  },
  {
    nodeType: "n8n-nodes-base.googleSheets",
    displayName: "Google Sheets",
    tier: "tier_2_modeled",
    scenarios: [],
    notes: ["OAuth-heavy node; v0.4 does not run real credential E2E for this node."],
  },
]

const catalogByNodeType = new Map(nodeCompatibilityCatalog.map((entry) => [entry.nodeType, entry]))

export function getNodeCompatibility(nodeType: string): NodeCompatibilityEntry {
  return (
    catalogByNodeType.get(nodeType) ?? {
      nodeType,
      displayName: nodeType,
      tier: "tier_3_dynamic",
      scenarios: [],
      notes: ["Discovered dynamically through MCP; no committed compatibility scenario exists yet."],
    }
  )
}

export function buildNodeCompatibilityGuidance(nodeTypes: string[]): string {
  const uniqueNodeTypes = [...new Set(nodeTypes)].filter((nodeType) => nodeType.trim().length > 0)
  const entries = uniqueNodeTypes.map(getNodeCompatibility)

  if (entries.length === 0) {
    return [
      "Node compatibility guidance:",
      "No specific node types were extracted from MCP search results.",
      "Prefer tier_1_verified nodes when they satisfy the user request.",
    ].join("\n")
  }

  return [
    "Node compatibility guidance:",
    "Prefer tier_1_verified nodes when they satisfy the user request.",
    "Use tier_2_modeled nodes when credentials or service-specific behavior are required.",
    "Use tier_3_dynamic nodes only when MCP documentation makes them necessary for the request.",
    ...entries.map((entry) => {
      const scenarios = entry.scenarios.length > 0 ? ` scenarios=${entry.scenarios.join(",")}` : ""
      return `- ${entry.nodeType}: ${entry.tier}; ${entry.displayName}.${scenarios}`
    }),
  ].join("\n")
}

export function analyzeWorkflowNodeCompatibility(workflow: N8nWorkflow): Warning[] {
  const warnings: Warning[] = []

  for (const node of workflow.nodes) {
    const compatibility = getNodeCompatibility(node.type)
    if (compatibility.tier !== "tier_3_dynamic") continue

    warnings.push({
      code: "NODE_COMPATIBILITY_DYNAMIC",
      message: `Node ${node.name} uses ${node.type}, which was discovered dynamically and has no committed compatibility scenario.`,
      nodeName: node.name,
    })
  }

  return warnings
}
