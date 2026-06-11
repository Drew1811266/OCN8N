import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { describe, expect, it, vi } from "vitest"
import { N8nBuilderPlugin, createN8nBuilderPlugin } from "../src/index.js"

function mockPluginInput(input: {
  directory?: string
  log?: ReturnType<typeof vi.fn>
  opencodeConfig?: unknown
  session?: unknown
} = {}): PluginInput {
  const client: Record<string, unknown> = {
    app: {
      log: input.log ?? vi.fn().mockResolvedValue(undefined),
    },
    config: {
      get: vi.fn().mockResolvedValue(input.opencodeConfig ?? { n8n: {} }),
    },
  }

  if (input.session) {
    client.session = input.session
  }

  return {
    directory: input.directory ?? "/tmp/project",
    worktree: input.directory ?? "/tmp/project",
    client,
  } as unknown as PluginInput
}

async function withoutN8nEnv<T>(fn: () => Promise<T>): Promise<T> {
  const original = {
    N8N_BASE_URL: process.env.N8N_BASE_URL,
    N8N_API_KEY: process.env.N8N_API_KEY,
    N8N_MCP_URL: process.env.N8N_MCP_URL,
    N8N_MCP_TOKEN: process.env.N8N_MCP_TOKEN,
  }

  delete process.env.N8N_BASE_URL
  delete process.env.N8N_API_KEY
  delete process.env.N8N_MCP_URL
  delete process.env.N8N_MCP_TOKEN

  try {
    return await fn()
  } finally {
    restoreEnv("N8N_BASE_URL", original.N8N_BASE_URL)
    restoreEnv("N8N_API_KEY", original.N8N_API_KEY)
    restoreEnv("N8N_MCP_URL", original.N8N_MCP_URL)
    restoreEnv("N8N_MCP_TOKEN", original.N8N_MCP_TOKEN)
  }
}

function restoreEnv(
  name: "N8N_BASE_URL" | "N8N_API_KEY" | "N8N_MCP_URL" | "N8N_MCP_TOKEN",
  value: string | undefined,
): void {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

function parseToolOutput(result: unknown): unknown {
  expect(result).toEqual(expect.objectContaining({ output: expect.any(String) }))
  return JSON.parse((result as { output: string }).output)
}

describe("plugin exports", () => {
  it("exports a plugin factory and default plugin function", () => {
    expect(typeof createN8nBuilderPlugin).toBe("function")
    expect(typeof N8nBuilderPlugin).toBe("function")
  })

  it("registers v1 tools and v2 foundation tools", async () => {
    const plugin = createN8nBuilderPlugin({ version: "0.1.0" })

    const result = await plugin(mockPluginInput())

    expect(Object.keys(result.tool ?? {})).toEqual([
      "n8n_build_workflow",
      "n8n_update_workflow",
      "n8n_claim_workflow",
      "n8n_check_workflow_readiness",
      "n8n_inspect_workflow",
      "n8n_list_managed_workflows",
      "n8n_v2_auto_preview",
      "n8n_v2_create_plan",
      "n8n_v2_review_plan",
      "n8n_v2_patch_plan",
      "n8n_v2_validate_simulate",
      "n8n_v2_compile_preview",
      "n8n_v2_apply",
      "n8n_v2_claim_workflow",
      "n8n_v2_reverse_plan",
    ])
    expect(Object.keys(result.tool?.n8n_build_workflow.args ?? {})).toEqual(["prompt", "name"])
    expect(Object.keys(result.tool?.n8n_update_workflow.args ?? {})).toEqual(["workflowId", "prompt", "mode", "previewId"])
    expect((result.tool?.n8n_update_workflow.args.mode as { options?: string[] } | undefined)?.options).toEqual([
      "preview",
      "apply",
      "rollback-preview",
      "rollback-apply",
    ])
    expect(Object.keys(result.tool?.n8n_claim_workflow.args ?? {})).toEqual(["workflowId", "mode", "confirm"])
    expect(Object.keys(result.tool?.n8n_check_workflow_readiness.args ?? {})).toEqual([
      "workflowId",
      "mode",
      "confirm",
      "allowWarnings",
    ])
    expect(Object.keys(result.tool?.n8n_v2_auto_preview.args ?? {})).toEqual(["prompt", "name"])
    expect(Object.keys(result.tool?.n8n_v2_create_plan.args ?? {})).toEqual(["prompt", "name"])
    expect(Object.keys(result.tool?.n8n_v2_review_plan.args ?? {})).toEqual(["planId", "planVersion"])
    expect(Object.keys(result.tool?.n8n_v2_patch_plan.args ?? {})).toEqual(["planId", "planVersion", "patch"])
    expect(Object.keys(result.tool?.n8n_v2_validate_simulate.args ?? {})).toEqual(["planId", "planVersion"])
    expect(Object.keys(result.tool?.n8n_v2_compile_preview.args ?? {})).toEqual(["planId", "planVersion"])
    expect(Object.keys(result.tool?.n8n_v2_apply.args ?? {})).toEqual(["previewId", "confirm"])
    expect(Object.keys(result.tool?.n8n_v2_claim_workflow.args ?? {})).toEqual(["workflowId", "mode", "confirm"])
    expect(Object.keys(result.tool?.n8n_v2_reverse_plan.args ?? {})).toEqual(["workflowId"])
  })

  it("routes rollback update modes without requiring MCP configuration", async () => {
    await withoutN8nEnv(async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "ocn8n-plugin-"))
      const plugin = createN8nBuilderPlugin({ version: "0.7.0" })
      const result = await plugin(
        mockPluginInput({
          directory,
          opencodeConfig: {
            n8n: {
              baseUrl: "https://demo/api/v1",
              apiKey: "key",
            },
          },
        }),
      )

      await expect(
        result.tool?.n8n_update_workflow.execute({ workflowId: "wf_1", mode: "rollback-preview" }, {} as never),
      ).rejects.toMatchObject({
        code: "TOOL_ARGS_INVALID",
        message: "rollback-preview updates require a previewId.",
        details: { field: "previewId" },
      })
    })
  })

  it("logs the configured version during initialization", async () => {
    const log = vi.fn().mockResolvedValue(undefined)
    const plugin = createN8nBuilderPlugin({ version: "9.9.9" })

    const result = await plugin(mockPluginInput({ log }))

    expect(log).toHaveBeenCalledWith({
      body: {
        service: "opencode-n8n-builder",
        level: "info",
        message: "Plugin initialized",
        extra: { version: "9.9.9" },
      },
    })
    expect(result.tool).toEqual(expect.any(Object))
  })

  it("lists managed workflows without n8n API or MCP configuration", async () => {
    await withoutN8nEnv(async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "ocn8n-plugin-"))
      await mkdir(path.join(directory, ".opencode"), { recursive: true })
      await writeFile(
        path.join(directory, ".opencode", "n8n-workflows.json"),
        `${JSON.stringify({
          workflows: [
            {
              workflowId: "wf_1",
              name: "Orders",
              url: "https://demo/workflow/wf_1",
              baseUrl: "https://demo/api/v1",
              managedBy: "opencode-n8n-builder",
              managedByVersion: "0.1.0",
              lastPlanHash: "hash",
              lastUpdatedAt: "2026-06-04T00:00:00.000Z",
            },
          ],
        })}\n`,
        "utf8",
      )

      const plugin = createN8nBuilderPlugin({ version: "0.1.0" })
      const result = await plugin(mockPluginInput({ directory, opencodeConfig: {} }))

      await expect(result.tool?.n8n_list_managed_workflows.execute({}, {} as never)).resolves.toEqual(
        expect.objectContaining({
          output: expect.stringContaining("wf_1"),
        }),
      )
    })
  })

  it("runs v2 local plan tools without n8n API or MCP configuration", async () => {
    await withoutN8nEnv(async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "ocn8n-plugin-v2-"))
      const plugin = createN8nBuilderPlugin({ version: "2.0.0" })
      const result = await plugin(mockPluginInput({ directory, opencodeConfig: {} }))

      const created = parseToolOutput(
        await result.tool?.n8n_v2_create_plan.execute(
          { prompt: "Receive an order webhook", name: "Order intake" },
          {} as never,
        ),
      ) as { planId: string; planVersion: number }
      expect(created.planVersion).toBe(1)

      const reviewed = parseToolOutput(
        await result.tool?.n8n_v2_review_plan.execute(
          { planId: created.planId, planVersion: created.planVersion },
          {} as never,
        ),
      ) as { summary: string }
      expect(reviewed.summary).toContain("pattern")

      const patched = parseToolOutput(
        await result.tool?.n8n_v2_patch_plan.execute(
          {
            planId: created.planId,
            planVersion: created.planVersion,
            patch: "Add a validation step before the response",
          },
          {} as never,
        ),
      ) as { planId: string; planVersion: number; parentPlanVersion: number }
      expect(patched).toEqual(
        expect.objectContaining({
          planId: created.planId,
          planVersion: 2,
          parentPlanVersion: 1,
        }),
      )

      const validated = parseToolOutput(
        await result.tool?.n8n_v2_validate_simulate.execute(
          { planId: patched.planId, planVersion: patched.planVersion },
          {} as never,
        ),
      ) as { planId: string; planVersion: number; status: string }
      expect(validated).toEqual(
        expect.objectContaining({
          planId: patched.planId,
          planVersion: patched.planVersion,
          status: "passed",
        }),
      )

      const compiled = parseToolOutput(
        await result.tool?.n8n_v2_compile_preview.execute(
          { planId: patched.planId, planVersion: patched.planVersion },
          {} as never,
        ),
      ) as { planId: string; planVersion: number; previewId: string; nodeCount: number; validationStatus: string }
      expect(compiled).toEqual(
        expect.objectContaining({
          planId: patched.planId,
          planVersion: patched.planVersion,
          nodeCount: expect.any(Number),
          validationStatus: "passed",
        }),
      )
      expect(compiled.previewId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      )

      const autoPreview = parseToolOutput(
        await result.tool?.n8n_v2_auto_preview.execute(
          {
            prompt:
              "Create a webhook order workflow that maps fields, branches by status, calls an external fulfillment API, retries failures, and responds to the webhook.",
            name: "Auto order fulfillment",
          },
          {} as never,
        ),
      ) as { planId: string; planVersion: number; previewId: string; nodeCount: number; validationStatus: string }
      expect(autoPreview).toEqual(
        expect.objectContaining({
          planVersion: 1,
          previewId: expect.any(String),
          nodeCount: expect.any(Number),
          validationStatus: "passed",
        }),
      )
    })
  })

  it("inspects a workflow without requiring MCP configuration", async () => {
    await withoutN8nEnv(async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "ocn8n-plugin-"))
      await mkdir(path.join(directory, ".opencode"), { recursive: true })
      await writeFile(
        path.join(directory, ".opencode", "n8n-workflows.json"),
        `${JSON.stringify({
          workflows: [
            {
              workflowId: "wf_1",
              name: "Orders",
              url: "https://demo/workflow/wf_1",
              baseUrl: "https://demo/api/v1",
              managedBy: "opencode-n8n-builder",
              managedByVersion: "0.1.0",
              lastPlanHash: "hash",
              lastUpdatedAt: "2026-06-04T00:00:00.000Z",
            },
          ],
        })}\n`,
        "utf8",
      )
      const originalFetch = globalThis.fetch
      const fetchMock = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            id: "wf_1",
            name: "Orders",
            active: false,
            nodes: [
              {
                name: "Start",
                type: "n8n-nodes-base.manualTrigger",
                typeVersion: 1,
                position: [0, 0],
                parameters: {},
              },
            ],
            connections: {},
            settings: {},
            tags: [{ name: "opencode-n8n-builder" }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        )
      })
      globalThis.fetch = fetchMock as typeof fetch

      try {
        const plugin = createN8nBuilderPlugin({ version: "0.1.0" })
        const result = await plugin(
          mockPluginInput({
            directory,
            opencodeConfig: {
              n8n: {
                baseUrl: "https://demo/api/v1",
                apiKey: "key",
              },
            },
          }),
        )

        const output = parseToolOutput(
          await result.tool?.n8n_inspect_workflow.execute({ workflowId: "wf_1" }, {} as never),
        )

        expect(fetchMock).toHaveBeenCalledWith(
          "https://demo/api/v1/workflows/wf_1",
          expect.objectContaining({
            headers: expect.objectContaining({ "X-N8N-API-KEY": "key" }),
          }),
        )
        expect(output).toEqual(
          expect.objectContaining({
            workflowId: "wf_1",
            name: "Orders",
          }),
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  it("applies a v2 preview through API config without requiring MCP configuration", async () => {
    await withoutN8nEnv(async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "ocn8n-plugin-v2-apply-"))
      const plugin = createN8nBuilderPlugin({ version: "2.0.0" })
      const result = await plugin(
        mockPluginInput({
          directory,
          opencodeConfig: {
            n8n: {
              baseUrl: "https://demo/api/v1",
              apiKey: "key",
            },
          },
        }),
      )

      const preview = parseToolOutput(
        await result.tool?.n8n_v2_auto_preview.execute(
          {
            prompt: "Receive an order webhook and respond to the webhook.",
            name: "V2 order intake",
          },
          {} as never,
        ),
      ) as { previewId: string; planId: string; planVersion: number }

      const originalFetch = globalThis.fetch
      const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
        const workflow = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
        return new Response(JSON.stringify({ ...workflow, id: "wf_v2_1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      })
      globalThis.fetch = fetchMock as typeof fetch

      try {
        const applied = parseToolOutput(
          await result.tool?.n8n_v2_apply.execute(
            {
              previewId: preview.previewId,
              confirm: true,
            },
            {} as never,
          ),
        ) as { workflowId: string; mode: string; previewId: string; planId: string; planVersion: number }

        expect(fetchMock).toHaveBeenCalledWith(
          "https://demo/api/v1/workflows",
          expect.objectContaining({
            method: "POST",
            headers: expect.objectContaining({ "X-N8N-API-KEY": "key" }),
          }),
        )
        expect(applied).toEqual(
          expect.objectContaining({
            workflowId: "wf_v2_1",
            mode: "create",
            previewId: preview.previewId,
            planId: preview.planId,
            planVersion: preview.planVersion,
          }),
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  it("claims an active workflow read-only through API config without requiring MCP configuration", async () => {
    await withoutN8nEnv(async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "ocn8n-plugin-v2-claim-"))
      const originalFetch = globalThis.fetch
      const fetchMock = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            id: "wf_active",
            name: "Production Orders",
            active: true,
            nodes: [
              {
                name: "Webhook",
                type: "n8n-nodes-base.webhook",
                typeVersion: 2,
                position: [0, 0],
                parameters: {},
              },
            ],
            connections: {},
            settings: {},
            tags: [],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        )
      })
      globalThis.fetch = fetchMock as typeof fetch

      try {
        const plugin = createN8nBuilderPlugin({ version: "2.0.0" })
        const result = await plugin(
          mockPluginInput({
            directory,
            opencodeConfig: {
              n8n: {
                baseUrl: "https://demo/api/v1",
                apiKey: "key",
              },
            },
          }),
        )

        const output = parseToolOutput(
          await result.tool?.n8n_v2_claim_workflow.execute(
            { workflowId: "wf_active", mode: "apply", confirm: true },
            {} as never,
          ),
        ) as { workflowId: string; action: string; claimMode: string; markerWritten: boolean; registryWritten: boolean }

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock).toHaveBeenCalledWith(
          "https://demo/api/v1/workflows/wf_active",
          expect.objectContaining({
            method: "GET",
            headers: expect.objectContaining({ "X-N8N-API-KEY": "key" }),
          }),
        )
        expect(output).toEqual(
          expect.objectContaining({
            workflowId: "wf_active",
            action: "claim_read_only",
            claimMode: "read_only",
            markerWritten: false,
            registryWritten: true,
          }),
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  it("reverse plans an active read-only claimed workflow through API config without requiring MCP configuration", async () => {
    await withoutN8nEnv(async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "ocn8n-plugin-v2-reverse-"))
      const originalFetch = globalThis.fetch
      const fetchMock = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            id: "wf_active",
            name: "Production Orders",
            active: true,
            nodes: [
              {
                name: "Webhook",
                type: "n8n-nodes-base.webhook",
                typeVersion: 2,
                position: [0, 0],
                parameters: {},
              },
              {
                name: "Respond",
                type: "n8n-nodes-base.respondToWebhook",
                typeVersion: 1,
                position: [220, 0],
                parameters: {},
              },
            ],
            connections: {
              Webhook: { main: [[{ node: "Respond", type: "main", index: 0 }]] },
            },
            settings: {},
            tags: [],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        )
      })
      globalThis.fetch = fetchMock as typeof fetch

      try {
        const plugin = createN8nBuilderPlugin({ version: "2.0.0" })
        const result = await plugin(
          mockPluginInput({
            directory,
            opencodeConfig: {
              n8n: {
                baseUrl: "https://demo/api/v1",
                apiKey: "key",
              },
            },
          }),
        )

        await result.tool?.n8n_v2_claim_workflow.execute(
          { workflowId: "wf_active", mode: "apply", confirm: true },
          {} as never,
        )
        const output = parseToolOutput(
          await result.tool?.n8n_v2_reverse_plan.execute({ workflowId: "wf_active" }, {} as never),
        ) as { workflowId: string; source: string; mappedStepCount: number; planVersion: number }

        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(output).toEqual(
          expect.objectContaining({
            workflowId: "wf_active",
            source: "reverse",
            mappedStepCount: 2,
            planVersion: 1,
          }),
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  it("routes readiness preview without requiring OpenCode planner configuration", async () => {
    await withoutN8nEnv(async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "ocn8n-plugin-"))
      await mkdir(path.join(directory, ".opencode"), { recursive: true })
      await writeFile(
        path.join(directory, ".opencode", "n8n-workflows.json"),
        `${JSON.stringify({
          workflows: [
            {
              workflowId: "wf_1",
              name: "Orders",
              url: "https://demo/workflow/wf_1",
              baseUrl: "https://demo/api/v1",
              managedBy: "opencode-n8n-builder",
              managedByVersion: "0.8.0",
              lastPlanHash: "hash",
              lastUpdatedAt: "2026-06-04T00:00:00.000Z",
            },
          ],
        })}\n`,
        "utf8",
      )
      const originalFetch = globalThis.fetch
      const fetchMock = vi.fn(async (input: string) => {
        if (input.includes("/executions")) {
          return new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        }

        return new Response(
          JSON.stringify({
            id: "wf_1",
            name: "Orders",
            active: false,
            nodes: [],
            connections: {},
            settings: {},
            tags: [{ name: "opencode-n8n-builder" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      })
      globalThis.fetch = fetchMock as typeof fetch

      try {
        const plugin = createN8nBuilderPlugin({ version: "0.8.0" })
        const result = await plugin(
          mockPluginInput({
            directory,
            opencodeConfig: {
              n8n: {
                baseUrl: "https://demo/api/v1",
                apiKey: "key",
              },
            },
          }),
        )

        const output = parseToolOutput(
          await result.tool?.n8n_check_workflow_readiness.execute(
            { workflowId: "wf_1", mode: "preview" },
            {} as never,
          ),
        )

        expect(output).toEqual(
          expect.objectContaining({
            workflowId: "wf_1",
            mode: "preview",
          }),
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  it("previews workflow claim without requiring MCP configuration", async () => {
    await withoutN8nEnv(async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "ocn8n-plugin-"))
      const originalFetch = globalThis.fetch
      const fetchMock = vi.fn(async () => {
        return new Response(
          JSON.stringify({
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
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        )
      })
      globalThis.fetch = fetchMock as typeof fetch

      try {
        const plugin = createN8nBuilderPlugin({ version: "0.6.0" })
        const result = await plugin(
          mockPluginInput({
            directory,
            opencodeConfig: {
              n8n: {
                baseUrl: "https://demo/api/v1",
                apiKey: "key",
              },
            },
          }),
        )

        const output = parseToolOutput(
          await result.tool?.n8n_claim_workflow.execute({ workflowId: "wf_1", mode: "preview" }, {} as never),
        )

        expect(fetchMock).toHaveBeenCalledWith(
          "https://demo/api/v1/workflows/wf_1",
          expect.objectContaining({
            method: "GET",
            headers: expect.objectContaining({ "X-N8N-API-KEY": "key" }),
          }),
        )
        expect(output).toEqual(
          expect.objectContaining({
            workflowId: "wf_1",
            mode: "preview",
            eligible: true,
            action: "claim",
          }),
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  it("blocks inspect for marker-tagged workflows missing from the local registry", async () => {
    await withoutN8nEnv(async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "ocn8n-plugin-"))
      const originalFetch = globalThis.fetch
      const fetchMock = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            id: "wf_1",
            name: "Orders",
            active: false,
            nodes: [
              {
                name: "Start",
                type: "n8n-nodes-base.manualTrigger",
                typeVersion: 1,
                position: [0, 0],
                parameters: {},
              },
            ],
            connections: {},
            settings: {},
            tags: [{ name: "opencode-n8n-builder" }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        )
      })
      globalThis.fetch = fetchMock as typeof fetch

      try {
        const plugin = createN8nBuilderPlugin({ version: "0.1.0" })
        const result = await plugin(
          mockPluginInput({
            directory,
            opencodeConfig: {
              n8n: {
                baseUrl: "https://demo/api/v1",
                apiKey: "key",
              },
            },
          }),
        )

        await expect(
          result.tool?.n8n_inspect_workflow.execute({ workflowId: "wf_1" }, {} as never),
        ).rejects.toMatchObject({
          code: "WORKFLOW_INSPECT_BLOCKED",
          details: {
            workflowId: "wf_1",
            issues: [
              expect.objectContaining({
                code: "WORKFLOW_NOT_IN_REGISTRY",
              }),
            ],
          },
        })
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  it("passes configured MCP token to build workflow MCP requests", async () => {
    await withoutN8nEnv(async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "ocn8n-plugin-"))
      const plan = {
        name: "Manual E2E",
        summary: "Create a manual trigger with Set output.",
        nodes: [
          {
            key: "manual",
            name: "Manual Trigger",
            type: "n8n-nodes-base.manualTrigger",
            typeVersion: 1,
            position: [0, 0],
            parameters: {},
          },
          {
            key: "set",
            name: "Set Fields",
            type: "n8n-nodes-base.set",
            typeVersion: 3,
            position: [260, 0],
            parameters: {
              assignments: {
                assignments: [
                  {
                    id: "message",
                    name: "message",
                    type: "string",
                    value: "created by opencode",
                  },
                ],
              },
            },
          },
        ],
        connections: [{ from: "manual", to: "set" }],
      }
      const session = {
        create: vi.fn(async () => ({ id: "session_1" })),
        prompt: vi.fn(async () => ({
          data: {
            info: {},
            parts: [
              {
                type: "text",
                text: JSON.stringify({
                  plan,
                  sdkCode: "const workflow = { nodes: [] }",
                  nodeSelection: [
                    {
                      nodeType: "n8n-nodes-base.manualTrigger",
                      reason: "Starts the workflow manually.",
                    },
                    {
                      nodeType: "n8n-nodes-base.set",
                      reason: "Creates the requested output field.",
                    },
                  ],
                }),
              },
            ],
          },
        })),
      }
      const originalFetch = globalThis.fetch
      const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
        if (input === "https://demo/mcp") {
          const request = JSON.parse(init?.body as string) as { id: string; params?: { name?: string } }
          const textByToolName: Record<string, string> = {
            get_sdk_reference: "SDK docs",
            search_nodes: "Manual Trigger nodeType=n8n-nodes-base.manualTrigger\nSet nodeType=n8n-nodes-base.set",
            get_node_types: "Manual Trigger and Set node docs",
            get_suggested_nodes: "Use Manual Trigger with Set for manual data transformation workflows.",
            validate_workflow: JSON.stringify({
              valid: true,
              nodeCount: 2,
              warnings: [
                {
                  code: "MISSING_DESCRIPTION",
                  message: "Add description",
                  nodeName: "Manual Trigger",
                },
              ],
              errors: [],
            }),
          }
          const text = textByToolName[request.params?.name ?? ""] ?? "No node ids."

          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              result: { content: [{ type: "text", text }] },
            }),
            { status: 200 },
          )
        }

        return new Response(
          JSON.stringify({
            id: "wf_1",
            name: "Manual E2E",
            active: false,
            nodes: [],
            connections: {},
            settings: {},
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        )
      })
      globalThis.fetch = fetchMock as typeof fetch

      try {
        const plugin = createN8nBuilderPlugin({ version: "0.1.0" })
        const result = await plugin(
          mockPluginInput({
            directory,
            session,
            opencodeConfig: {
              n8n: {
                baseUrl: "https://demo/api/v1",
                apiKey: "key",
                mcpUrl: "https://demo/mcp",
                mcpToken: "mcp_token",
              },
            },
          }),
        )

        const output = parseToolOutput(
          await result.tool?.n8n_build_workflow.execute(
            { prompt: "Build a manual workflow to set a field" },
            {} as never,
          ),
        )
        const mcpToolNames = fetchMock.mock.calls
          .filter(([input]) => input === "https://demo/mcp")
          .map(([, init]) => {
            const request = JSON.parse((init as RequestInit | undefined)?.body as string) as {
              params?: { name?: string }
            }
            return request.params?.name
          })

        expect(fetchMock).toHaveBeenCalledWith(
          "https://demo/mcp",
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: "Bearer mcp_token",
            }),
          }),
        )
        expect(mcpToolNames).toContain("get_suggested_nodes")
        expect(mcpToolNames).toContain("validate_workflow")
        expect(output).toEqual(
          expect.objectContaining({
            workflowId: "wf_1",
            name: "Manual E2E",
          }),
        )
        expect((output as { warnings?: Array<{ code?: string }> }).warnings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: "MCP_MISSING_DESCRIPTION",
            }),
          ]),
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })
})
