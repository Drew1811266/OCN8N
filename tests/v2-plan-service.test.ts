import { describe, expect, it } from "vitest"
import {
  createInitialV2Plan,
  patchV2Plan,
  reviewV2Plan,
  validateAndSimulateV2Plan,
} from "../src/v2/plan-service.js"

describe("v2 plan service foundation", () => {
  it("creates a deterministic initial plan with trigger and output patterns", () => {
    const plan = createInitialV2Plan({
      prompt: "Receive an order webhook and return accepted true",
      name: "Order intake",
    })

    expect(plan.intent.goal).toBe("Receive an order webhook and return accepted true")
    expect(plan.patterns.map((pattern) => pattern.family)).toEqual(["trigger", "output"])
    expect(plan.testContract.examples).toEqual([
      {
        name: "default sample",
        input: { sample: true },
        expectedOutput: { accepted: true },
      },
    ])
    expect(plan.confidence).toBe("medium")
  })

  it("reviews plan decisions and simulation coverage", () => {
    const plan = createInitialV2Plan({ prompt: "Create a webhook workflow" })
    const review = reviewV2Plan({
      planId: "123e4567-e89b-12d3-a456-426614174000",
      planVersion: 1,
      plan,
    })

    expect(review.summary).toContain("2 pattern")
    expect(review.patternReviews).toHaveLength(2)
    expect(review.simulationCoverage).toContain("1 example(s) available for control-flow and field-flow checks.")
  })

  it("copies trace entries into review assumptions", () => {
    const plan = createInitialV2Plan({ prompt: "Create a webhook workflow" })
    const review = reviewV2Plan({
      planId: "123e4567-e89b-12d3-a456-426614174000",
      planVersion: 1,
      plan,
    })

    review.assumptions.push("mutated review")

    expect(plan.trace).not.toContain("mutated review")
  })

  it("patches a plan by appending trace and warning metadata", () => {
    const plan = createInitialV2Plan({ prompt: "Create a webhook workflow" })
    const patched = patchV2Plan({
      plan,
      patch: "Add fallback notification when validation fails",
    })

    expect(patched.trace.at(-1)).toBe("Patch request: Add fallback notification when validation fails")
    expect(patched.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "PATCH_REQUIRES_REVALIDATION",
        }),
      ]),
    )
  })

  it("validates required plan structure and simulates sample paths", () => {
    const plan = createInitialV2Plan({ prompt: "Create a webhook workflow" })
    const result = validateAndSimulateV2Plan({
      planId: "123e4567-e89b-12d3-a456-426614174000",
      planVersion: 1,
      plan,
      checkedAt: "2026-06-11T00:00:00.000Z",
    })

    expect(result.status).toBe("passed")
    expect(result.issues).toEqual([])
    expect(result.sampleResults).toEqual([
      {
        name: "default sample",
        status: "passed",
        path: ["step_trigger", "step_output"],
      },
    ])
  })

  it("returns validation errors when required structures are missing", () => {
    const plan = createInitialV2Plan({ prompt: "Create a webhook workflow" })
    const result = validateAndSimulateV2Plan({
      planId: "123e4567-e89b-12d3-a456-426614174000",
      planVersion: 1,
      plan: { ...plan, outputs: [], testContract: { examples: [], edgeCases: [] } },
      checkedAt: "2026-06-11T00:00:00.000Z",
    })

    expect(result.status).toBe("failed")
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "V2_OUTPUT_REQUIRED",
      "V2_TEST_EXAMPLE_REQUIRED",
      "V2_OUTPUT_REF_UNKNOWN",
    ])
  })

  it("returns validation errors for dangling plan references", () => {
    const plan = createInitialV2Plan({ prompt: "Create a webhook workflow" })
    const result = validateAndSimulateV2Plan({
      planId: "123e4567-e89b-12d3-a456-426614174000",
      planVersion: 1,
      plan: {
        ...plan,
        steps: [
          {
            ...plan.steps[0],
            patternIds: ["pattern_missing"],
            inputRefs: ["input_missing"],
            outputRefs: ["output_missing"],
          },
          plan.steps[1],
        ],
        branches: [
          {
            id: "branch_missing",
            sourceStepId: "step_missing_source",
            condition: "missing",
            targetStepId: "step_missing_target",
          },
        ],
        loops: [
          {
            id: "loop_missing",
            sourceStepId: "step_missing_loop",
            mode: "per_item",
            maxIterations: 1,
            termination: "done",
          },
        ],
      },
      checkedAt: "2026-06-11T00:00:00.000Z",
    })

    expect(result.status).toBe("failed")
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "V2_PATTERN_REF_UNKNOWN",
      "V2_INPUT_REF_UNKNOWN",
      "V2_OUTPUT_REF_UNKNOWN",
      "V2_BRANCH_STEP_UNKNOWN",
      "V2_BRANCH_STEP_UNKNOWN",
      "V2_LOOP_STEP_UNKNOWN",
    ])
    expect(result.issues[0]).toMatchObject({ code: "V2_PATTERN_REF_UNKNOWN", stepId: "step_trigger" })
    expect(result.issues[1]).toMatchObject({ code: "V2_INPUT_REF_UNKNOWN", stepId: "step_trigger" })
    expect(result.issues[2]).toMatchObject({ code: "V2_OUTPUT_REF_UNKNOWN", stepId: "step_trigger" })
  })
})
