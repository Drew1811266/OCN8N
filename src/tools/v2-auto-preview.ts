import { N8nBuilderError } from "../errors.js"
import type { McpWorkflowValidator } from "../mcp-workflow-validation.js"
import type { V2PlanStore } from "../v2/plan-store.js"
import type { V2McpValidationStatus, V2PreviewMappingTrace, V2PreviewStore } from "../v2/preview-store.js"
import type { V2Confidence, V2PlanReview, V2RiskLevel, V2SimulationResult, V2Warning } from "../v2/types.js"
import { compileV2Preview, type V2CompilePreviewResult } from "./v2-compile-preview.js"
import { createV2Plan, type V2CreatePlanArgs } from "./v2-create-plan.js"
import { reviewV2PlanTool } from "./v2-review-plan.js"
import { validateSimulateV2Plan } from "./v2-validate-simulate.js"

export type V2AutoPreviewArgs = V2CreatePlanArgs

export type V2AutoPreviewResult = {
  planId: string
  planVersion: number
  summary: string
  previewId: string
  workflowName: string
  nodeCount: number
  workflowHash: string
  validationStatus: V2SimulationResult["status"]
  mcpValidationStatus: V2McpValidationStatus
  confidence: V2Confidence
  riskLevel: V2RiskLevel
  review: V2PlanReview
  simulation: V2SimulationResult
  mappingTrace: V2PreviewMappingTrace[]
  warnings: V2Warning[]
}

export async function autoPreviewV2Workflow(input: {
  args: V2AutoPreviewArgs
  planStore: V2PlanStore
  previewStore: V2PreviewStore
  pluginVersion: string
  mcp?: McpWorkflowValidator
  now?: () => Date
}): Promise<V2AutoPreviewResult> {
  if (input.args.prompt.trim().length === 0) {
    throw new N8nBuilderError("Auto preview requires a prompt.", "TOOL_ARGS_INVALID", { field: "prompt" })
  }

  const created = await createV2Plan({
    args: input.args,
    planStore: input.planStore,
    now: input.now,
  })
  const planRef = { planId: created.planId, planVersion: created.planVersion }
  const review = await reviewV2PlanTool({
    args: planRef,
    planStore: input.planStore,
  })
  const simulation = await validateSimulateV2Plan({
    args: planRef,
    planStore: input.planStore,
    now: input.now,
  })
  const preview: V2CompilePreviewResult = await compileV2Preview({
    args: planRef,
    planStore: input.planStore,
    previewStore: input.previewStore,
    pluginVersion: input.pluginVersion,
    mcp: input.mcp,
    now: input.now,
  })

  return {
    planId: created.planId,
    planVersion: created.planVersion,
    summary: created.summary,
    previewId: preview.previewId,
    workflowName: preview.workflowName,
    nodeCount: preview.nodeCount,
    workflowHash: preview.workflowHash,
    validationStatus: preview.validationStatus,
    mcpValidationStatus: preview.mcpValidationStatus,
    confidence: created.confidence,
    riskLevel: created.riskLevel,
    review,
    simulation,
    mappingTrace: preview.mappingTrace,
    warnings: mergeWarnings(created.warnings, preview.warnings),
  }
}

function mergeWarnings(...groups: V2Warning[][]): V2Warning[] {
  const seen = new Set<string>()
  const warnings: V2Warning[] = []

  for (const warning of groups.flat()) {
    const key = `${warning.code}:${warning.stepId ?? ""}:${warning.patternId ?? ""}:${warning.message}`
    if (!seen.has(key)) {
      seen.add(key)
      warnings.push(warning)
    }
  }

  return warnings
}
