import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { stableHash } from "../src/hash.js"
import { V2PlanStore } from "../src/v2/plan-store.js"
import type { V2Plan, V2PlanVersion } from "../src/v2/types.js"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ocn8n-v2-plan-store-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function plansDir(): string {
  return path.join(dir, ".opencode", "n8n-v2", "plans")
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function plan(overrides: Partial<V2Plan> = {}): V2Plan {
  return {
    intent: {
      goal: "Receive order payloads and return an acknowledgement.",
      scope: ["webhook input", "response output"],
      nonGoals: ["production activation"],
    },
    inputs: [
      {
        id: "input_webhook",
        mode: "webhook",
        schema: { orderId: "string" },
        samples: [{ orderId: "ord_1" }],
      },
    ],
    entities: [{ name: "Order", fields: { orderId: "string" } }],
    steps: [
      {
        id: "step_receive",
        name: "Receive order",
        summary: "Accept order input.",
        patternIds: ["pattern_trigger"],
        inputRefs: ["input_webhook"],
        outputRefs: ["Order"],
      },
    ],
    patterns: [
      {
        id: "pattern_trigger",
        family: "trigger",
        variant: "webhook",
        summary: "Receive payload.",
        confidence: "high",
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
          name: "valid order",
          input: { orderId: "ord_1" },
          expectedOutput: { accepted: true },
        },
      ],
      edgeCases: [],
    },
    credentialRequirements: [],
    confidence: "high",
    riskLevel: "low",
    warnings: [],
    trace: ["Mapped prompt to trigger and output patterns."],
    ...overrides,
  }
}

function planVersion(overrides: Partial<V2PlanVersion> = {}): V2PlanVersion {
  const versionPlan = plan()

  return {
    planId: "123e4567-e89b-12d3-a456-426614174000",
    planVersion: 1,
    plan: versionPlan,
    createdAt: "2026-06-11T00:00:00.000Z",
    source: "create",
    summary: "Initial plan",
    contentHash: stableHash(versionPlan),
    ...overrides,
  }
}

describe("V2PlanStore", () => {
  it("saves initial and next plan versions under isolated v2 plan directory", async () => {
    const store = new V2PlanStore(plansDir())
    const initialPlan = plan()
    const patchedPlan = plan({ trace: ["Patched response output."] })

    const first = await store.saveInitial({
      plan: initialPlan,
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Initial webhook plan",
    })
    const second = await store.saveNext({
      planId: first.planId,
      parentPlanVersion: first.planVersion,
      plan: patchedPlan,
      createdAt: "2026-06-11T00:05:00.000Z",
      summary: "Patch response output",
    })

    expect(first.planId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(first.planVersion).toBe(1)
    expect(second.planId).toBe(first.planId)
    expect(second.planVersion).toBe(2)
    expect(second.parentPlanVersion).toBe(1)
    expect(first.contentHash).toBe(stableHash(first.plan))
    expect(second.contentHash).toBe(stableHash(second.plan))
    expect(await store.get(first.planId, 1)).toEqual(first)
    expect(await store.get(first.planId, 2)).toEqual(second)
    expect(await store.latest(first.planId)).toEqual(second)
    expect((await store.listVersions(first.planId)).map((version) => version.planVersion)).toEqual([1, 2])

    const raw = await readFile(path.join(plansDir(), first.planId, "v1.json"), "utf8")
    expect(raw.endsWith("\n")).toBe(true)
  })

  it("redacts secret-looking values before persistence", async () => {
    const store = new V2PlanStore(plansDir())
    const sensitivePlan = plan({
      inputs: [
        {
          id: "input_webhook",
          mode: "webhook",
          schema: { authorization: "string" },
          samples: [{ authorization: "Bearer secret-token" }],
        },
      ],
    })
    const saved = await store.saveInitial({
      plan: sensitivePlan,
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Plan with Authorization: Bearer summary-secret",
    })
    const patched = await store.saveNext({
      planId: saved.planId,
      parentPlanVersion: saved.planVersion,
      plan: plan({ trace: ["Patch token=trace-secret"] }),
      createdAt: "2026-06-11T00:05:00.000Z",
      summary: "Patch with token=patch-secret",
    })

    expect(saved.contentHash).toBe(stableHash(saved.plan))
    expect(saved.summary).toBe("[REDACTED]")
    expect(patched.summary).toBe("[REDACTED]")
    const raw = await readFile(path.join(plansDir(), saved.planId, "v1.json"), "utf8")
    const rawPatch = await readFile(path.join(plansDir(), saved.planId, "v2.json"), "utf8")
    expect(raw).not.toContain("secret-token")
    expect(raw).not.toContain("summary-secret")
    expect(rawPatch).not.toContain("trace-secret")
    expect(rawPatch).not.toContain("patch-secret")
    expect(raw).toContain("[REDACTED]")
    expect(rawPatch).toContain("[REDACTED]")
  })

  it("rejects unsafe saveNext IDs before writing outside the plans directory", async () => {
    const store = new V2PlanStore(plansDir())
    const validId = "123e4567-e89b-12d3-a456-426614174000"

    await expect(
      store.saveNext({
        planId: "../../outside",
        parentPlanVersion: 1,
        plan: plan(),
        createdAt: "2026-06-11T00:05:00.000Z",
        summary: "Unsafe patch",
      }),
    ).rejects.toMatchObject({ code: "V2_PLAN_INVALID" })

    expect(await pathExists(path.join(dir, ".opencode", "outside"))).toBe(false)
    expect(await pathExists(path.join(dir, ".opencode", "outside", "v2.json"))).toBe(false)

    await expect(
      store.saveNext({
        planId: validId,
        parentPlanVersion: 0,
        plan: plan(),
        createdAt: "2026-06-11T00:05:00.000Z",
        summary: "Invalid parent version",
      }),
    ).rejects.toMatchObject({ code: "V2_PLAN_INVALID" })
    expect(await pathExists(path.join(plansDir(), validId))).toBe(false)
  })

  it("rejects missing and stale saveNext parent versions", async () => {
    const store = new V2PlanStore(plansDir())
    const missingPlanId = "123e4567-e89b-12d3-a456-426614174000"

    await expect(
      store.saveNext({
        planId: missingPlanId,
        parentPlanVersion: 100,
        plan: plan(),
        createdAt: "2026-06-11T00:05:00.000Z",
        summary: "Missing parent",
      }),
    ).rejects.toMatchObject({ code: "V2_PLAN_INVALID" })
    expect(await pathExists(path.join(plansDir(), missingPlanId, "v101.json"))).toBe(false)

    const first = await store.saveInitial({
      plan: plan(),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Initial webhook plan",
    })
    const second = await store.saveNext({
      planId: first.planId,
      parentPlanVersion: first.planVersion,
      plan: plan({ trace: ["Patch v2."] }),
      createdAt: "2026-06-11T00:05:00.000Z",
      summary: "Patch v2",
    })

    await expect(
      store.saveNext({
        planId: first.planId,
        parentPlanVersion: first.planVersion,
        plan: plan({ trace: ["Stale patch."] }),
        createdAt: "2026-06-11T00:10:00.000Z",
        summary: "Stale patch",
      }),
    ).rejects.toMatchObject({ code: "V2_PLAN_INVALID" })
    expect(await store.latest(first.planId)).toEqual(second)
    expect(await pathExists(path.join(plansDir(), first.planId, "v3.json"))).toBe(false)
  })

  it("does not overwrite an existing corrupt next version file", async () => {
    const store = new V2PlanStore(plansDir())
    const first = await store.saveInitial({
      plan: plan(),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Initial webhook plan",
    })
    const corruptPath = path.join(plansDir(), first.planId, "v2.json")
    await writeFile(corruptPath, "not json\n", "utf8")

    await expect(
      store.saveNext({
        planId: first.planId,
        parentPlanVersion: first.planVersion,
        plan: plan({ trace: ["Attempted overwrite."] }),
        createdAt: "2026-06-11T00:05:00.000Z",
        summary: "Patch should not overwrite",
      }),
    ).rejects.toMatchObject({ code: "V2_PLAN_VERSION_EXISTS" })

    expect(await readFile(corruptPath, "utf8")).toBe("not json\n")
    expect(await store.latest(first.planId)).toEqual(first)
  })

  it("allows only one concurrent saveNext call from the same parent", async () => {
    const store = new V2PlanStore(plansDir())
    const first = await store.saveInitial({
      plan: plan(),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Initial webhook plan",
    })

    const results = await Promise.allSettled([
      store.saveNext({
        planId: first.planId,
        parentPlanVersion: first.planVersion,
        plan: plan({ trace: ["Patch A."] }),
        createdAt: "2026-06-11T00:05:00.000Z",
        summary: "Patch A",
      }),
      store.saveNext({
        planId: first.planId,
        parentPlanVersion: first.planVersion,
        plan: plan({ trace: ["Patch B."] }),
        createdAt: "2026-06-11T00:06:00.000Z",
        summary: "Patch B",
      }),
    ])
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<V2PlanVersion> => result.status === "fulfilled",
    )
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected")

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.reason).toMatchObject({
      code: expect.stringMatching(/^V2_PLAN_(INVALID|VERSION_EXISTS)$/),
    })
    expect(fulfilled[0]?.value.planVersion).toBe(2)
    expect(await store.latest(first.planId)).toEqual(fulfilled[0]?.value)
    expect(await pathExists(path.join(plansDir(), first.planId, "v3.json"))).toBe(false)
  })

  it("returns undefined for traversal IDs, malformed versions, missing files, and malformed JSON", async () => {
    const store = new V2PlanStore(plansDir())
    expect(await store.get("../../outside", 1)).toBeUndefined()
    expect(await store.get("123e4567-e89b-12d3-a456-426614174000", 0)).toBeUndefined()
    expect(await store.get("123e4567-e89b-12d3-a456-426614174000", 1)).toBeUndefined()

    const validId = "123e4567-e89b-12d3-a456-426614174000"
    await mkdir(path.join(plansDir(), validId), { recursive: true })
    await writeFile(path.join(plansDir(), validId, "v1.json"), JSON.stringify({ planId: validId }), "utf8")

    expect(await store.get(validId, 1)).toBeUndefined()
  })

  it("returns undefined when stored metadata does not match the requested plan path", async () => {
    const store = new V2PlanStore(plansDir())
    const validId = "123e4567-e89b-12d3-a456-426614174000"
    const otherId = "223e4567-e89b-12d3-a456-426614174000"
    await mkdir(path.join(plansDir(), validId), { recursive: true })

    await writeFile(
      path.join(plansDir(), validId, "v1.json"),
      `${JSON.stringify(planVersion({ planId: otherId }), null, 2)}\n`,
      "utf8",
    )
    expect(await store.get(validId, 1)).toBeUndefined()

    await writeFile(
      path.join(plansDir(), validId, "v1.json"),
      `${JSON.stringify(planVersion({ planVersion: 2 }), null, 2)}\n`,
      "utf8",
    )
    expect(await store.get(validId, 1)).toBeUndefined()
  })

  it("returns undefined when stored content hash does not match the persisted plan", async () => {
    const store = new V2PlanStore(plansDir())
    const validId = "123e4567-e89b-12d3-a456-426614174000"
    await mkdir(path.join(plansDir(), validId), { recursive: true })
    await writeFile(
      path.join(plansDir(), validId, "v1.json"),
      `${JSON.stringify(planVersion({ contentHash: "wrong-hash" }), null, 2)}\n`,
      "utf8",
    )

    expect(await store.get(validId, 1)).toBeUndefined()
  })

  it("returns undefined for nested malformed plan shapes", async () => {
    const store = new V2PlanStore(plansDir())
    const validId = "123e4567-e89b-12d3-a456-426614174000"
    await mkdir(path.join(plansDir(), validId), { recursive: true })

    await writeFile(
      path.join(plansDir(), validId, "v1.json"),
      `${JSON.stringify(planVersion({ plan: { ...plan(), steps: [null] } as unknown as V2Plan }), null, 2)}\n`,
      "utf8",
    )
    expect(await store.get(validId, 1)).toBeUndefined()

    await writeFile(
      path.join(plansDir(), validId, "v1.json"),
      `${JSON.stringify(
        planVersion({
          plan: {
            ...plan(),
            patterns: [{ ...plan().patterns[0], family: "not_real" }],
          } as unknown as V2Plan,
        }),
        null,
        2,
      )}\n`,
      "utf8",
    )
    expect(await store.get(validId, 1)).toBeUndefined()
  })
})
