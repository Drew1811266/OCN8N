import { describe, expect, it, vi } from "vitest"
import { N8nBuilderError } from "../src/errors.js"
import type { WorkflowRegistryRecord } from "../src/registry.js"
import { claimWorkflow } from "../src/tools/claim-workflow.js"
import type { N8nWorkflow } from "../src/validator.js"

const baseUrl = "https://demo/api/v1"
const pluginVersion = "0.6.0"
const now = new Date("2026-06-10T00:00:00.000Z")

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
      {
        name: "Set Fields",
        type: "n8n-nodes-base.set",
        typeVersion: 3.4,
        position: [300, 0],
        parameters: {},
      },
    ],
    connections: {
      "Manual Trigger": {
        main: [[{ node: "Set Fields", type: "main", index: 0 }]],
      },
    },
    settings: {},
    ...overrides,
  }
}

function registryRecord(overrides: Partial<WorkflowRegistryRecord> = {}): WorkflowRegistryRecord {
  return {
    workflowId: "wf_1",
    name: "External Orders",
    url: "https://demo/workflow/wf_1",
    baseUrl,
    managedBy: "opencode-n8n-builder",
    managedByVersion: pluginVersion,
    lastPlanHash: "hash",
    lastUpdatedAt: "2026-06-10T00:00:00.000Z",
    ...overrides,
  }
}

describe("claimWorkflow", () => {
  it("previews an eligible inactive workflow without writing n8n or registry", async () => {
    const api = {
      getWorkflow: vi.fn(async () => workflow()),
      updateWorkflow: vi.fn(),
    }
    const registry = {
      get: vi.fn(async () => undefined),
      upsert: vi.fn(),
    }

    const result = await claimWorkflow({
      args: { workflowId: "wf_1", mode: "preview" },
      config: { baseUrl, pluginVersion },
      api,
      registry,
      now: () => now,
    })

    expect(api.getWorkflow).toHaveBeenCalledWith("wf_1")
    expect(api.updateWorkflow).not.toHaveBeenCalled()
    expect(registry.upsert).not.toHaveBeenCalled()
    expect(result).toEqual({
      workflowId: "wf_1",
      name: "External Orders",
      url: "https://demo/workflow/wf_1",
      mode: "preview",
      eligible: true,
      action: "claim",
      summary: {
        nodeCount: 2,
        connectionCount: 1,
        triggerNodeTypes: ["n8n-nodes-base.manualTrigger"],
        credentialTypes: [],
      },
      risks: [],
      markerWritten: false,
      registryWritten: false,
    })
  })

  it("blocks apply unless confirm is true", async () => {
    await expect(
      claimWorkflow({
        args: { workflowId: "wf_1", mode: "apply" },
        config: { baseUrl, pluginVersion },
        api: {
          getWorkflow: vi.fn(async () => workflow()),
          updateWorkflow: vi.fn(),
        },
        registry: {
          get: vi.fn(async () => undefined),
          upsert: vi.fn(),
        },
        now: () => now,
      }),
    ).rejects.toMatchObject({
      code: "CLAIM_CONFIRMATION_REQUIRED",
    } satisfies Partial<N8nBuilderError>)
  })

  it("applies an eligible claim by writing the marker and registry", async () => {
    const api = {
      getWorkflow: vi.fn(async () => workflow()),
      updateWorkflow: vi.fn(async (_workflowId: string, input: N8nWorkflow) => ({ ...input, id: "wf_1" })),
    }
    const registry = {
      get: vi.fn(async () => undefined),
      upsert: vi.fn(async () => undefined),
    }

    const result = await claimWorkflow({
      args: { workflowId: "wf_1", mode: "apply", confirm: true },
      config: { baseUrl, pluginVersion },
      api,
      registry,
      now: () => now,
    })

    expect(api.updateWorkflow).toHaveBeenCalledWith(
      "wf_1",
      expect.objectContaining({
        meta: expect.objectContaining({
          managedBy: "opencode-n8n-builder",
          managedByVersion: "0.6.0",
          claimedAt: "2026-06-10T00:00:00.000Z",
        }),
        tags: expect.arrayContaining([expect.objectContaining({ name: "opencode-n8n-builder" })]),
      }),
    )
    expect(registry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "wf_1",
        name: "External Orders",
        url: "https://demo/workflow/wf_1",
        baseUrl,
        managedBy: "opencode-n8n-builder",
        managedByVersion: "0.6.0",
        lastUpdatedAt: "2026-06-10T00:00:00.000Z",
      }),
    )
    expect(result.mode).toBe("apply")
    expect(result.eligible).toBe(true)
    expect(result.markerWritten).toBe(true)
    expect(result.registryWritten).toBe(true)
  })

  it("repairs registry for an already marked workflow missing local registry", async () => {
    const api = {
      getWorkflow: vi.fn(async () =>
        workflow({
          meta: { managedBy: "opencode-n8n-builder", managedByVersion: "0.5.0" },
          tags: [{ name: "opencode-n8n-builder" }],
        }),
      ),
      updateWorkflow: vi.fn(),
    }
    const registry = {
      get: vi.fn(async () => undefined),
      upsert: vi.fn(async () => undefined),
    }

    const result = await claimWorkflow({
      args: { workflowId: "wf_1", mode: "apply", confirm: true },
      config: { baseUrl, pluginVersion },
      api,
      registry,
      now: () => now,
    })

    expect(api.updateWorkflow).not.toHaveBeenCalled()
    expect(registry.upsert).toHaveBeenCalled()
    expect(result.action).toBe("repair_registry")
    expect(result.markerWritten).toBe(false)
    expect(result.registryWritten).toBe(true)
  })

  it("blocks active workflows without writing", async () => {
    const api = {
      getWorkflow: vi.fn(async () => workflow({ active: true })),
      updateWorkflow: vi.fn(),
    }
    const registry = {
      get: vi.fn(async () => undefined),
      upsert: vi.fn(),
    }

    const result = await claimWorkflow({
      args: { workflowId: "wf_1", mode: "preview" },
      config: { baseUrl, pluginVersion },
      api,
      registry,
      now: () => now,
    })

    expect(result.eligible).toBe(false)
    expect(result.action).toBe("blocked")
    expect(result.risks.map((risk) => risk.code)).toContain("ACTIVE_WORKFLOW")
    expect(api.updateWorkflow).not.toHaveBeenCalled()
    expect(registry.upsert).not.toHaveBeenCalled()
  })

  it("blocks incompatible ownership markers", async () => {
    const result = await claimWorkflow({
      args: { workflowId: "wf_1", mode: "preview" },
      config: { baseUrl, pluginVersion },
      api: {
        getWorkflow: vi.fn(async () => workflow({ meta: { managedBy: "other-builder" } })),
        updateWorkflow: vi.fn(),
      },
      registry: {
        get: vi.fn(async () => undefined),
        upsert: vi.fn(),
      },
      now: () => now,
    })

    expect(result.eligible).toBe(false)
    expect(result.risks.map((risk) => risk.code)).toContain("INCOMPATIBLE_OWNER")
  })

  it("blocks registry records from another base URL", async () => {
    const result = await claimWorkflow({
      args: { workflowId: "wf_1", mode: "preview" },
      config: { baseUrl, pluginVersion },
      api: {
        getWorkflow: vi.fn(async () => workflow()),
        updateWorkflow: vi.fn(),
      },
      registry: {
        get: vi.fn(async () => registryRecord({ baseUrl: "https://other-demo/api/v1" })),
        upsert: vi.fn(),
      },
      now: () => now,
    })

    expect(result.eligible).toBe(false)
    expect(result.risks.map((risk) => risk.code)).toContain("REGISTRY_BASE_URL_MISMATCH")
  })

  it("blocks secret-looking parameters without leaking values", async () => {
    const result = await claimWorkflow({
      args: { workflowId: "wf_1", mode: "preview" },
      config: { baseUrl, pluginVersion },
      api: {
        getWorkflow: vi.fn(async () =>
          workflow({
            name: "Sensitive Orders",
            nodes: [
              {
                name: "HTTP Secret",
                type: "n8n-nodes-base.httpRequest",
                typeVersion: 4,
                position: [0, 0],
                parameters: { token: "secret-token" },
              },
            ],
            connections: {},
          }),
        ),
        updateWorkflow: vi.fn(),
      },
      registry: {
        get: vi.fn(async () => undefined),
        upsert: vi.fn(),
      },
      now: () => now,
    })

    expect(result.eligible).toBe(false)
    expect(result.risks.map((risk) => risk.code)).toContain("PLAINTEXT_SECRET")
    expect(JSON.stringify(result)).not.toContain("secret-token")
    expect(JSON.stringify(result)).not.toContain("Sensitive Orders")
    expect(JSON.stringify(result)).not.toContain("HTTP Secret")
  })
})
