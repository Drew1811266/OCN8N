import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { stableHash } from "../src/hash.js"
import { V2PreviewStore, type SaveV2CompiledPreviewInput } from "../src/v2/preview-store.js"
import type { N8nWorkflow } from "../src/validator.js"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ocn8n-v2-preview-store-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function previewsDir(): string {
  return path.join(dir, ".opencode", "n8n-v2", "previews")
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function workflow(overrides: Partial<N8nWorkflow> = {}): N8nWorkflow {
  return {
    name: "Order fulfillment preview",
    active: false,
    nodes: [
      {
        id: "1",
        name: "Receive input",
        type: "n8n-nodes-base.webhook",
        typeVersion: 2,
        position: [0, 0],
        parameters: {},
      },
      {
        id: "2",
        name: "Return output",
        type: "n8n-nodes-base.respondToWebhook",
        typeVersion: 1,
        position: [300, 0],
        parameters: {},
      },
    ],
    connections: {
      "Receive input": {
        main: [[{ node: "Return output", type: "main", index: 0 }]],
      },
    },
    settings: {},
    tags: [{ name: "opencode-n8n-builder-v2" }],
    meta: {
      managedBy: "opencode-n8n-builder-v2",
      managedByVersion: "2.0.0",
      createdAt: "2026-06-11T00:00:00.000Z",
    },
    ...overrides,
  }
}

function previewInput(overrides: Partial<SaveV2CompiledPreviewInput> = {}): SaveV2CompiledPreviewInput {
  return {
    planId: "123e4567-e89b-12d3-a456-426614174000",
    planVersion: 1,
    workflow: workflow(),
    mappingTrace: [
      {
        stepId: "step_trigger",
        patternIds: ["pattern_trigger"],
        nodeNames: ["Receive input"],
        notes: ["Compiled trigger pattern."],
      },
    ],
    validationStatus: "passed",
    mcpValidationStatus: "not_configured",
    warnings: [],
    createdAt: "2026-06-11T00:00:00.000Z",
    ...overrides,
  }
}

describe("V2PreviewStore", () => {
  it("saves and reads compiled preview artifacts", async () => {
    const store = new V2PreviewStore(previewsDir())
    const saved = await store.save(previewInput())

    expect(saved.previewId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(saved.workflowHash).toBe(stableHash(saved.workflow))
    expect(await pathExists(path.join(previewsDir(), `${saved.previewId}.json`))).toBe(true)
    await expect(store.get(saved.previewId)).resolves.toEqual(saved)
  })

  it("redacts secret-looking workflow parameters before persistence", async () => {
    const store = new V2PreviewStore(previewsDir())
    const saved = await store.save(
      previewInput({
        workflow: workflow({
          nodes: [
            {
              id: "1",
              name: "Call API",
              type: "n8n-nodes-base.httpRequest",
              typeVersion: 4,
              position: [0, 0],
              parameters: { headers: { Authorization: "Bearer preview-secret" } },
            },
          ],
          connections: {},
        }),
      }),
    )

    const raw = await readFile(path.join(previewsDir(), `${saved.previewId}.json`), "utf8")
    expect(raw).not.toContain("preview-secret")
    expect(raw).toContain("[REDACTED]")
    expect(saved.workflowHash).toBe(stableHash(saved.workflow))
  })

  it("returns undefined for unsafe IDs, malformed JSON, metadata mismatch, and workflow hash mismatch", async () => {
    const store = new V2PreviewStore(previewsDir())
    const saved = await store.save(previewInput())
    const filePath = path.join(previewsDir(), `${saved.previewId}.json`)

    expect(await store.get("../../outside")).toBeUndefined()

    await writeFile(filePath, "not json\n", "utf8")
    expect(await store.get(saved.previewId)).toBeUndefined()

    await writeFile(filePath, `${JSON.stringify({ ...saved, previewId: "123e4567-e89b-12d3-a456-426614174000" })}\n`, "utf8")
    expect(await store.get(saved.previewId)).toBeUndefined()

    await writeFile(filePath, `${JSON.stringify({ ...saved, workflowHash: "wrong-hash" })}\n`, "utf8")
    expect(await store.get(saved.previewId)).toBeUndefined()
  })

  it("does not overwrite existing preview artifacts", async () => {
    const fixedId = "123e4567-e89b-12d3-a456-426614174000"
    const store = new V2PreviewStore(previewsDir(), () => fixedId)
    const first = await store.save(previewInput())

    await expect(store.save(previewInput({ planVersion: 2 }))).rejects.toMatchObject({
      code: "V2_PREVIEW_EXISTS",
    })
    expect(await store.get(fixedId)).toEqual(first)
  })
})
