import type { ManagedMarker } from "./types.js"
import type { N8nWorkflow } from "./validator.js"
import { workflowPlanSchema, type WorkflowPlan } from "./workflow-plan.js"

type CompileWorkflowPlanInput = {
  plan: WorkflowPlan
  marker: ManagedMarker
}

export function compileWorkflowPlan(input: CompileWorkflowPlanInput): N8nWorkflow {
  const plan = workflowPlanSchema.parse(input.plan)
  const keyToName = new Map(plan.nodes.map((node) => [node.key, node.name]))

  const nodes = plan.nodes.map((node, index) => ({
    id: `${index + 1}`,
    name: node.name,
    type: node.type,
    typeVersion: node.typeVersion,
    position: node.position,
    parameters: node.parameters ?? {},
    credentials: node.credential
      ? {
          [node.credential.type]: {
            name: node.credential.name,
          },
        }
      : undefined,
  }))

  const connections: N8nWorkflow["connections"] = {}

  for (const connection of plan.connections) {
    const fromName = keyToName.get(connection.from) ?? connection.from
    const toName = keyToName.get(connection.to) ?? connection.to
    const output = connection.output ?? "main"
    const input = connection.input ?? "main"
    const outputIndex = connection.outputIndex ?? 0
    const inputIndex = connection.inputIndex ?? 0

    connections[fromName] ??= {}
    connections[fromName][output] ??= []
    connections[fromName][output][outputIndex] ??= []
    connections[fromName][output][outputIndex].push({
      node: toName,
      type: input,
      index: inputIndex,
    })
  }

  return {
    name: plan.name,
    active: false,
    nodes,
    connections,
    settings: {},
    tags: [{ name: "opencode-n8n-builder" }],
    meta: input.marker,
  }
}
