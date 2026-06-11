import { createInitialV2Plan } from "../v2/plan-service.js"
import type { V2PlanStore } from "../v2/plan-store.js"
import type { V2Confidence, V2RiskLevel, V2Warning } from "../v2/types.js"

export type V2CreatePlanArgs = {
  prompt: string
  name?: string
}

export type V2CreatePlanResult = {
  planId: string
  planVersion: number
  summary: string
  patternCount: number
  confidence: V2Confidence
  riskLevel: V2RiskLevel
  warnings: V2Warning[]
}

export async function createV2Plan(input: {
  args: V2CreatePlanArgs
  planStore: V2PlanStore
  now?: () => Date
}): Promise<V2CreatePlanResult> {
  const now = input.now ?? (() => new Date())
  const plan = createInitialV2Plan(input.args)
  const version = await input.planStore.saveInitial({
    plan,
    createdAt: now().toISOString(),
    summary: `Created v2 plan for: ${input.args.prompt.trim()}`,
  })

  return {
    planId: version.planId,
    planVersion: version.planVersion,
    summary: version.summary,
    patternCount: version.plan.patterns.length,
    confidence: version.plan.confidence,
    riskLevel: version.plan.riskLevel,
    warnings: version.plan.warnings,
  }
}
