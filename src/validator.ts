import { containsPlaintextSecret, isPrivateNetworkUrl } from "./security.js"

export type N8nWorkflowNode = {
  id?: string
  name: string
  type: string
  typeVersion: number
  position: [number, number]
  parameters: Record<string, unknown>
  credentials?: Record<string, { id?: string; name?: string }>
}

export type N8nWorkflowConnection = {
  node: string
  type: string
  index: number
}

export type N8nWorkflow = {
  id?: string
  name: string
  active: boolean
  nodes: N8nWorkflowNode[]
  connections: Record<string, Record<string, N8nWorkflowConnection[][]>>
  settings: Record<string, unknown>
  tags?: Array<{ name: string } | string>
  meta?: Record<string, unknown>
}

export type WorkflowIssueCode =
  | "DUPLICATE_NODE_NAME"
  | "MISSING_CONNECTION_SOURCE"
  | "MISSING_CONNECTION_TARGET"
  | "PLAINTEXT_SECRET"
  | "PRIVATE_NETWORK_HTTP_TARGET"
  | "UNMANAGED_WORKFLOW"
  | "ACTIVE_WORKFLOW_BLOCKED"

export type WorkflowIssue = {
  code: WorkflowIssueCode
  message: string
  nodeName?: string
}

export type ValidationResult = {
  valid: boolean
  issues: WorkflowIssue[]
  warnings: WorkflowIssue[]
}

export type ValidateWorkflowForSaveInput = {
  workflow: N8nWorkflow
  requireManagedMarker: boolean
  allowActiveUpdate?: boolean
}

export function validateWorkflowForSave(input: ValidateWorkflowForSaveInput): ValidationResult {
  const issues: WorkflowIssue[] = []
  const warnings: WorkflowIssue[] = []
  const nodeNames = collectNodeNames(input.workflow.nodes, issues)

  for (const node of input.workflow.nodes) {
    if (containsPlaintextSecret(node.parameters)) {
      issues.push({
        code: "PLAINTEXT_SECRET",
        message: `Node ${node.name} contains a secret-looking parameter value.`,
        nodeName: node.name,
      })
    }

    const url = node.parameters.url
    if (typeof url === "string" && isPrivateNetworkUrl(url)) {
      warnings.push({
        code: "PRIVATE_NETWORK_HTTP_TARGET",
        message: `Node ${node.name} points at a private network URL.`,
        nodeName: node.name,
      })
    }
  }

  validateConnections(input.workflow.connections, nodeNames, issues)

  if (input.requireManagedMarker && !isManagedWorkflow(input.workflow)) {
    issues.push({
      code: "UNMANAGED_WORKFLOW",
      message: "Workflow is not marked as managed by opencode-n8n-builder.",
    })
  }

  if (input.workflow.active && !input.allowActiveUpdate) {
    issues.push({
      code: "ACTIVE_WORKFLOW_BLOCKED",
      message: "Active workflows are blocked from v1 updates.",
    })
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
  }
}

export function isManagedWorkflow(workflow: N8nWorkflow): boolean {
  if (workflow.meta?.managedBy === "opencode-n8n-builder") {
    return true
  }

  return (workflow.tags ?? []).some((tag) => {
    const name = typeof tag === "string" ? tag : tag.name
    return name === "opencode-n8n-builder"
  })
}

function collectNodeNames(nodes: N8nWorkflowNode[], issues: WorkflowIssue[]): Set<string> {
  const nodeNames = new Set<string>()
  const duplicates = new Set<string>()

  for (const node of nodes) {
    if (nodeNames.has(node.name)) {
      duplicates.add(node.name)
    }

    nodeNames.add(node.name)
  }

  for (const duplicate of duplicates) {
    issues.push({
      code: "DUPLICATE_NODE_NAME",
      message: `Workflow contains duplicate node name ${duplicate}.`,
      nodeName: duplicate,
    })
  }

  return nodeNames
}

function validateConnections(
  connections: N8nWorkflow["connections"],
  nodeNames: Set<string>,
  issues: WorkflowIssue[],
): void {
  for (const [sourceName, byOutput] of Object.entries(connections)) {
    if (!nodeNames.has(sourceName)) {
      issues.push({
        code: "MISSING_CONNECTION_SOURCE",
        message: `Connection source ${sourceName} does not exist.`,
        nodeName: sourceName,
      })
    }

    for (const outputGroups of Object.values(byOutput)) {
      for (const group of outputGroups) {
        for (const connection of group) {
          if (!nodeNames.has(connection.node)) {
            issues.push({
              code: "MISSING_CONNECTION_TARGET",
              message: `Connection target ${connection.node} does not exist.`,
              nodeName: connection.node,
            })
          }
        }
      }
    }
  }
}
