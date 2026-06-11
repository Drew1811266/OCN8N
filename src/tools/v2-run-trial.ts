import { N8nBuilderError } from "../errors.js"
import { validateAndSimulateV2Plan } from "../v2/plan-service.js"
import type { V2PlanStore } from "../v2/plan-store.js"
import type { V2PreviewStore } from "../v2/preview-store.js"
import type { V2RunStore } from "../v2/run-store.js"
import type { V2SimulationResult, V2Warning } from "../v2/types.js"

export type V2RunTrialArgs = {
  previewId: string
  mode: "dry_run"
  confirm: boolean
  sampleName?: string
}

export type V2RunTrialResult = {
  runId: string
  mode: "dry_run"
  previewId: string
  planId: string
  planVersion: number
  status: V2SimulationResult["status"]
  triggered: false
  executionMode: "not_triggered"
  cleanupRequired: false
  sampleName?: string
  warnings: V2Warning[]
  summary: string
}

export async function runV2Trial(input: {
  args: V2RunTrialArgs
  planStore: V2PlanStore
  previewStore: V2PreviewStore
  runStore: V2RunStore
  now?: () => Date
}): Promise<V2RunTrialResult> {
  if (input.args.confirm !== true) {
    throw new N8nBuilderError("V2 trial requires explicit confirmation.", "V2_TRIAL_CONFIRM_REQUIRED", {
      previewId: input.args.previewId,
    })
  }

  if (input.args.mode !== "dry_run") {
    throw new N8nBuilderError("V2 trial only supports dry_run mode.", "V2_TRIAL_MODE_UNSUPPORTED", {
      mode: input.args.mode,
    })
  }

  const preview = await input.previewStore.get(input.args.previewId)
  if (!preview) {
    throw new N8nBuilderError("V2 compiled preview was not found.", "V2_PREVIEW_NOT_FOUND", {
      previewId: input.args.previewId,
    })
  }

  if (preview.validationStatus === "failed") {
    throw new N8nBuilderError("V2 compiled preview must be valid before trial.", "V2_PREVIEW_NOT_VALID", {
      previewId: preview.previewId,
    })
  }

  const version = await input.planStore.get(preview.planId, preview.planVersion)
  if (!version) {
    throw new N8nBuilderError("V2 plan version was not found.", "V2_PLAN_NOT_FOUND", {
      planId: preview.planId,
      planVersion: preview.planVersion,
    })
  }

  const now = input.now ?? (() => new Date())
  const startedAt = now().toISOString()
  const simulation = validateAndSimulateV2Plan({
    planId: version.planId,
    planVersion: version.planVersion,
    plan: version.plan,
    checkedAt: startedAt,
  })

  if (
    input.args.sampleName !== undefined &&
    !simulation.sampleResults.some((sample) => sample.name === input.args.sampleName)
  ) {
    throw new N8nBuilderError("V2 trial sample was not found.", "V2_TRIAL_SAMPLE_NOT_FOUND", {
      previewId: preview.previewId,
      sampleName: input.args.sampleName,
    })
  }

  const dryRunWarning: V2Warning = {
    code: "V2_TRIAL_DRY_RUN_ONLY",
    message: "Dry-run trial re-ran local validation/simulation and did not trigger n8n or external APIs.",
  }
  const warnings = dedupeWarnings([...preview.warnings, dryRunWarning])
  const summary = `Dry-run trial ${simulation.status} for preview ${preview.previewId}.`
  const completedAt = startedAt
  const run = await input.runStore.save({
    mode: "dry_run",
    previewId: preview.previewId,
    planId: version.planId,
    planVersion: version.planVersion,
    workflowHash: preview.workflowHash,
    status: simulation.status,
    triggered: false,
    executionMode: "not_triggered",
    cleanupRequired: false,
    simulation,
    sampleName: input.args.sampleName,
    warnings,
    provenance: [
      "Loaded immutable compiled preview artifact.",
      "Loaded immutable plan version artifact.",
      "Re-ran local v2 validation and simulation.",
      "Did not trigger n8n or external APIs.",
    ],
    startedAt,
    completedAt,
    summary,
  })

  return {
    runId: run.runId,
    mode: run.mode,
    previewId: run.previewId,
    planId: run.planId,
    planVersion: run.planVersion,
    status: run.status,
    triggered: false,
    executionMode: "not_triggered",
    cleanupRequired: false,
    sampleName: run.sampleName,
    warnings: run.warnings,
    summary: run.summary,
  }
}

function dedupeWarnings(warnings: V2Warning[]): V2Warning[] {
  const seen = new Set<string>()
  const deduped: V2Warning[] = []

  for (const warning of warnings) {
    const key = `${warning.code}:${warning.stepId ?? ""}:${warning.patternId ?? ""}:${warning.message}`
    if (!seen.has(key)) {
      seen.add(key)
      deduped.push(warning)
    }
  }

  return deduped
}
