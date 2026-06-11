import { N8nBuilderError } from "../errors.js"
import { validateWorkflowForSave, type WorkflowIssue } from "../validator.js"
import { validateAndSimulateV2Plan } from "../v2/plan-service.js"
import type { V2PlanStore } from "../v2/plan-store.js"
import type { V2PreviewMappingTrace, V2PreviewStore } from "../v2/preview-store.js"
import { compileV2PlanToWorkflowPreview } from "../v2/workflow-compiler.js"
import type { V2SimulationResult, V2Warning } from "../v2/types.js"

export type V2CompilePreviewArgs = {
  planId: string
  planVersion: number
}

export type V2CompilePreviewResult = {
  previewId: string
  planId: string
  planVersion: number
  workflowName: string
  nodeCount: number
  workflowHash: string
  validationStatus: V2SimulationResult["status"]
  mappingTrace: V2PreviewMappingTrace[]
  warnings: V2Warning[]
}

export async function compileV2Preview(input: {
  args: V2CompilePreviewArgs
  planStore: V2PlanStore
  previewStore: V2PreviewStore
  pluginVersion: string
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

  const preview = await input.previewStore.save({
    planId: version.planId,
    planVersion: version.planVersion,
    workflow: compiled.workflow,
    mappingTrace: compiled.mappingTrace,
    validationStatus: simulation.status,
    warnings: [...compiled.warnings, ...workflowValidation.warnings.map(toV2Warning)],
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
    mappingTrace: preview.mappingTrace,
    warnings: preview.warnings,
  }
}

function toV2Warning(issue: WorkflowIssue): V2Warning {
  return {
    code: issue.code,
    message: issue.message,
  }
}
