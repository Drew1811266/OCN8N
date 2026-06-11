import type { N8nWorkflow, N8nWorkflowNode } from "../validator.js"
import type { V2PreviewMappingTrace } from "./preview-store.js"
import type { V2Plan, V2Warning } from "./types.js"

export type CompileV2PlanToWorkflowPreviewInput = {
  plan: V2Plan
  pluginVersion: string
  createdAt: string
}

export type CompileV2PlanToWorkflowPreviewResult = {
  workflow: N8nWorkflow
  mappingTrace: V2PreviewMappingTrace[]
  warnings: V2Warning[]
}

export function compileV2PlanToWorkflowPreview(
  input: CompileV2PlanToWorkflowPreviewInput,
): CompileV2PlanToWorkflowPreviewResult {
  const nodes = input.plan.steps.map((step, index): N8nWorkflowNode => {
    const nodeType = nodeTypeForStep(input.plan, step)
    return {
      id: `${index + 1}`,
      name: step.name,
      type: nodeType,
      typeVersion: nodeTypeVersion(nodeType),
      position: [index * 300, 0],
      parameters: nodeParametersForStep(input.plan, step, nodeType),
    }
  })

  return {
    workflow: {
      name: input.plan.intent.scope[0] ?? "v2 workflow preview",
      active: false,
      nodes,
      connections: sequentialConnections(nodes),
      settings: {},
      tags: [{ name: "opencode-n8n-builder-v2" }],
      meta: {
        managedBy: "opencode-n8n-builder-v2",
        managedByVersion: input.pluginVersion,
        createdAt: input.createdAt,
      },
    },
    mappingTrace: input.plan.steps.map((step) => {
      const nodeType = nodeTypeForStep(input.plan, step)
      return {
        stepId: step.id,
        patternIds: [...step.patternIds],
        nodeNames: [step.name],
        notes: [`Compiled ${primaryPatternFamily(input.plan, step)} pattern(s) into ${nodeType}.`],
      }
    }),
    warnings: [...input.plan.warnings],
  }
}

function nodeTypeForStep(plan: V2Plan, step: V2Plan["steps"][number]): string {
  const families = patternFamiliesForStep(plan, step)

  if (families.includes("trigger")) {
    const trigger = plan.inputs[0]?.mode
    if (trigger === "webhook") return "n8n-nodes-base.webhook"
    if (trigger === "schedule" || trigger === "polling") return "n8n-nodes-base.scheduleTrigger"
    return "n8n-nodes-base.manualTrigger"
  }
  if (families.includes("transform")) return "n8n-nodes-base.set"
  if (families.includes("branch")) return "n8n-nodes-base.if"
  if (families.includes("loop_batch")) return "n8n-nodes-base.splitInBatches"
  if (families.includes("external_call")) return "n8n-nodes-base.httpRequest"
  if (families.includes("error_handling")) return "n8n-nodes-base.noOp"
  if (families.includes("output")) return "n8n-nodes-base.respondToWebhook"
  return "n8n-nodes-base.noOp"
}

function nodeTypeVersion(nodeType: string): number {
  switch (nodeType) {
    case "n8n-nodes-base.webhook":
      return 2
    case "n8n-nodes-base.httpRequest":
      return 4
    default:
      return 1
  }
}

function nodeParametersForStep(
  plan: V2Plan,
  step: V2Plan["steps"][number],
  nodeType: string,
): Record<string, unknown> {
  switch (nodeType) {
    case "n8n-nodes-base.webhook":
      return {
        httpMethod: "POST",
        path: `v2-preview/${step.id}`,
        responseMode: "responseNode",
      }
    case "n8n-nodes-base.scheduleTrigger":
      return {
        rule: { interval: [{ field: "hours", hoursInterval: 1 }] },
      }
    case "n8n-nodes-base.set":
      return {
        mode: "manual",
        assignments: {
          assignments: fieldAssignments(plan),
        },
      }
    case "n8n-nodes-base.if":
      return {
        conditions: {
          options: { caseSensitive: false },
          conditions: [{ leftValue: "={{$json.status}}", operation: "equals", rightValue: "ready" }],
        },
      }
    case "n8n-nodes-base.splitInBatches":
      return {
        batchSize: 25,
      }
    case "n8n-nodes-base.httpRequest":
      return {
        method: "POST",
        url: "https://api.example.com/fulfillment",
        sendBody: true,
        bodyParameters: {
          parameters: [{ name: "orderId", value: "={{$json.orderId}}" }],
        },
      }
    case "n8n-nodes-base.respondToWebhook":
      return {
        respondWith: "json",
        responseBody: { accepted: true },
      }
    default:
      return {
        note: step.summary,
      }
  }
}

function fieldAssignments(plan: V2Plan): Array<{ name: string; value: string }> {
  const entity = plan.entities[0]
  if (!entity) return []

  return Object.keys(entity.fields).map((field) => ({
    name: field,
    value: `={{$json.${field}}}`,
  }))
}

function sequentialConnections(nodes: N8nWorkflowNode[]): N8nWorkflow["connections"] {
  const connections: N8nWorkflow["connections"] = {}

  for (let index = 0; index < nodes.length - 1; index += 1) {
    const from = nodes[index]
    const to = nodes[index + 1]
    connections[from.name] = {
      main: [[{ node: to.name, type: "main", index: 0 }]],
    }
  }

  return connections
}

function patternFamiliesForStep(plan: V2Plan, step: V2Plan["steps"][number]): V2Plan["patterns"][number]["family"][] {
  const families = step.patternIds
    .map((patternId) => plan.patterns.find((pattern) => pattern.id === patternId)?.family)
    .filter((family): family is V2Plan["patterns"][number]["family"] => family !== undefined)

  return [...new Set(families)]
}

function primaryPatternFamily(plan: V2Plan, step: V2Plan["steps"][number]): string {
  return patternFamiliesForStep(plan, step)[0] ?? "unknown"
}
