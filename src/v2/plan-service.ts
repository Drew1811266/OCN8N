import type { V2Plan, V2PlanReview, V2SimulationResult, V2ValidationIssue, V2Warning } from "./types.js"

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
  const goal = input.prompt.trim()

  return {
    intent: {
      goal,
      scope: [input.name ?? "Generated workflow preview"],
      nonGoals: ["active workflow structural editing"],
    },
    inputs: [
      {
        id: "input_webhook",
        mode: "webhook",
        schema: { sample: "boolean" },
        samples: [{ sample: true }],
      },
    ],
    entities: [{ name: "Payload", fields: { sample: "boolean" } }],
    steps: [
      {
        id: "step_trigger",
        name: "Receive input",
        summary: "Receive the incoming automation input.",
        patternIds: ["pattern_trigger"],
        inputRefs: ["input_webhook"],
        outputRefs: ["Payload"],
      },
      {
        id: "step_output",
        name: "Return output",
        summary: "Return an acknowledgement output.",
        patternIds: ["pattern_output"],
        inputRefs: ["Payload"],
        outputRefs: ["output_response"],
      },
    ],
    patterns: [
      {
        id: "pattern_trigger",
        family: "trigger",
        variant: "webhook",
        summary: "Receive an input payload.",
        confidence: "medium",
        riskLevel: "low",
        warnings: [],
      },
      {
        id: "pattern_output",
        family: "output",
        variant: "respond_to_webhook",
        summary: "Return a response to the caller.",
        confidence: "medium",
        riskLevel: "low",
        warnings: [],
      },
    ],
    branches: [],
    loops: [],
    externalCalls: [],
    errorPolicy: { strategy: "fail_fast", notifications: [] },
    outputs: [
      {
        id: "output_response",
        mode: "respond_to_webhook",
        contract: { accepted: "boolean" },
      },
    ],
    testContract: {
      examples: [
        {
          name: "default sample",
          input: { sample: true },
          expectedOutput: { accepted: true },
        },
      ],
      edgeCases: [],
    },
    credentialRequirements: [],
    confidence: "medium",
    riskLevel: "low",
    warnings: [],
    trace: [`Created foundation v2 plan from prompt: ${goal}`],
  }
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
    assumptions: input.plan.trace,
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

  return issues
}
