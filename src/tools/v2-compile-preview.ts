import type { ApiPluginConfig } from "../config.js"
import { N8nBuilderError } from "../errors.js"
import { stableHash } from "../hash.js"
import { validateWorkflowWithMcp, type McpWorkflowValidator } from "../mcp-workflow-validation.js"
import { validateWorkflowForSave } from "../validator.js"
import type { N8nWorkflow } from "../validator.js"
import { validateAndSimulateV2Plan } from "../v2/plan-service.js"
import type { V2PlanStore } from "../v2/plan-store.js"
import type {
  V2McpValidationStatus,
  V2PreviewMappingTrace,
  V2PreviewStore,
  V2PreviewUpdateTarget,
  V2WorkflowDiff,
} from "../v2/preview-store.js"
import type { V2WorkflowRegistry } from "../v2/registry.js"
import { compileV2PlanToWorkflowPreview } from "../v2/workflow-compiler.js"
import type { V2SimulationResult, V2Warning } from "../v2/types.js"
import { createWorkflowDiff, hasWorkflowDiff } from "../workflow-diff.js"

export type { V2McpValidationStatus }

export type V2CompilePreviewArgs = {
  planId: string
  planVersion: number
  workflowId?: string
}

export type V2CompilePreviewResult = {
  previewId: string
  planId: string
  planVersion: number
  workflowName: string
  nodeCount: number
  workflowHash: string
  validationStatus: V2SimulationResult["status"]
  mcpValidationStatus: V2McpValidationStatus
  updateTarget?: V2PreviewUpdateTarget
  mappingTrace: V2PreviewMappingTrace[]
  warnings: V2Warning[]
}

export async function compileV2Preview(input: {
  args: V2CompilePreviewArgs
  planStore: V2PlanStore
  previewStore: V2PreviewStore
  pluginVersion: string
  config?: Pick<ApiPluginConfig, "baseUrl">
  api?: {
    getWorkflow?(workflowId: string): Promise<N8nWorkflow & { id: string }>
  }
  registry?: V2WorkflowRegistry
  mcp?: McpWorkflowValidator
  now?: () => Date
}): Promise<V2CompilePreviewResult> {
  const now = input.now ?? (() => new Date())
  const version = await input.planStore.get(input.args.planId, input.args.planVersion)
  if (!version) {
    throw new N8nBuilderError("V2 plan version was not found.", "V2_PLAN_NOT_FOUND", {
      planId: input.args.planId,
      planVersion: input.args.planVersion,
    })
  }

  const checkedAt = now().toISOString()
  const simulation = validateAndSimulateV2Plan({
    planId: version.planId,
    planVersion: version.planVersion,
    plan: version.plan,
    checkedAt,
  })

  if (simulation.status === "failed") {
    throw new N8nBuilderError("V2 plan must pass validation before compile preview.", "V2_PLAN_NOT_VALID", {
      planId: version.planId,
      planVersion: version.planVersion,
      issues: simulation.issues,
    })
  }

  const compiled = compileV2PlanToWorkflowPreview({
    plan: version.plan,
    pluginVersion: input.pluginVersion,
    createdAt: checkedAt,
  })
  const workflowValidation = validateWorkflowForSave({
    workflow: compiled.workflow,
    requireManagedMarker: false,
  })

  if (!workflowValidation.valid) {
    throw new N8nBuilderError("Compiled v2 workflow preview failed local validation.", "V2_PREVIEW_INVALID", {
      planId: version.planId,
      planVersion: version.planVersion,
      issues: workflowValidation.issues,
    })
  }

  const updateTarget = await resolveUpdateTarget({
    workflowId: input.args.workflowId,
    config: input.config,
    api: input.api,
    registry: input.registry,
    workflow: compiled.workflow,
  })
  const mcpWarnings = input.mcp
    ? await validateWorkflowWithMcp({
        mcp: input.mcp,
        workflow: compiled.workflow,
      })
    : []
  const mcpValidationStatus: V2McpValidationStatus = input.mcp
    ? mcpWarnings.length > 0
      ? "warning"
      : "passed"
    : "not_configured"

  const preview = await input.previewStore.save({
    planId: version.planId,
    planVersion: version.planVersion,
    workflow: compiled.workflow,
    mappingTrace: compiled.mappingTrace,
    validationStatus: simulation.status,
    mcpValidationStatus,
    ...(updateTarget ? { updateTarget } : {}),
    warnings: [...compiled.warnings, ...workflowValidation.warnings.map(toV2Warning), ...mcpWarnings.map(toV2Warning)],
    createdAt: checkedAt,
  })

  return {
    previewId: preview.previewId,
    planId: preview.planId,
    planVersion: preview.planVersion,
    workflowName: preview.workflow.name,
    nodeCount: preview.workflow.nodes.length,
    workflowHash: preview.workflowHash,
    validationStatus: preview.validationStatus,
    mcpValidationStatus: preview.mcpValidationStatus,
    ...(preview.updateTarget ? { updateTarget: preview.updateTarget } : {}),
    mappingTrace: preview.mappingTrace,
    warnings: preview.warnings,
  }
}

async function resolveUpdateTarget(input: {
  workflowId?: string
  config?: Pick<ApiPluginConfig, "baseUrl">
  api?: {
    getWorkflow?(workflowId: string): Promise<N8nWorkflow & { id: string }>
  }
  registry?: V2WorkflowRegistry
  workflow: N8nWorkflow
}): Promise<V2PreviewUpdateTarget | undefined> {
  if (!input.workflowId) return undefined

  if (!input.config || !input.api?.getWorkflow || !input.registry) {
    throw new N8nBuilderError("V2 compile update preview requires workflow read API and registry.", "V2_COMPILE_UPDATE_UNSUPPORTED", {
      workflowId: input.workflowId,
    })
  }

  const record = await input.registry.get(input.workflowId)
  if (!record) {
    throw new N8nBuilderError("V2 workflow was not claimed.", "V2_WORKFLOW_NOT_CLAIMED", {
      workflowId: input.workflowId,
    })
  }

  if (record.baseUrl !== input.config.baseUrl) {
    throw new N8nBuilderError("V2 registry record belongs to a different n8n base URL.", "V2_REGISTRY_BASE_URL_MISMATCH", {
      workflowId: input.workflowId,
      registryBaseUrl: record.baseUrl,
      configuredBaseUrl: input.config.baseUrl,
    })
  }

  if (record.claimMode !== "full") {
    throw new N8nBuilderError("V2 compile update preview requires a full v2 claim.", "V2_COMPILE_UPDATE_READ_ONLY_CLAIM", {
      workflowId: input.workflowId,
      claimMode: record.claimMode,
    })
  }

  const currentWorkflow = await input.api.getWorkflow(input.workflowId)
  if (currentWorkflow.active) {
    throw new N8nBuilderError("V2 compile update preview cannot target an active workflow.", "V2_COMPILE_UPDATE_ACTIVE_WORKFLOW", {
      workflowId: input.workflowId,
    })
  }

  const currentWorkflowHash = stableHash(currentWorkflow)
  if (record.latestWorkflowHash && currentWorkflowHash !== record.latestWorkflowHash) {
    throw new N8nBuilderError("V2 claimed workflow has changed since the last registry hash.", "V2_COMPILE_UPDATE_STALE", {
      workflowId: input.workflowId,
      expectedWorkflowHash: record.latestWorkflowHash,
      currentWorkflowHash,
    })
  }

  const proposedWorkflow: N8nWorkflow = {
    ...input.workflow,
    active: false,
  }
  const rawDiff = createWorkflowDiff(currentWorkflow, proposedWorkflow)
  const diff = toJsonSafeWorkflowDiff(rawDiff)

  return {
    workflowId: input.workflowId,
    name: currentWorkflow.name,
    url: record.url,
    currentWorkflowHash,
    ...(record.latestWorkflowHash ? { registryWorkflowHash: record.latestWorkflowHash } : {}),
    hasChanges: hasWorkflowDiff(rawDiff),
    diff,
  }
}

function toJsonSafeWorkflowDiff(diff: ReturnType<typeof createWorkflowDiff>): V2WorkflowDiff {
  return JSON.parse(JSON.stringify(diff, (_key, value) => (value === undefined ? null : value))) as V2WorkflowDiff
}

function toV2Warning(issue: { code: string; message: string }): V2Warning {
  return {
    code: issue.code,
    message: issue.message,
  }
}
