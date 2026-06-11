import type { V2Plan, V2PlanReview, V2SimulationResult, V2ValidationIssue, V2Warning } from "./types.js"
import { createPatternFirstV2Plan } from "./pattern-planner.js"

export type CreateInitialV2PlanInput = {
  prompt: string
  name?: string
}

export type ReviewV2PlanInput = {
  planId: string
  planVersion: number
  plan: V2Plan
}

export type PatchV2PlanInput = {
  plan: V2Plan
  patch: string
}

export type ValidateAndSimulateV2PlanInput = {
  planId: string
  planVersion: number
  plan: V2Plan
  checkedAt: string
}

export function createInitialV2Plan(input: CreateInitialV2PlanInput): V2Plan {
  return createPatternFirstV2Plan(input)
}

export function reviewV2Plan(input: ReviewV2PlanInput): V2PlanReview {
  return {
    planId: input.planId,
    planVersion: input.planVersion,
    summary: `Plan contains ${input.plan.patterns.length} pattern(s), ${input.plan.steps.length} step(s), and ${input.plan.testContract.examples.length} example(s).`,
    patternReviews: input.plan.patterns.map((pattern) => ({
      patternId: pattern.id,
      family: pattern.family,
      decision: pattern.summary,
      confidence: pattern.confidence,
      riskLevel: pattern.riskLevel,
    })),
    assumptions: [...input.plan.trace],
    risks: input.plan.warnings.map((warning) => warning.message),
    openQuestions: input.plan.confidence === "low" ? ["Plan confidence is low; review required before compile."] : [],
    simulationCoverage: [
      `${input.plan.testContract.examples.length} example(s) available for control-flow and field-flow checks.`,
    ],
    confidence: input.plan.confidence,
    riskLevel: input.plan.riskLevel,
  }
}

export function patchV2Plan(input: PatchV2PlanInput): V2Plan {
  const warning: V2Warning = {
    code: "PATCH_REQUIRES_REVALIDATION",
    message: "Plan was patched and must be validated and simulated before compile.",
  }

  return {
    ...input.plan,
    confidence: input.plan.confidence === "high" ? "medium" : input.plan.confidence,
    warnings: [...input.plan.warnings, warning],
    trace: [...input.plan.trace, `Patch request: ${input.patch.trim()}`],
  }
}

export function validateAndSimulateV2Plan(input: ValidateAndSimulateV2PlanInput): V2SimulationResult {
  const issues = validatePlan(input.plan)
  const status: V2SimulationResult["status"] =
    issues.some((issue) => issue.severity === "error") ? "failed" : issues.length > 0 ? "warning" : "passed"

  return {
    planId: input.planId,
    planVersion: input.planVersion,
    status,
    checkedAt: input.checkedAt,
    issues,
    sampleResults:
      status === "failed"
        ? []
        : input.plan.testContract.examples.map((example) => ({
            name: example.name,
            status: "passed",
            path: input.plan.steps.map((step) => step.id),
          })),
    fieldTraces:
      status === "failed"
        ? []
        : input.plan.entities.flatMap((entity) =>
            Object.keys(entity.fields).map((field) => ({
              field,
              source: entity.name,
              target: input.plan.outputs[0]?.id ?? "unknown",
            })),
          ),
  }
}

function validatePlan(plan: V2Plan): V2ValidationIssue[] {
  const issues: V2ValidationIssue[] = []

  if (plan.inputs.length === 0) {
    issues.push({
      code: "V2_INPUT_REQUIRED",
      message: "Plan requires at least one input.",
      severity: "error",
    })
  }
  if (plan.steps.length === 0) {
    issues.push({
      code: "V2_STEP_REQUIRED",
      message: "Plan requires at least one business step.",
      severity: "error",
    })
  }
  if (plan.patterns.length === 0) {
    issues.push({
      code: "V2_PATTERN_REQUIRED",
      message: "Plan requires at least one pattern.",
      severity: "error",
    })
  }
  if (plan.outputs.length === 0) {
    issues.push({
      code: "V2_OUTPUT_REQUIRED",
      message: "Plan requires at least one output.",
      severity: "error",
    })
  }
  if (plan.testContract.examples.length === 0) {
    issues.push({
      code: "V2_TEST_EXAMPLE_REQUIRED",
      message: "Plan requires at least one test example for simulation.",
      severity: "error",
    })
  }

  const patternIds = new Set(plan.patterns.map((pattern) => pattern.id))
  const inputRefs = new Set([...plan.inputs.map((input) => input.id), ...plan.entities.map((entity) => entity.name)])
  const outputRefs = new Set([...plan.outputs.map((output) => output.id), ...plan.entities.map((entity) => entity.name)])
  const stepIds = new Set(plan.steps.map((step) => step.id))

  for (const step of plan.steps) {
    for (const patternId of step.patternIds) {
      if (!patternIds.has(patternId)) {
        issues.push({
          code: "V2_PATTERN_REF_UNKNOWN",
          message: `Step references unknown pattern "${patternId}".`,
          severity: "error",
          stepId: step.id,
          patternId,
        })
      }
    }

    for (const inputRef of step.inputRefs) {
      if (!inputRefs.has(inputRef)) {
        issues.push({
          code: "V2_INPUT_REF_UNKNOWN",
          message: `Step references unknown input "${inputRef}".`,
          severity: "error",
          stepId: step.id,
        })
      }
    }

    for (const outputRef of step.outputRefs) {
      if (!outputRefs.has(outputRef)) {
        issues.push({
          code: "V2_OUTPUT_REF_UNKNOWN",
          message: `Step references unknown output "${outputRef}".`,
          severity: "error",
          stepId: step.id,
        })
      }
    }
  }

  for (const branch of plan.branches) {
    if (!stepIds.has(branch.sourceStepId)) {
      issues.push({
        code: "V2_BRANCH_STEP_UNKNOWN",
        message: `Branch references unknown source step "${branch.sourceStepId}".`,
        severity: "error",
      })
    }
    if (!stepIds.has(branch.targetStepId)) {
      issues.push({
        code: "V2_BRANCH_STEP_UNKNOWN",
        message: `Branch references unknown target step "${branch.targetStepId}".`,
        severity: "error",
      })
    }
  }

  for (const loop of plan.loops) {
    if (!stepIds.has(loop.sourceStepId)) {
      issues.push({
        code: "V2_LOOP_STEP_UNKNOWN",
        message: `Loop references unknown source step "${loop.sourceStepId}".`,
        severity: "error",
      })
    }
  }

  return issues
}
