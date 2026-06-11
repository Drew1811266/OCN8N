import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { compileV2Preview } from "../src/tools/v2-compile-preview.js"
import { createV2Plan } from "../src/tools/v2-create-plan.js"
import { runV2Trial } from "../src/tools/v2-run-trial.js"
import { V2PlanStore } from "../src/v2/plan-store.js"
import { V2PreviewStore } from "../src/v2/preview-store.js"
import { V2RunStore } from "../src/v2/run-store.js"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ocn8n-v2-run-trial-"))
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

function runStore(): V2RunStore {
  return new V2RunStore(path.join(dir, ".opencode", "n8n-v2", "runs"))
}

async function createPreview(stores = { plans: planStore(), previews: previewStore() }) {
  const created = await createV2Plan({
    args: {
      prompt: "Receive an order webhook and respond to the webhook.",
      name: "Trial order intake",
    },
    planStore: stores.plans,
    now: () => new Date("2026-06-11T05:00:00.000Z"),
  })

  const preview = await compileV2Preview({
    args: {
      planId: created.planId,
      planVersion: created.planVersion,
    },
    planStore: stores.plans,
    previewStore: stores.previews,
    pluginVersion: "2.0.0",
    now: () => new Date("2026-06-11T05:01:00.000Z"),
  })

  return { created, preview, ...stores }
}

describe("runV2Trial", () => {
  it("requires explicit confirmation before reading artifacts", async () => {
    await expect(
      runV2Trial({
        args: { previewId: "123e4567-e89b-12d3-a456-426614174000", mode: "dry_run", confirm: false },
        planStore: planStore(),
        previewStore: previewStore(),
        runStore: runStore(),
      }),
    ).rejects.toMatchObject({ code: "V2_TRIAL_CONFIRM_REQUIRED" })
  })

  it("runs a dry-run trial from a compiled preview without triggering n8n", async () => {
    const stores = { plans: planStore(), previews: previewStore(), runs: runStore() }
    const { preview } = await createPreview({ plans: stores.plans, previews: stores.previews })

    const result = await runV2Trial({
      args: {
        previewId: preview.previewId,
        mode: "dry_run",
        confirm: true,
        sampleName: "valid order",
      },
      planStore: stores.plans,
      previewStore: stores.previews,
      runStore: stores.runs,
      now: () => new Date("2026-06-11T05:02:00.000Z"),
    })

    expect(result).toEqual(
      expect.objectContaining({
        previewId: preview.previewId,
        planId: preview.planId,
        planVersion: preview.planVersion,
        mode: "dry_run",
        status: "passed",
        triggered: false,
        cleanupRequired: false,
        executionMode: "not_triggered",
        sampleName: "valid order",
      }),
    )
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "V2_TRIAL_DRY_RUN_ONLY" })]),
    )

    const artifact = await stores.runs.get(result.runId)
    expect(artifact).toEqual(expect.objectContaining({ runId: result.runId, triggered: false }))
    expect(artifact?.simulation.status).toBe("passed")
  })

  it("rejects unknown sample names", async () => {
    const stores = { plans: planStore(), previews: previewStore(), runs: runStore() }
    const { preview } = await createPreview({ plans: stores.plans, previews: stores.previews })

    await expect(
      runV2Trial({
        args: {
          previewId: preview.previewId,
          mode: "dry_run",
          confirm: true,
          sampleName: "missing sample",
        },
        planStore: stores.plans,
        previewStore: stores.previews,
        runStore: stores.runs,
      }),
    ).rejects.toMatchObject({ code: "V2_TRIAL_SAMPLE_NOT_FOUND" })
  })

  it("rejects missing previews", async () => {
    await expect(
      runV2Trial({
        args: { previewId: "123e4567-e89b-12d3-a456-426614174000", mode: "dry_run", confirm: true },
        planStore: planStore(),
        previewStore: previewStore(),
        runStore: runStore(),
      }),
    ).rejects.toMatchObject({ code: "V2_PREVIEW_NOT_FOUND" })
  })
})
