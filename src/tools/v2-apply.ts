import type { ApiPluginConfig } from "../config.js"
import { N8nBuilderError } from "../errors.js"
import { stableHash } from "../hash.js"
import { validateWorkflowForSave, type N8nWorkflow, type WorkflowIssue } from "../validator.js"
import type { V2PlanStore } from "../v2/plan-store.js"
import type { V2PreviewStore } from "../v2/preview-store.js"
import type { V2WorkflowRegistry } from "../v2/registry.js"
import type { V2RegistryRecord, V2SimulationResult, V2Warning } from "../v2/types.js"

export type V2ApplyArgs = {
  previewId: string
  workflowId?: string
  confirm: boolean
}

export type V2ApplyResult = {
  workflowId: string
  name: string
  url: string
  mode: "create" | "update"
  previewId: string
  planId: string
  planVersion: number
  nodeCount: number
  workflowHash: string
  validationStatus: V2SimulationResult["status"]
  warnings: V2Warning[]
}

export async function applyV2Preview(input: {
  args: V2ApplyArgs
  config: Pick<ApiPluginConfig, "baseUrl" | "pluginVersion">
  api: {
    createWorkflow(workflow: N8nWorkflow): Promise<N8nWorkflow & { id: string }>
    getWorkflow?(workflowId: string): Promise<N8nWorkflow & { id: string }>
    updateWorkflow?(workflowId: string, workflow: N8nWorkflow): Promise<N8nWorkflow & { id: string }>
  }
  planStore: V2PlanStore
  previewStore: V2PreviewStore
  registry: V2WorkflowRegistry
  now?: () => Date
}): Promise<V2ApplyResult> {
  if (input.args.confirm !== true) {
    throw new N8nBuilderError("V2 apply requires explicit confirmation.", "V2_APPLY_CONFIRM_REQUIRED")
  }

  const preview = await input.previewStore.get(input.args.previewId)
  if (!preview) {
    throw new N8nBuilderError("V2 compiled preview was not found.", "V2_PREVIEW_NOT_FOUND", {
      previewId: input.args.previewId,
    })
  }

  if (preview.validationStatus === "failed") {
    throw new N8nBuilderError("V2 compiled preview is not valid for apply.", "V2_PREVIEW_NOT_VALID", {
      previewId: preview.previewId,
      planId: preview.planId,
      planVersion: preview.planVersion,
    })
  }

  const version = await input.planStore.get(preview.planId, preview.planVersion)
  if (!version) {
    throw new N8nBuilderError("V2 plan version was not found.", "V2_PLAN_NOT_FOUND", {
      planId: preview.planId,
      planVersion: preview.planVersion,
    })
  }

  const blockingCredentials = version.plan.credentialRequirements.filter(
    (credential) => credential.blocksApply && credential.status !== "available",
  )
  if (blockingCredentials.length > 0) {
    throw new N8nBuilderError("V2 plan has credential requirements that block apply.", "V2_CREDENTIALS_BLOCK_APPLY", {
      credentialRequirementIds: blockingCredentials.map((credential) => credential.id),
    })
  }

  const validation = validateWorkflowForSave({
    workflow: preview.workflow,
    requireManagedMarker: false,
  })
  if (!validation.valid) {
    throw new N8nBuilderError("V2 preview workflow failed validation during apply.", "V2_APPLY_INVALID", {
      issues: validation.issues,
      warnings: validation.warnings,
    })
  }

  if (input.args.workflowId) {
    return applyUpdate({
      workflowId: input.args.workflowId,
      input,
      preview,
      validationWarnings: validation.warnings.map(toV2Warning),
    })
  }

  const now = input.now?.() ?? new Date()
  const workflowToCreate: N8nWorkflow = {
    ...preview.workflow,
    active: false,
  }
  const created = await input.api.createWorkflow(workflowToCreate)
  const workflowHash = stableHash(created)
  const url = workflowUrl(input.config.baseUrl, created.id)

  await input.registry.upsert({
    workflowId: created.id,
    name: created.name,
    url,
    baseUrl: input.config.baseUrl,
    claimMode: "full",
    activeAtClaim: false,
    managedBy: "opencode-n8n-builder-v2",
    managedByVersion: input.config.pluginVersion,
    latestPlanId: preview.planId,
    latestPlanVersion: preview.planVersion,
    latestWorkflowHash: workflowHash,
    latestPreviewId: preview.previewId,
    lastValidationStatus: preview.validationStatus,
    lastUpdatedAt: now.toISOString(),
  } satisfies V2RegistryRecord)

  return {
    workflowId: created.id,
    name: created.name,
    url,
    mode: "create",
    previewId: preview.previewId,
    planId: preview.planId,
    planVersion: preview.planVersion,
    nodeCount: created.nodes.length,
    workflowHash,
    validationStatus: preview.validationStatus,
    warnings: [...preview.warnings, ...validation.warnings.map(toV2Warning)],
  }
}

async function applyUpdate(input: {
  workflowId: string
  input: {
    config: Pick<ApiPluginConfig, "baseUrl" | "pluginVersion">
    api: {
      getWorkflow?(workflowId: string): Promise<N8nWorkflow & { id: string }>
      updateWorkflow?(workflowId: string, workflow: N8nWorkflow): Promise<N8nWorkflow & { id: string }>
    }
    registry: V2WorkflowRegistry
    now?: () => Date
  }
  preview: {
    previewId: string
    planId: string
    planVersion: number
    workflow: N8nWorkflow
    workflowHash: string
    validationStatus: V2SimulationResult["status"]
    warnings: V2Warning[]
  }
  validationWarnings: V2Warning[]
}): Promise<V2ApplyResult> {
  const record = await input.input.registry.get(input.workflowId)
  if (!record) {
    throw new N8nBuilderError("V2 workflow was not claimed.", "V2_WORKFLOW_NOT_CLAIMED", {
      workflowId: input.workflowId,
    })
  }

  if (record.baseUrl !== input.input.config.baseUrl) {
    throw new N8nBuilderError("V2 registry record belongs to a different n8n base URL.", "V2_REGISTRY_BASE_URL_MISMATCH", {
      workflowId: input.workflowId,
      registryBaseUrl: record.baseUrl,
      configuredBaseUrl: input.input.config.baseUrl,
    })
  }

  if (record.claimMode !== "full") {
    throw new N8nBuilderError("V2 apply cannot update a read-only claimed workflow.", "V2_APPLY_READ_ONLY_CLAIM", {
      workflowId: input.workflowId,
      claimMode: record.claimMode,
    })
  }

  if (!input.input.api.getWorkflow || !input.input.api.updateWorkflow) {
    throw new N8nBuilderError("V2 apply update requires workflow read and update API methods.", "V2_APPLY_UPDATE_UNSUPPORTED", {
      workflowId: input.workflowId,
    })
  }

  const currentWorkflow = await input.input.api.getWorkflow(input.workflowId)
  if (currentWorkflow.active) {
    throw new N8nBuilderError("V2 apply cannot structurally update an active workflow.", "V2_APPLY_ACTIVE_WORKFLOW", {
      workflowId: input.workflowId,
    })
  }

  const currentWorkflowHash = stableHash(currentWorkflow)
  if (record.latestWorkflowHash && currentWorkflowHash !== record.latestWorkflowHash) {
    throw new N8nBuilderError("V2 claimed workflow has changed since the last registry hash.", "V2_APPLY_WORKFLOW_STALE", {
      workflowId: input.workflowId,
      expectedWorkflowHash: record.latestWorkflowHash,
      currentWorkflowHash,
    })
  }

  const now = input.input.now?.() ?? new Date()
  const workflowToUpdate: N8nWorkflow = {
    ...input.preview.workflow,
    active: false,
  }
  const updated = await input.input.api.updateWorkflow(input.workflowId, workflowToUpdate)
  const workflowHash = stableHash(updated)
  const url = workflowUrl(input.input.config.baseUrl, updated.id)

  await input.input.registry.upsert({
    workflowId: updated.id,
    name: updated.name,
    url,
    baseUrl: input.input.config.baseUrl,
    claimMode: "full",
    activeAtClaim: record.activeAtClaim,
    managedBy: "opencode-n8n-builder-v2",
    managedByVersion: input.input.config.pluginVersion,
    latestPlanId: input.preview.planId,
    latestPlanVersion: input.preview.planVersion,
    latestWorkflowHash: workflowHash,
    latestPreviewId: input.preview.previewId,
    lastValidationStatus: input.preview.validationStatus,
    lastUpdatedAt: now.toISOString(),
  } satisfies V2RegistryRecord)

  return {
    workflowId: updated.id,
    name: updated.name,
    url,
    mode: "update",
    previewId: input.preview.previewId,
    planId: input.preview.planId,
    planVersion: input.preview.planVersion,
    nodeCount: updated.nodes.length,
    workflowHash,
    validationStatus: input.preview.validationStatus,
    warnings: [...input.preview.warnings, ...input.validationWarnings],
  }
}

function workflowUrl(baseUrl: string, workflowId: string): string {
  const appBaseUrl = baseUrl.replace(/\/api\/v\d+\/?$/i, "").replace(/\/+$/, "")
  return `${appBaseUrl}/workflow/${encodeURIComponent(workflowId)}`
}

function toV2Warning(issue: WorkflowIssue): V2Warning {
  return {
    code: issue.code,
    message: issue.message,
  }
}
