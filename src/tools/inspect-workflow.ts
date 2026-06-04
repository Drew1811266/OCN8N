import { validateWorkflowForSave, type N8nWorkflow, type WorkflowIssue } from "../validator.js"

export type InspectWorkflowArgs = {
  workflowId: string
}

export type WorkflowNodeSummary = {
  name: string
  type: string
  credentialTypes: string[]
}

export type WorkflowConnectionSummary = {
  source: string
  outputs: N8nWorkflow["connections"][string]
}

export type InspectWorkflowResult = {
  workflowId: string
  name: string
  active: boolean
  nodes: WorkflowNodeSummary[]
  connections: WorkflowConnectionSummary[]
  issues: WorkflowIssue[]
}

export type InspectWorkflowDeps = {
  args: InspectWorkflowArgs
  api: {
    getWorkflow(workflowId: string): Promise<N8nWorkflow & { id: string }>
  }
}

export async function inspectWorkflow(deps: InspectWorkflowDeps): Promise<InspectWorkflowResult> {
  const workflow = await deps.api.getWorkflow(deps.args.workflowId)
  const validation = validateWorkflowForSave({
    workflow,
    requireManagedMarker: true,
    allowActiveUpdate: true,
  })

  return {
    workflowId: workflow.id,
    name: workflow.name,
    active: workflow.active,
    nodes: workflow.nodes.map((node) => ({
      name: node.name,
      type: node.type,
      credentialTypes: Object.keys(node.credentials ?? {}),
    })),
    connections: Object.entries(workflow.connections ?? {}).map(([source, outputs]) => ({
      source,
      outputs,
    })),
    issues: validation.issues,
  }
}
