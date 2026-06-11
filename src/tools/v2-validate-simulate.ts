import { N8nBuilderError } from "../errors.js"
import { validateAndSimulateV2Plan } from "../v2/plan-service.js"
import type { V2PlanStore } from "../v2/plan-store.js"
import type { V2SimulationResult } from "../v2/types.js"

export type V2ValidateSimulateArgs = {
  planId: string
  planVersion: number
}

export async function validateSimulateV2Plan(input: {
  args: V2ValidateSimulateArgs
  planStore: V2PlanStore
  now?: () => Date
}): Promise<V2SimulationResult> {
  const now = input.now ?? (() => new Date())
  const version = await input.planStore.get(input.args.planId, input.args.planVersion)
  if (!version) {
    throw new N8nBuilderError("V2 plan version was not found.", "V2_PLAN_NOT_FOUND", {
      planId: input.args.planId,
      planVersion: input.args.planVersion,
    })
  }

  return validateAndSimulateV2Plan({
    planId: version.planId,
    planVersion: version.planVersion,
    plan: version.plan,
    checkedAt: now().toISOString(),
  })
}
