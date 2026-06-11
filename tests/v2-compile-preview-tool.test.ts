import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { stableHash } from "../src/hash.js"
import { compileV2Preview } from "../src/tools/v2-compile-preview.js"
import { createInitialV2Plan } from "../src/v2/plan-service.js"
import { V2PlanStore } from "../src/v2/plan-store.js"
import { V2PreviewStore } from "../src/v2/preview-store.js"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ocn8n-v2-compile-preview-tool-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function planStore(): V2PlanStore {
  return new V2PlanStore(path.join(dir, ".opencode", "n8n-v2", "plans"))
}

function previewStore(): V2PreviewStore {
  return new V2PreviewStore(path.join(dir, ".opencode", "n8n-v2", "previews"))
}

describe("compileV2Preview", () => {
  it("compiles and stores a preview for a valid plan version", async () => {
    const plans = planStore()
    const previews = previewStore()
    const version = await plans.saveInitial({
      plan: createInitialV2Plan({
        name: "Order fulfillment",
        prompt:
          "Create a webhook order workflow that maps fields, branches by status with a default path, calls an external fulfillment API with API key auth and mock response schema, retries failures, sends Slack notification, writes the result, and responds to the webhook.",
      }),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Initial plan",
    })

    const result = await compileV2Preview({
      args: { planId: version.planId, planVersion: version.planVersion },
      planStore: plans,
      previewStore: previews,
      pluginVersion: "2.0.0",
      now: () => new Date("2026-06-11T00:10:00.000Z"),
    })

    expect(result).toEqual(
      expect.objectContaining({
        planId: version.planId,
        planVersion: version.planVersion,
        validationStatus: "passed",
        nodeCount: 6,
        workflowName: "Order fulfillment",
      }),
    )
    expect(result.previewId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(result.mappingTrace).toEqual(
      expect.arrayContaining([expect.objectContaining({ stepId: "step_external_call" })]),
    )

    const stored = await previews.get(result.previewId)
    expect(stored?.workflowHash).toBe(result.workflowHash)
    expect(stored?.workflowHash).toBe(stableHash(stored?.workflow))
  })

  it("throws typed errors for missing and invalid plan versions", async () => {
    const plans = planStore()
    const previews = previewStore()
    const missingPlan = {
      planId: "123e4567-e89b-12d3-a456-426614174000",
      planVersion: 1,
    }

    await expect(
      compileV2Preview({
        args: missingPlan,
        planStore: plans,
        previewStore: previews,
        pluginVersion: "2.0.0",
      }),
    ).rejects.toMatchObject({ code: "V2_PLAN_NOT_FOUND", details: missingPlan })

    const invalid = await plans.saveInitial({
      plan: {
        ...createInitialV2Plan({ prompt: "Create a webhook workflow" }),
        outputs: [],
      },
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Invalid plan",
    })

    await expect(
      compileV2Preview({
        args: { planId: invalid.planId, planVersion: invalid.planVersion },
        planStore: plans,
        previewStore: previews,
        pluginVersion: "2.0.0",
      }),
    ).rejects.toMatchObject({ code: "V2_PLAN_NOT_VALID" })
  })
})
