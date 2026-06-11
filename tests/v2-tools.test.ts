import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createV2Plan } from "../src/tools/v2-create-plan.js"
import { patchV2PlanTool } from "../src/tools/v2-patch-plan.js"
import { reviewV2PlanTool } from "../src/tools/v2-review-plan.js"
import { validateSimulateV2Plan } from "../src/tools/v2-validate-simulate.js"
import { V2PlanStore } from "../src/v2/plan-store.js"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ocn8n-v2-tools-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function store(): V2PlanStore {
  return new V2PlanStore(path.join(dir, ".opencode", "n8n-v2", "plans"))
}

describe("v2 local plan tools", () => {
  it("creates, reviews, patches, and validates persisted plan artifacts", async () => {
    const planStore = store()
    const created = await createV2Plan({
      args: {
        prompt: "Receive an order webhook and return accepted true",
        name: "Order intake",
      },
      planStore,
      now: () => new Date("2026-06-11T00:00:00.000Z"),
    })

    expect(created.planVersion).toBe(1)
    expect(created.confidence).toBe("medium")
    const persistedCreated = await planStore.get(created.planId, created.planVersion)
    expect(persistedCreated).toMatchObject({
      planId: created.planId,
      planVersion: 1,
      source: "create",
      summary: "Created v2 plan for: Receive an order webhook and return accepted true",
    })

    const reviewed = await reviewV2PlanTool({
      args: {
        planId: created.planId,
        planVersion: created.planVersion,
      },
      planStore,
    })
    expect(reviewed.summary).toContain("2 pattern")

    const patched = await patchV2PlanTool({
      args: {
        planId: created.planId,
        planVersion: created.planVersion,
        patch: "Add fallback notification",
      },
      planStore,
      now: () => new Date("2026-06-11T00:05:00.000Z"),
    })
    expect(patched.planVersion).toBe(2)
    expect(patched.parentPlanVersion).toBe(1)
    const persistedPatched = await planStore.get(patched.planId, patched.planVersion)
    expect(persistedPatched).toMatchObject({
      planId: created.planId,
      planVersion: 2,
      parentPlanVersion: 1,
      source: "patch",
      summary: "Patched v2 plan: Add fallback notification",
    })

    const simulated = await validateSimulateV2Plan({
      args: {
        planId: created.planId,
        planVersion: patched.planVersion,
      },
      planStore,
      now: () => new Date("2026-06-11T00:06:00.000Z"),
    })
    expect(simulated.status).toBe("passed")
    expect(simulated.checkedAt).toBe("2026-06-11T00:06:00.000Z")
  })

  it("throws typed errors when plan versions are missing", async () => {
    const missingPlan = {
      planId: "123e4567-e89b-12d3-a456-426614174000",
      planVersion: 1,
    }
    const planStore = store()

    await expect(
      reviewV2PlanTool({
        args: missingPlan,
        planStore,
      }),
    ).rejects.toMatchObject({
      code: "V2_PLAN_NOT_FOUND",
      details: missingPlan,
    })

    await expect(
      patchV2PlanTool({
        args: {
          ...missingPlan,
          patch: "Add fallback notification",
        },
        planStore,
      }),
    ).rejects.toMatchObject({
      code: "V2_PLAN_NOT_FOUND",
      details: missingPlan,
    })

    await expect(
      validateSimulateV2Plan({
        args: missingPlan,
        planStore,
      }),
    ).rejects.toMatchObject({
      code: "V2_PLAN_NOT_FOUND",
      details: missingPlan,
    })
  })
})
