import { N8nBuilderError } from "../errors.js"
import { patchV2Plan } from "../v2/plan-service.js"
import type { V2PlanStore } from "../v2/plan-store.js"
import type { V2Confidence, V2RiskLevel, V2Warning } from "../v2/types.js"

export type V2PatchPlanArgs = {
  planId: string
  planVersion: number
  patch: string
}

export type V2PatchPlanResult = {
  planId: string
  planVersion: number
  parentPlanVersion: number
  summary: string
  confidence: V2Confidence
  riskLevel: V2RiskLevel
  warnings: V2Warning[]
}

export async function patchV2PlanTool(input: {
  args: V2PatchPlanArgs
  planStore: V2PlanStore
  now?: () => Date
}): Promise<V2PatchPlanResult> {
  const now = input.now ?? (() => new Date())
  const version = await input.planStore.get(input.args.planId, input.args.planVersion)
  if (!version) {
    throw new N8nBuilderError("V2 plan version was not found.", "V2_PLAN_NOT_FOUND", {
      planId: input.args.planId,
      planVersion: input.args.planVersion,
    })
  }

  const patchedPlan = patchV2Plan({ plan: version.plan, patch: input.args.patch })
  const saved = await input.planStore.saveNext({
    planId: version.planId,
    parentPlanVersion: version.planVersion,
    plan: patchedPlan,
    createdAt: now().toISOString(),
    summary: `Patched v2 plan: ${input.args.patch.trim()}`,
  })

  return {
    planId: saved.planId,
    planVersion: saved.planVersion,
    parentPlanVersion: version.planVersion,
    summary: saved.summary,
    confidence: saved.plan.confidence,
    riskLevel: saved.plan.riskLevel,
    warnings: saved.plan.warnings,
  }
}
