import { N8nBuilderError } from "../errors.js"
import { reviewV2Plan } from "../v2/plan-service.js"
import type { V2PlanStore } from "../v2/plan-store.js"
import type { V2PlanReview } from "../v2/types.js"

export type V2ReviewPlanArgs = {
  planId: string
  planVersion: number
}

export async function reviewV2PlanTool(input: {
  args: V2ReviewPlanArgs
  planStore: V2PlanStore
}): Promise<V2PlanReview> {
  const version = await input.planStore.get(input.args.planId, input.args.planVersion)
  if (!version) {
    throw new N8nBuilderError("V2 plan version was not found.", "V2_PLAN_NOT_FOUND", {
      planId: input.args.planId,
      planVersion: input.args.planVersion,
    })
  }

  return reviewV2Plan(version)
}
