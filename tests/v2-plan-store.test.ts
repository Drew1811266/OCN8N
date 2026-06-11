import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { V2PlanStore } from "../src/v2/plan-store.js"
import type { V2Plan } from "../src/v2/types.js"

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

describe("V2PlanStore", () => {
  it("saves initial and next plan versions under isolated v2 plan directory", async () => {
    const store = new V2PlanStore(plansDir())

    const first = await store.saveInitial({
      plan: plan(),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Initial webhook plan",
    })
    const second = await store.saveNext({
      planId: first.planId,
      parentPlanVersion: first.planVersion,
      plan: plan({ trace: ["Patched response output."] }),
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
    expect(await store.get(first.planId, 1)).toEqual(first)
    expect(await store.get(first.planId, 2)).toEqual(second)
    expect(await store.latest(first.planId)).toEqual(second)
    expect((await store.listVersions(first.planId)).map((version) => version.planVersion)).toEqual([1, 2])

    const raw = await readFile(path.join(plansDir(), first.planId, "v1.json"), "utf8")
    expect(raw.endsWith("\n")).toBe(true)
  })

  it("redacts secret-looking values before persistence", async () => {
    const store = new V2PlanStore(plansDir())
    const saved = await store.saveInitial({
      plan: plan({
        inputs: [
          {
            id: "input_webhook",
            mode: "webhook",
            schema: { authorization: "string" },
            samples: [{ authorization: "Bearer secret-token" }],
          },
        ],
      }),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Plan with sensitive sample",
    })

    const raw = await readFile(path.join(plansDir(), saved.planId, "v1.json"), "utf8")
    expect(raw).not.toContain("secret-token")
    expect(raw).toContain("[REDACTED]")
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
})
