import { N8nBuilderError } from "../errors.js"
import type { WorkflowRegistryRecord } from "../registry.js"
import {
  validateWorkflowForSave,
  type N8nWorkflow,
  type WorkflowIssue,
  type WorkflowIssueCode,
} from "../validator.js"

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
  baseUrl: string
  api: {
    getWorkflow(workflowId: string): Promise<N8nWorkflow & { id: string }>
  }
  registry: {
    get(workflowId: string): Promise<WorkflowRegistryRecord | undefined>
  }
}

export async function inspectWorkflow(deps: InspectWorkflowDeps): Promise<InspectWorkflowResult> {
  const workflow = await deps.api.getWorkflow(deps.args.workflowId)
  const validation = validateWorkflowForSave({
    workflow,
    requireManagedMarker: true,
    allowActiveUpdate: false,
  })

  if (!validation.valid) {
    throw new N8nBuilderError(
      "Workflow cannot be inspected because it is not an inactive managed workflow.",
      "WORKFLOW_INSPECT_BLOCKED",
      redactedValidationDetails(deps.args.workflowId, validation),
    )
  }

  await requireRegistryOwnership(deps.registry, deps.args.workflowId, deps.baseUrl)

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

async function requireRegistryOwnership(
  registry: { get(workflowId: string): Promise<WorkflowRegistryRecord | undefined> },
  workflowId: string,
  baseUrl: string,
): Promise<void> {
  const record = await registry.get(workflowId)

  if (!record) {
    throw new N8nBuilderError(
      "Workflow cannot be inspected because it is not recorded in the local registry.",
      "WORKFLOW_INSPECT_BLOCKED",
      {
        workflowId,
        issues: [
          {
            code: "WORKFLOW_NOT_IN_REGISTRY",
            message: "Workflow is not recorded in the local OpenCode workflow registry.",
          },
        ],
        warnings: [],
      },
    )
  }

  if (record.baseUrl === baseUrl) return

  throw new N8nBuilderError(
    "Workflow cannot be inspected because its local registry record belongs to a different n8n base URL.",
    "WORKFLOW_INSPECT_BLOCKED",
    {
      workflowId,
      issues: [
        {
          code: "WORKFLOW_REGISTRY_BASE_URL_MISMATCH",
          message: "Workflow registry ownership does not match the configured n8n base URL.",
        },
      ],
      warnings: [],
    },
  )
}

function redactedValidationDetails(
  workflowId: string,
  validation: { issues: WorkflowIssue[]; warnings: WorkflowIssue[] },
): Record<string, unknown> {
  return {
    workflowId,
    issues: validation.issues.map((issue) => ({
      code: issue.code,
      message: redactedValidationMessage(issue.code),
    })),
    warnings: validation.warnings.map((warning) => ({
      code: warning.code,
      message: redactedValidationMessage(warning.code),
    })),
  }
}

function redactedValidationMessage(code: WorkflowIssueCode): string {
  switch (code) {
    case "UNMANAGED_WORKFLOW":
      return "Workflow is not marked as managed by opencode-n8n-builder."
    case "ACTIVE_WORKFLOW_BLOCKED":
      return "Active workflows are blocked from v1 inspection."
    case "DUPLICATE_NODE_NAME":
      return "Workflow contains duplicate node names."
    case "MISSING_CONNECTION_SOURCE":
      return "Workflow contains a connection from a missing source node."
    case "MISSING_CONNECTION_TARGET":
      return "Workflow contains a connection to a missing target node."
    case "PLAINTEXT_SECRET":
      return "Workflow contains a secret-looking parameter value."
    case "PRIVATE_NETWORK_HTTP_TARGET":
      return "Workflow contains a private network URL target."
  }
}
