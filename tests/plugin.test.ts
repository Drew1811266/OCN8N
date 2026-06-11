import { mkdtemp } from "node:fs/promises"
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

  it("registers v2 public tools only", async () => {
    const plugin = createN8nBuilderPlugin()

    const result = await plugin(mockPluginInput())

    expect(Object.keys(result.tool ?? {})).toEqual([
      "n8n_v2_auto_preview",
      "n8n_v2_create_plan",
      "n8n_v2_review_plan",
      "n8n_v2_patch_plan",
      "n8n_v2_validate_simulate",
      "n8n_v2_compile_preview",
      "n8n_v2_apply",
      "n8n_v2_claim_workflow",
      "n8n_v2_reverse_plan",
      "n8n_v2_run_trial",
    ])
    expect(result.tool?.n8n_build_workflow).toBeUndefined()
    expect(result.tool?.n8n_update_workflow).toBeUndefined()
    expect(result.tool?.n8n_claim_workflow).toBeUndefined()
    expect(result.tool?.n8n_check_workflow_readiness).toBeUndefined()
    expect(result.tool?.n8n_inspect_workflow).toBeUndefined()
    expect(result.tool?.n8n_list_managed_workflows).toBeUndefined()
    expect(Object.keys(result.tool?.n8n_v2_auto_preview.args ?? {})).toEqual(["prompt", "name"])
    expect(Object.keys(result.tool?.n8n_v2_create_plan.args ?? {})).toEqual(["prompt", "name"])
    expect(Object.keys(result.tool?.n8n_v2_review_plan.args ?? {})).toEqual(["planId", "planVersion"])
    expect(Object.keys(result.tool?.n8n_v2_patch_plan.args ?? {})).toEqual(["planId", "planVersion", "patch"])
    expect(Object.keys(result.tool?.n8n_v2_validate_simulate.args ?? {})).toEqual(["planId", "planVersion"])
    expect(Object.keys(result.tool?.n8n_v2_compile_preview.args ?? {})).toEqual(["planId", "planVersion", "workflowId"])
    expect(Object.keys(result.tool?.n8n_v2_apply.args ?? {})).toEqual(["previewId", "confirm", "workflowId"])
    expect(Object.keys(result.tool?.n8n_v2_claim_workflow.args ?? {})).toEqual(["workflowId", "mode", "confirm"])
    expect(Object.keys(result.tool?.n8n_v2_reverse_plan.args ?? {})).toEqual(["workflowId"])
    expect(Object.keys(result.tool?.n8n_v2_run_trial.args ?? {})).toEqual(["previewId", "mode", "confirm", "sampleName"])
  })

  it("logs the default v2 version during initialization", async () => {
    const log = vi.fn().mockResolvedValue(undefined)
    const plugin = createN8nBuilderPlugin()

    const result = await plugin(mockPluginInput({ log }))

    expect(log).toHaveBeenCalledWith({
      body: {
        service: "opencode-n8n-builder",
        level: "info",
        message: "Plugin initialized",
        extra: { version: "2.0.0" },
      },
    })
    expect(result.tool).toEqual(expect.any(Object))
  })

  it("logs a configured version override during initialization", async () => {
    const log = vi.fn().mockResolvedValue(undefined)
    const plugin = createN8nBuilderPlugin({ version: "9.9.9" })

    await plugin(mockPluginInput({ log }))

    expect(log).toHaveBeenCalledWith({
      body: {
        service: "opencode-n8n-builder",
        level: "info",
        message: "Plugin initialized",
        extra: { version: "9.9.9" },
      },
    })
  })

  it("runs v2 local plan tools without n8n API or MCP configuration", async () => {
    await withoutN8nEnv(async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "ocn8n-plugin-v2-"))
      const plugin = createN8nBuilderPlugin()
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

      const trial = parseToolOutput(
        await result.tool?.n8n_v2_run_trial.execute(
          {
            previewId: compiled.previewId,
            mode: "dry_run",
            confirm: true,
            sampleName: "valid order",
          },
          {} as never,
        ),
      ) as { previewId: string; mode: string; status: string; triggered: boolean; executionMode: string }
      expect(trial).toEqual(
        expect.objectContaining({
          previewId: compiled.previewId,
          mode: "dry_run",
          status: "passed",
          triggered: false,
          executionMode: "not_triggered",
        }),
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

  it("runs MCP workflow validation during configured local v2 compile preview", async () => {
    await withoutN8nEnv(async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "ocn8n-plugin-v2-mcp-"))
      const plugin = createN8nBuilderPlugin()
      const result = await plugin(
        mockPluginInput({
          directory,
          opencodeConfig: {
            n8n: {
              mcpUrl: "https://mcp.example/rpc",
              mcpToken: "mcp_token",
            },
          },
        }),
      )

      const created = parseToolOutput(
        await result.tool?.n8n_v2_create_plan.execute(
          {
            prompt:
              "Create a webhook order workflow that maps fields, branches by status, calls an external fulfillment API, retries failures, and responds to the webhook.",
            name: "MCP validated orders",
          },
          {} as never,
        ),
      ) as { planId: string; planVersion: number }

      const originalFetch = globalThis.fetch
      const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          id?: string
          params?: { name?: string; arguments?: { code?: string } }
        }

        expect(body.params?.name).toBe("validate_workflow")
        expect(body.params?.arguments?.code).toContain("new Workflow")

        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    valid: true,
                    warnings: [
                      {
                        code: "NODE_PARAMETER_OPTIONAL",
                        message: "Optional response field should be reviewed.",
                      },
                    ],
                    errors: [],
                  }),
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        )
      })
      globalThis.fetch = fetchMock as typeof fetch

      try {
        const compiled = parseToolOutput(
          await result.tool?.n8n_v2_compile_preview.execute(
            { planId: created.planId, planVersion: created.planVersion },
            {} as never,
          ),
        ) as { mcpValidationStatus: string; warnings: Array<{ code: string; message: string }> }

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock).toHaveBeenCalledWith(
          "https://mcp.example/rpc",
          expect.objectContaining({
            method: "POST",
            headers: expect.objectContaining({ Authorization: "Bearer mcp_token" }),
          }),
        )
        expect(compiled.mcpValidationStatus).toBe("warning")
        expect(compiled.warnings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: "MCP_NODE_PARAMETER_OPTIONAL",
              message: "Optional response field should be reviewed.",
            }),
          ]),
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })

  it("applies a v2 preview through API config without requiring MCP configuration", async () => {
    await withoutN8nEnv(async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "ocn8n-plugin-v2-apply-"))
      const plugin = createN8nBuilderPlugin()
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

  it("updates a v2-claimed inactive workflow through API config without requiring MCP configuration", async () => {
    await withoutN8nEnv(async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "ocn8n-plugin-v2-update-apply-"))
      const plugin = createN8nBuilderPlugin()
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
            name: "Updated claimed workflow",
          },
          {} as never,
        ),
      ) as { previewId: string; planId: string; planVersion: number }

      const externalWorkflow = {
        id: "wf_claimed",
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
      }
      let claimedWorkflow = externalWorkflow
      const originalFetch = globalThis.fetch
      const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
        const method = init?.method ?? "GET"
        if (input === "https://demo/api/v1/workflows/wf_claimed" && method === "GET") {
          return new Response(JSON.stringify(claimedWorkflow), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        }

        if (input === "https://demo/api/v1/workflows/wf_claimed" && method === "PUT") {
          const workflow = JSON.parse(String(init?.body ?? "{}")) as typeof externalWorkflow
          claimedWorkflow = { ...workflow, id: "wf_claimed" }
          return new Response(JSON.stringify(claimedWorkflow), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        }

        return new Response(JSON.stringify({ error: "unexpected request" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        })
      })
      globalThis.fetch = fetchMock as typeof fetch

      try {
        const claimed = parseToolOutput(
          await result.tool?.n8n_v2_claim_workflow.execute(
            { workflowId: "wf_claimed", mode: "apply", confirm: true },
            {} as never,
          ),
        ) as { workflowId: string; claimMode: string; markerWritten: boolean }
        expect(claimed).toEqual(
          expect.objectContaining({
            workflowId: "wf_claimed",
            claimMode: "full",
            markerWritten: true,
          }),
        )

        const updatePreview = parseToolOutput(
          await result.tool?.n8n_v2_compile_preview.execute(
            {
              planId: preview.planId,
              planVersion: preview.planVersion,
              workflowId: "wf_claimed",
            },
            {} as never,
          ),
        ) as {
          updateTarget?: {
            workflowId: string
            hasChanges: boolean
            diff: { removedNodes: Array<{ nodeName: string }>; addedNodes: Array<{ nodeName: string }> }
          }
        }
        expect(updatePreview.updateTarget).toEqual(
          expect.objectContaining({
            workflowId: "wf_claimed",
            hasChanges: true,
          }),
        )
        expect(updatePreview.updateTarget?.diff.removedNodes).toEqual(
          expect.arrayContaining([expect.objectContaining({ nodeName: "Manual Trigger" })]),
        )
        expect(updatePreview.updateTarget?.diff.addedNodes).toEqual(
          expect.arrayContaining([expect.objectContaining({ nodeName: "Receive input" })]),
        )

        const applied = parseToolOutput(
          await result.tool?.n8n_v2_apply.execute(
            {
              previewId: preview.previewId,
              workflowId: "wf_claimed",
              confirm: true,
            },
            {} as never,
          ),
        ) as { workflowId: string; mode: string; previewId: string; planId: string; planVersion: number }

        expect(fetchMock).toHaveBeenCalledWith(
          "https://demo/api/v1/workflows/wf_claimed",
          expect.objectContaining({
            method: "GET",
            headers: expect.objectContaining({ "X-N8N-API-KEY": "key" }),
          }),
        )
        expect(fetchMock).toHaveBeenCalledWith(
          "https://demo/api/v1/workflows/wf_claimed",
          expect.objectContaining({
            method: "PUT",
            headers: expect.objectContaining({ "X-N8N-API-KEY": "key" }),
          }),
        )
        expect(applied).toEqual(
          expect.objectContaining({
            workflowId: "wf_claimed",
            mode: "update",
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
        const plugin = createN8nBuilderPlugin()
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
        const plugin = createN8nBuilderPlugin()
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
})
