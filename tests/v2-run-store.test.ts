import { access, mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { V2RunStore, type SaveV2TrialRunArtifactInput } from "../src/v2/run-store.js"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ocn8n-v2-run-store-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function runsDir(): string {
  return path.join(dir, ".opencode", "n8n-v2", "runs")
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function runInput(overrides: Partial<SaveV2TrialRunArtifactInput> = {}): SaveV2TrialRunArtifactInput {
  return {
    mode: "dry_run",
    previewId: "123e4567-e89b-12d3-a456-426614174000",
    planId: "223e4567-e89b-12d3-a456-426614174000",
    planVersion: 1,
    workflowHash: "workflow_hash",
    status: "passed",
    triggered: false,
    executionMode: "not_triggered",
    cleanupRequired: false,
    simulation: {
      planId: "223e4567-e89b-12d3-a456-426614174000",
      planVersion: 1,
      status: "passed",
      checkedAt: "2026-06-11T05:00:00.000Z",
      issues: [],
      sampleResults: [{ name: "valid order", status: "passed", path: ["step_receive"] }],
      fieldTraces: [],
    },
    sampleName: "valid order",
    warnings: [{ code: "V2_TRIAL_DRY_RUN_ONLY", message: "Dry-run trial did not trigger n8n." }],
    provenance: ["Dry-run trial re-ran local simulation."],
    startedAt: "2026-06-11T05:00:00.000Z",
    completedAt: "2026-06-11T05:00:00.000Z",
    summary: "Dry-run trial passed without triggering n8n.",
    ...overrides,
  }
}

describe("V2RunStore", () => {
  it("saves and reads immutable run artifacts", async () => {
    const store = new V2RunStore(runsDir())
    const saved = await store.save(runInput())

    expect(saved.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(await pathExists(path.join(runsDir(), `${saved.runId}.json`))).toBe(true)
    await expect(store.get(saved.runId)).resolves.toEqual(saved)
  })

  it("redacts secret-looking values before persistence", async () => {
    const store = new V2RunStore(runsDir())
    const saved = await store.save(
      runInput({
        provenance: ["Trial input included Authorization: Bearer trial-secret"],
        summary: "Dry-run token=summary-secret",
      }),
    )

    const raw = await readFile(path.join(runsDir(), `${saved.runId}.json`), "utf8")
    expect(raw).not.toContain("trial-secret")
    expect(raw).not.toContain("summary-secret")
    expect(raw).toContain("[REDACTED]")
  })

  it("does not overwrite existing run artifacts", async () => {
    const fixedId = "123e4567-e89b-12d3-a456-426614174000"
    const store = new V2RunStore(runsDir(), () => fixedId)
    const first = await store.save(runInput())

    await expect(store.save(runInput({ planVersion: 2 }))).rejects.toMatchObject({
      code: "V2_RUN_EXISTS",
    })
    expect(await store.get(fixedId)).toEqual(first)
  })

  it("returns undefined for unsafe IDs and malformed artifacts", async () => {
    const store = new V2RunStore(runsDir())

    expect(await store.get("../../outside")).toBeUndefined()
    expect(await store.get("123e4567-e89b-12d3-a456-426614174000")).toBeUndefined()
  })
})
