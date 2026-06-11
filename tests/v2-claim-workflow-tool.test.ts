import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { claimV2Workflow } from "../src/tools/v2-claim-workflow.js"
import type { N8nWorkflow } from "../src/validator.js"
import { V2WorkflowRegistry } from "../src/v2/registry.js"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ocn8n-v2-claim-workflow-tool-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function registry(): V2WorkflowRegistry {
  return new V2WorkflowRegistry(path.join(dir, ".opencode", "n8n-v2", "registry", "workflows.json"))
}

function workflow(overrides: Partial<N8nWorkflow & { id: string }> = {}): N8nWorkflow & { id: string } {
  return {
    id: "wf_1",
    name: "External Orders",
    active: false,
    nodes: [
      {
        name: "Manual Trigger",
        type: "n8n-nodes-base.manualTrigger",
        typeVersion: 1,
        position: [0, 0],
        parameters: {},
      },
    ],
    connections: {},
    settings: {},
    tags: [],
    ...overrides,
  }
}

function apiFor(input: N8nWorkflow & { id: string }) {
  return {
    getWorkflow: vi.fn(async () => input),
    updateWorkflow: vi.fn(async (_workflowId: string, nextWorkflow: N8nWorkflow) => ({
      ...nextWorkflow,
      id: input.id,
    })),
  }
}

const config = {
  baseUrl: "https://demo/api/v1",
  pluginVersion: "2.0.0",
}

describe("claimV2Workflow", () => {
  it("previews an inactive unmanaged workflow as eligible for full claim without writing", async () => {
    const v2Registry = registry()
    const api = apiFor(workflow())

    const result = await claimV2Workflow({
      args: { workflowId: "wf_1", mode: "preview" },
      config,
      api,
      registry: v2Registry,
    })

    expect(result).toEqual(
      expect.objectContaining({
        workflowId: "wf_1",
        name: "External Orders",
        url: "https://demo/workflow/wf_1",
        mode: "preview",
        eligible: true,
        action: "claim_full",
        claimMode: "full",
        active: false,
        markerWritten: false,
        registryWritten: false,
      }),
    )
    expect(api.updateWorkflow).not.toHaveBeenCalled()
    expect(await v2Registry.get("wf_1")).toBeUndefined()
  })

  it("applies an inactive full claim by writing a v2 marker and registry record", async () => {
    const v2Registry = registry()
    const api = apiFor(workflow())

    const result = await claimV2Workflow({
      args: { workflowId: "wf_1", mode: "apply", confirm: true },
      config,
      api,
      registry: v2Registry,
      now: () => new Date("2026-06-11T03:00:00.000Z"),
    })

    expect(api.updateWorkflow).toHaveBeenCalledWith(
      "wf_1",
      expect.objectContaining({
        active: false,
        meta: expect.objectContaining({
          managedBy: "opencode-n8n-builder-v2",
          managedByVersion: "2.0.0",
          claimedAt: "2026-06-11T03:00:00.000Z",
        }),
        tags: expect.arrayContaining([expect.objectContaining({ name: "opencode-n8n-builder-v2" })]),
      }),
    )
    expect(result).toEqual(
      expect.objectContaining({
        workflowId: "wf_1",
        mode: "apply",
        eligible: true,
        action: "claim_full",
        claimMode: "full",
        markerWritten: true,
        registryWritten: true,
      }),
    )

    expect(await v2Registry.get("wf_1")).toEqual(
      expect.objectContaining({
        workflowId: "wf_1",
        name: "External Orders",
        url: "https://demo/workflow/wf_1",
        baseUrl: "https://demo/api/v1",
        claimMode: "full",
        activeAtClaim: false,
        managedBy: "opencode-n8n-builder-v2",
        managedByVersion: "2.0.0",
        latestWorkflowHash: result.workflowHash,
        lastUpdatedAt: "2026-06-11T03:00:00.000Z",
      }),
    )
  })

  it("applies an active workflow as read-only without writing a marker", async () => {
    const v2Registry = registry()
    const api = apiFor(workflow({ active: true }))

    const result = await claimV2Workflow({
      args: { workflowId: "wf_1", mode: "apply", confirm: true },
      config,
      api,
      registry: v2Registry,
      now: () => new Date("2026-06-11T03:05:00.000Z"),
    })

    expect(api.updateWorkflow).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        workflowId: "wf_1",
        mode: "apply",
        eligible: true,
        action: "claim_read_only",
        claimMode: "read_only",
        active: true,
        markerWritten: false,
        registryWritten: true,
      }),
    )
    expect(result.risks).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "ACTIVE_READ_ONLY" })]),
    )
    expect(await v2Registry.get("wf_1")).toEqual(
      expect.objectContaining({
        claimMode: "read_only",
        activeAtClaim: true,
        latestWorkflowHash: result.workflowHash,
      }),
    )
  })

  it("requires explicit confirmation before reading or writing in apply mode", async () => {
    const api = apiFor(workflow())

    await expect(
      claimV2Workflow({
        args: { workflowId: "wf_1", mode: "apply", confirm: false },
        config,
        api,
        registry: registry(),
      }),
    ).rejects.toMatchObject({ code: "V2_CLAIM_CONFIRM_REQUIRED" })
    expect(api.getWorkflow).not.toHaveBeenCalled()
    expect(api.updateWorkflow).not.toHaveBeenCalled()
  })

  it("blocks incompatible owners and plaintext secrets without writing", async () => {
    const incompatibleApi = apiFor(
      workflow({
        meta: { managedBy: "other-builder" },
      }),
    )
    const secretApi = apiFor(
      workflow({
        nodes: [
          {
            name: "HTTP",
            type: "n8n-nodes-base.httpRequest",
            typeVersion: 4,
            position: [0, 0],
            parameters: { token: "secret-token" },
          },
        ],
      }),
    )

    await expect(
      claimV2Workflow({
        args: { workflowId: "wf_1", mode: "apply", confirm: true },
        config,
        api: incompatibleApi,
        registry: registry(),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        eligible: false,
        action: "blocked",
        registryWritten: false,
        risks: expect.arrayContaining([expect.objectContaining({ code: "INCOMPATIBLE_OWNER" })]),
      }),
    )
    expect(incompatibleApi.updateWorkflow).not.toHaveBeenCalled()

    await expect(
      claimV2Workflow({
        args: { workflowId: "wf_1", mode: "apply", confirm: true },
        config,
        api: secretApi,
        registry: registry(),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        eligible: false,
        action: "blocked",
        registryWritten: false,
        risks: expect.arrayContaining([expect.objectContaining({ code: "PLAINTEXT_SECRET" })]),
      }),
    )
    expect(secretApi.updateWorkflow).not.toHaveBeenCalled()
  })
})
