import { N8nBuilderError } from "../errors.js"
import { stableHash } from "../hash.js"
import { validateWorkflowWithMcp, type McpWorkflowValidationResult } from "../mcp-workflow-validation.js"
import type { N8nExecutionSummary } from "../n8n-api-client.js"
import { analyzeWorkflowNodeCompatibility } from "../node-compatibility.js"
import type { WorkflowRegistryRecord } from "../registry.js"
import { redactSecrets } from "../security.js"
import type { Warning } from "../types.js"
import { validateWorkflowForSave, type N8nWorkflow, type WorkflowIssue } from "../validator.js"

const managedBy = "opencode-n8n-builder" as const

export type CheckWorkflowReadinessArgs =
  | { workflowId: string; mode: "preview"; confirm?: never; allowWarnings?: boolean }
  | { workflowId: string; mode: "activate"; confirm: boolean; allowWarnings?: boolean }
  | { workflowId: string; mode: "deactivate"; confirm: boolean; allowWarnings?: never }

export type ReadinessCheckStatus = "pass" | "warning" | "block"

export type ReadinessCheck = {
  code: string
  status: ReadinessCheckStatus
  message: string
  nodeName?: string
}

export type RuntimeDiagnostics = {
  supported: boolean
  executions: N8nExecutionSummary[]
  message?: string
}

export type CheckWorkflowReadinessResult = {
  workflowId: string
  name: string
  mode: CheckWorkflowReadinessArgs["mode"]
  active: boolean
  status: "ready" | "warning" | "blocked"
  checks: ReadinessCheck[]
  warnings: Warning[]
  diagnostics: RuntimeDiagnostics
  activation: {
    allowed: boolean
    requiresConfirmation: boolean
  }
}

export type CheckWorkflowReadinessDeps = {
  args: CheckWorkflowReadinessArgs
  config: {
    baseUrl: string
    pluginVersion: string
  }
  api: {
    getWorkflow(workflowId: string): Promise<N8nWorkflow & { id: string }>
    activateWorkflow?(workflowId: string): Promise<N8nWorkflow & { id: string }>
    deactivateWorkflow?(workflowId: string): Promise<N8nWorkflow & { id: string }>
    listExecutions?(input: { workflowId?: string; limit?: number }): Promise<N8nExecutionSummary[]>
  }
  registry: {
    get(workflowId: string): Promise<WorkflowRegistryRecord | undefined>
    upsert(record: WorkflowRegistryRecord): Promise<void>
  }
  mcp?: {
    validateWorkflowCode?(code: string): Promise<McpWorkflowValidationResult>
  }
  now?: () => Date
}

export async function checkWorkflowReadiness(
  deps: CheckWorkflowReadinessDeps,
): Promise<CheckWorkflowReadinessResult> {
  const workflow = await deps.api.getWorkflow(deps.args.workflowId)
  const validation = validateWorkflowForSave({
    workflow,
    requireManagedMarker: true,
    allowActiveUpdate: true,
  })

  if (validation.issues.some((issue) => issue.code === "UNMANAGED_WORKFLOW")) {
    throwReadinessBlocked(deps.args.workflowId, validation.issues, validation.warnings)
  }

  await requireRegistryOwnership(deps.registry, deps.args.workflowId, deps.config.baseUrl)

  const compatibilityWarnings = analyzeWorkflowNodeCompatibility(workflow)
  const checks: ReadinessCheck[] = [
    {
      code: "MANAGED_WORKFLOW",
      status: "pass",
      message: "Workflow is marked as managed by opencode-n8n-builder and recorded in the local registry.",
    },
    ...validation.issues.map(issueToBlockCheck),
    ...validation.warnings.map(issueToWarningCheck),
    ...compatibilityWarnings.map(warningToCheck),
    ...triggerReadinessChecks(workflow),
    await mcpValidationCheck(workflow, deps.mcp),
  ]
  const diagnostics = await runtimeDiagnostics(workflow.id, deps.api)
  const status = readinessStatus(checks)

  const previewResult = {
    workflowId: workflow.id,
    name: workflow.name,
    mode: deps.args.mode,
    active: workflow.active,
    status,
    checks,
    warnings: [...validation.warnings.map(issueToWarning), ...compatibilityWarnings],
    diagnostics,
    activation: {
      allowed: status === "ready",
      requiresConfirmation: true,
    },
  } satisfies CheckWorkflowReadinessResult

  if (deps.args.mode === "preview") return previewResult

  if (!deps.args.confirm) {
    throw new N8nBuilderError(`${deps.args.mode} requires confirm: true.`, "WORKFLOW_ACTIVATION_CONFIRMATION_REQUIRED", {
      field: "confirm",
    })
  }

  if (deps.args.mode === "activate") {
    if (!deps.api.activateWorkflow) {
      throw new N8nBuilderError("Activation API dependency is not configured.", "WORKFLOW_ACTIVATION_UNSUPPORTED")
    }
    if (status === "blocked" || (status === "warning" && !deps.args.allowWarnings)) {
      throw new N8nBuilderError("Workflow readiness checks did not pass for activation.", "WORKFLOW_ACTIVATION_BLOCKED", {
        checks,
      })
    }

    const activated = await deps.api.activateWorkflow(deps.args.workflowId)
    await upsertRegistryFromWorkflow(
      deps.registry,
      activated,
      deps.config.baseUrl,
      deps.config.pluginVersion,
      deps.now?.() ?? new Date(),
    )
    return {
      ...previewResult,
      active: activated.active,
      mode: "activate",
    }
  }

  if (!deps.api.deactivateWorkflow) {
    throw new N8nBuilderError("Deactivation API dependency is not configured.", "WORKFLOW_ACTIVATION_UNSUPPORTED")
  }
  const deactivated = await deps.api.deactivateWorkflow(deps.args.workflowId)
  await upsertRegistryFromWorkflow(
    deps.registry,
    deactivated,
    deps.config.baseUrl,
    deps.config.pluginVersion,
    deps.now?.() ?? new Date(),
  )
  return {
    ...previewResult,
    active: deactivated.active,
    mode: "deactivate",
  }
}

async function upsertRegistryFromWorkflow(
  registry: { upsert(record: WorkflowRegistryRecord): Promise<void> },
  workflow: N8nWorkflow & { id: string },
  baseUrl: string,
  pluginVersion: string,
  now: Date,
): Promise<void> {
  await registry.upsert({
    workflowId: workflow.id,
    name: workflow.name,
    url: workflowUrl(baseUrl, workflow.id),
    baseUrl,
    managedBy,
    managedByVersion: pluginVersion,
    lastPlanHash: stableHash(workflow),
    lastUpdatedAt: now.toISOString(),
  })
}

function workflowUrl(baseUrl: string, workflowId: string): string {
  const appBaseUrl = baseUrl.replace(/\/api\/v\d+\/?$/i, "").replace(/\/+$/, "")
  return `${appBaseUrl}/workflow/${encodeURIComponent(workflowId)}`
}

async function requireRegistryOwnership(
  registry: { get(workflowId: string): Promise<WorkflowRegistryRecord | undefined> },
  workflowId: string,
  baseUrl: string,
): Promise<void> {
  const record = await registry.get(workflowId)
  if (!record) {
    throw new N8nBuilderError(
      "Workflow readiness cannot be checked because it is not recorded locally.",
      "WORKFLOW_READINESS_BLOCKED",
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
    "Workflow readiness cannot be checked because its registry record belongs to another n8n base URL.",
    "WORKFLOW_READINESS_BLOCKED",
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

function throwReadinessBlocked(workflowId: string, issues: WorkflowIssue[], warnings: WorkflowIssue[]): never {
  throw new N8nBuilderError(
    "Workflow readiness cannot be checked because the workflow is not managed.",
    "WORKFLOW_READINESS_BLOCKED",
    {
      workflowId,
      issues,
      warnings,
    },
  )
}

function issueToBlockCheck(issue: WorkflowIssue): ReadinessCheck {
  return {
    code: issue.code,
    status: "block",
    message: issue.message,
    nodeName: issue.nodeName,
  }
}

function issueToWarningCheck(issue: WorkflowIssue): ReadinessCheck {
  return {
    code: issue.code,
    status: "warning",
    message: issue.message,
    nodeName: issue.nodeName,
  }
}

function warningToCheck(warning: Warning): ReadinessCheck {
  return {
    code: warning.code,
    status: "warning",
    message: warning.message,
    nodeName: warning.nodeName,
  }
}

function issueToWarning(issue: WorkflowIssue): Warning {
  return {
    code: issue.code,
    message: issue.message,
    nodeName: issue.nodeName,
  }
}

function triggerReadinessChecks(workflow: N8nWorkflow): ReadinessCheck[] {
  return workflow.nodes.flatMap((node): ReadinessCheck[] => {
    if (node.type === "n8n-nodes-base.webhook") {
      return [
        {
          code: "WEBHOOK_PRODUCTION_URL",
          status: workflow.active ? "pass" : "warning",
          message: workflow.active
            ? `Webhook node ${node.name} can use its production URL while the workflow is active.`
            : `Webhook node ${node.name} needs workflow activation before its production URL is usable.`,
          nodeName: node.name,
        },
      ]
    }

    if (node.type === "n8n-nodes-base.scheduleTrigger") {
      return [
        {
          code: "SCHEDULE_TRIGGER_ACTIVATION",
          status: workflow.active ? "pass" : "warning",
          message: workflow.active
            ? `Schedule node ${node.name} can run while the workflow is active.`
            : `Schedule node ${node.name} needs workflow activation before scheduled runs occur.`,
          nodeName: node.name,
        },
      ]
    }

    return []
  })
}

async function mcpValidationCheck(
  workflow: N8nWorkflow,
  mcp: CheckWorkflowReadinessDeps["mcp"],
): Promise<ReadinessCheck> {
  if (!mcp?.validateWorkflowCode) {
    return {
      code: "MCP_VALIDATION",
      status: "warning",
      message: "MCP workflow validation is not configured for this readiness check.",
    }
  }

  try {
    const redactedWorkflow = redactSecrets(workflow) as N8nWorkflow
    const warnings = await validateWorkflowWithMcp({
      mcp: { validateWorkflowCode: mcp.validateWorkflowCode },
      workflow: redactedWorkflow,
    })

    if (warnings.length > 0) {
      return {
        code: "MCP_VALIDATION",
        status: "warning",
        message: `MCP validation returned warnings: ${warnings.map((warning) => warning.message).join("; ")}`,
      }
    }

    return {
      code: "MCP_VALIDATION",
      status: "pass",
      message: "MCP workflow validation passed.",
    }
  } catch (error) {
    if (!(error instanceof N8nBuilderError)) {
      throw error
    }

    return {
      code: "MCP_VALIDATION",
      status: "block",
      message: error.message,
    }
  }
}

async function runtimeDiagnostics(
  workflowId: string,
  api: CheckWorkflowReadinessDeps["api"],
): Promise<RuntimeDiagnostics> {
  if (!api.listExecutions) {
    return {
      supported: false,
      executions: [],
      message: "Recent executions are unavailable because the API dependency does not provide execution listing.",
    }
  }

  try {
    return {
      supported: true,
      executions: await api.listExecutions({ workflowId, limit: 5 }),
    }
  } catch (error) {
    if (error instanceof N8nBuilderError && error.code === "N8N_API_ERROR") {
      return {
        supported: false,
        executions: [],
        message: "Recent executions are unavailable from the configured n8n API or API key scope.",
      }
    }

    throw error
  }
}

function readinessStatus(checks: ReadinessCheck[]): "ready" | "warning" | "blocked" {
  if (checks.some((check) => check.status === "block")) return "blocked"
  if (checks.some((check) => check.status === "warning")) return "warning"
  return "ready"
}
