import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { V2WorkflowRegistry } from "../src/v2/registry.js"
import type { V2RegistryRecord } from "../src/v2/types.js"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ocn8n-v2-registry-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function registryPath(): string {
  return path.join(dir, ".opencode", "n8n-v2", "registry", "workflows.json")
}

function record(overrides: Partial<V2RegistryRecord> = {}): V2RegistryRecord {
  return {
    workflowId: "wf_1",
    name: "Orders",
    url: "https://demo/workflow/wf_1",
    baseUrl: "https://demo/api/v1",
    claimMode: "full",
    activeAtClaim: false,
    managedBy: "opencode-n8n-builder-v2",
    managedByVersion: "2.0.0",
    latestPlanId: "123e4567-e89b-12d3-a456-426614174000",
    latestPlanVersion: 1,
    latestWorkflowHash: "workflow_hash",
    lastUpdatedAt: "2026-06-11T00:00:00.000Z",
    ...overrides,
  }
}

describe("V2WorkflowRegistry", () => {
  it("saves, replaces, sorts, and reads v2 records", async () => {
    const registry = new V2WorkflowRegistry(registryPath())

    await registry.upsert(record({ workflowId: "wf_b", name: "Orders" }))
    await registry.upsert(record({ workflowId: "wf_a", name: "Orders" }))
    await registry.upsert(record({ workflowId: "wf_b", name: "Invoices", claimMode: "read_only" }))

    expect(await registry.get("wf_b")).toMatchObject({
      workflowId: "wf_b",
      name: "Invoices",
      claimMode: "read_only",
    })
    expect((await registry.list()).map((item) => item.workflowId)).toEqual(["wf_b", "wf_a"])

    const raw = await readFile(registryPath(), "utf8")
    expect(raw.endsWith("\n")).toBe(true)
    expect(JSON.parse(raw).workflows).toHaveLength(2)
  })

  it("reads missing, malformed, and v1 registry files as empty", async () => {
    const registry = new V2WorkflowRegistry(registryPath())
    expect(await registry.list()).toEqual([])

    await mkdir(path.dirname(registryPath()), { recursive: true })
    await writeFile(registryPath(), "not json", "utf8")
    expect(await registry.list()).toEqual([])

    await writeFile(
      registryPath(),
      JSON.stringify({
        workflows: [
          {
            workflowId: "wf_1",
            managedBy: "opencode-n8n-builder",
          },
        ],
      }),
      "utf8",
    )
    expect(await registry.list()).toEqual([])
  })
})
