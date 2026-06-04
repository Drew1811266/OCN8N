import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { PreviewStore } from "../src/preview-store.js"
import { WorkflowRegistry, type WorkflowRegistryRecord } from "../src/registry.js"
import { simpleWebhookPlan } from "./fixtures/workflows.js"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "opencode-n8n-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function registryPath(): string {
  return path.join(dir, ".opencode", "n8n-workflows.json")
}

function registryRecord(overrides: Partial<WorkflowRegistryRecord> = {}): WorkflowRegistryRecord {
  return {
    workflowId: "wf_1",
    name: "Orders",
    url: "https://demo/workflow/wf_1",
    baseUrl: "https://demo/api/v1",
    managedBy: "opencode-n8n-builder",
    managedByVersion: "0.1.0",
    lastPlanHash: "abc",
    lastUpdatedAt: "2026-06-04T00:00:00.000Z",
    ...overrides,
  }
}

function previewEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    previewId: "123e4567-e89b-12d3-a456-426614174000",
    workflowId: "wf_1",
    baseWorkflowHash: "base",
    proposedWorkflowHash: "proposed",
    summary: "Add Slack node",
    changes: ["Add Slack node"],
    proposedWorkflow: {
      name: simpleWebhookPlan.name,
      active: false,
      nodes: [],
      connections: {},
      settings: {},
    },
    createdAt: "2026-06-04T00:00:00.000Z",
    expiresAt: "2026-06-04T00:30:00.000Z",
    ...overrides,
  }
}

describe("WorkflowRegistry", () => {
  it("saves, upserts, and lists managed workflow records under .opencode", async () => {
    const registry = new WorkflowRegistry(registryPath())

    await registry.upsert(registryRecord({ workflowId: "wf_2", name: "Zebra" }))
    await registry.upsert(registryRecord({ workflowId: "wf_1", name: "Orders", lastPlanHash: "abc" }))
    await registry.upsert(registryRecord({ workflowId: "wf_1", name: "Invoices", lastPlanHash: "def" }))

    expect(await registry.get("wf_1")).toMatchObject({
      workflowId: "wf_1",
      name: "Invoices",
      lastPlanHash: "def",
    })
    expect(await registry.list()).toEqual([
      expect.objectContaining({ workflowId: "wf_1", name: "Invoices" }),
      expect.objectContaining({ workflowId: "wf_2", name: "Zebra" }),
    ])

    const raw = await readFile(registryPath(), "utf8")
    expect(raw.endsWith("\n")).toBe(true)
    expect(JSON.parse(raw).workflows.map((record: WorkflowRegistryRecord) => record.name)).toEqual([
      "Invoices",
      "Zebra",
    ])
  })

  it("sorts same-name records by workflowId and replaces records idempotently", async () => {
    const registry = new WorkflowRegistry(registryPath())

    await registry.upsert(registryRecord({ workflowId: "wf_b", name: "Orders" }))
    await registry.upsert(registryRecord({ workflowId: "wf_c", name: "Orders", lastPlanHash: "old" }))
    await registry.upsert(registryRecord({ workflowId: "wf_a", name: "Orders" }))
    await registry.upsert(registryRecord({ workflowId: "wf_c", name: "Orders", lastPlanHash: "new" }))

    expect((await registry.list()).map((record) => record.workflowId)).toEqual(["wf_a", "wf_b", "wf_c"])
    expect((await registry.list()).map((record) => record.lastPlanHash)).toEqual(["abc", "abc", "new"])
  })

  it("reads missing or malformed registry files as empty", async () => {
    const registry = new WorkflowRegistry(registryPath())
    expect(await registry.list()).toEqual([])

    await mkdir(path.dirname(registryPath()), { recursive: true })
    await writeFile(registryPath(), "not json", "utf8")

    expect(await registry.list()).toEqual([])

    await writeFile(registryPath(), JSON.stringify({ workflows: [{ workflowId: "wf_1" }] }), "utf8")

    expect(await registry.list()).toEqual([])
  })
})

describe("PreviewStore", () => {
  it("stores and retrieves a non-expired preview under .opencode", async () => {
    const store = new PreviewStore(path.join(dir, ".opencode", "n8n-update-previews"))
    const proposedWorkflow = {
      name: simpleWebhookPlan.name,
      active: false,
      nodes: [],
      connections: {},
      settings: {},
    }

    const preview = await store.save({
      workflowId: "wf_1",
      baseWorkflowHash: "base",
      proposedWorkflowHash: "proposed",
      summary: "Add Slack node",
      changes: ["Add Slack node"],
      proposedWorkflow,
      createdAt: "2026-06-04T00:00:00.000Z",
      expiresAt: "2026-06-04T00:30:00.000Z",
    })

    const loaded = await store.get(preview.previewId, new Date("2026-06-04T00:10:00.000Z"))

    expect(preview.previewId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(loaded).toEqual(preview)

    const raw = await readFile(
      path.join(dir, ".opencode", "n8n-update-previews", `${preview.previewId}.json`),
      "utf8",
    )
    expect(raw.endsWith("\n")).toBe(true)
    expect(JSON.parse(raw).proposedWorkflow).toEqual(proposedWorkflow)
  })

  it("returns undefined for traversal-like preview IDs without throwing", async () => {
    const store = new PreviewStore(path.join(dir, ".opencode", "n8n-update-previews"))
    await writeFile(
      path.join(dir, "outside.json"),
      JSON.stringify({
        previewId: "123e4567-e89b-12d3-a456-426614174000",
        workflowId: "wf_1",
        baseWorkflowHash: "base",
        proposedWorkflowHash: "proposed",
        summary: "Outside preview",
        changes: ["Outside preview"],
        proposedWorkflow: {
          name: simpleWebhookPlan.name,
          active: false,
          nodes: [],
          connections: {},
          settings: {},
        },
        createdAt: "2026-06-04T00:00:00.000Z",
        expiresAt: "2026-06-04T00:30:00.000Z",
      }),
      "utf8",
    )

    await expect(store.get("../../outside", new Date("2026-06-04T00:10:00.000Z"))).resolves.toBeUndefined()
  })

  it("returns undefined for malformed preview files", async () => {
    const previewDir = path.join(dir, ".opencode", "n8n-update-previews")
    const store = new PreviewStore(previewDir)
    const validUuid = "123e4567-e89b-12d3-a456-426614174000"

    await mkdir(previewDir, { recursive: true })
    await writeFile(path.join(previewDir, `${validUuid}.json`), JSON.stringify({}), "utf8")

    expect(await store.get(validUuid, new Date("2026-06-04T00:10:00.000Z"))).toBeUndefined()

    await writeFile(
      path.join(previewDir, `${validUuid}.json`),
      JSON.stringify({
        previewId: validUuid,
        workflowId: "wf_1",
        baseWorkflowHash: "base",
        proposedWorkflowHash: "proposed",
        summary: "Add Slack node",
        changes: ["Add Slack node"],
        proposedWorkflow: {
          name: simpleWebhookPlan.name,
          active: false,
          nodes: [],
          connections: {},
          settings: {},
        },
        createdAt: "2026-06-04T00:00:00.000Z",
        expiresAt: "not-a-date",
      }),
      "utf8",
    )

    expect(await store.get(validUuid, new Date("2026-06-04T00:10:00.000Z"))).toBeUndefined()
  })

  it("returns undefined when preview workflow nodes are malformed", async () => {
    const previewDir = path.join(dir, ".opencode", "n8n-update-previews")
    const store = new PreviewStore(previewDir)
    const validUuid = "123e4567-e89b-12d3-a456-426614174000"

    await mkdir(previewDir, { recursive: true })
    await writeFile(
      path.join(previewDir, `${validUuid}.json`),
      JSON.stringify(
        previewEnvelope({
          proposedWorkflow: {
            name: simpleWebhookPlan.name,
            active: false,
            nodes: [null],
            connections: {},
            settings: {},
          },
        }),
      ),
      "utf8",
    )

    expect(await store.get(validUuid, new Date("2026-06-04T00:10:00.000Z"))).toBeUndefined()
  })

  it("returns undefined when preview workflow connections are malformed", async () => {
    const previewDir = path.join(dir, ".opencode", "n8n-update-previews")
    const store = new PreviewStore(previewDir)
    const validUuid = "123e4567-e89b-12d3-a456-426614174000"

    await mkdir(previewDir, { recursive: true })
    await writeFile(
      path.join(previewDir, `${validUuid}.json`),
      JSON.stringify(
        previewEnvelope({
          proposedWorkflow: {
            name: simpleWebhookPlan.name,
            active: false,
            nodes: [],
            connections: {
              Receive: {
                main: [[{ type: "main", index: 0 }]],
              },
            },
            settings: {},
          },
        }),
      ),
      "utf8",
    )

    expect(await store.get(validUuid, new Date("2026-06-04T00:10:00.000Z"))).toBeUndefined()
  })

  it("returns undefined for missing or expired previews", async () => {
    const store = new PreviewStore(path.join(dir, ".opencode", "n8n-update-previews"))

    expect(await store.get("missing")).toBeUndefined()

    const preview = await store.save({
      workflowId: "wf_1",
      baseWorkflowHash: "base",
      proposedWorkflowHash: "proposed",
      summary: "Add Slack node",
      changes: ["Add Slack node"],
      proposedWorkflow: {
        name: simpleWebhookPlan.name,
        active: false,
        nodes: [],
        connections: {},
        settings: {},
      },
      createdAt: "2026-06-04T00:00:00.000Z",
      expiresAt: "2026-06-04T00:30:00.000Z",
    })

    expect(await store.get(preview.previewId, new Date("2026-06-04T00:30:00.000Z"))).toBeUndefined()
  })
})
