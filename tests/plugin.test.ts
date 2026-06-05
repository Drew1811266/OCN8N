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
} = {}): PluginInput {
  return {
    directory: input.directory ?? "/tmp/project",
    worktree: input.directory ?? "/tmp/project",
    client: {
      app: {
        log: input.log ?? vi.fn().mockResolvedValue(undefined),
      },
      config: {
        get: vi.fn().mockResolvedValue(input.opencodeConfig ?? { n8n: {} }),
      },
    },
  } as unknown as PluginInput
}

async function withoutN8nEnv<T>(fn: () => Promise<T>): Promise<T> {
  const original = {
    N8N_BASE_URL: process.env.N8N_BASE_URL,
    N8N_API_KEY: process.env.N8N_API_KEY,
    N8N_MCP_URL: process.env.N8N_MCP_URL,
  }

  delete process.env.N8N_BASE_URL
  delete process.env.N8N_API_KEY
  delete process.env.N8N_MCP_URL

  try {
    return await fn()
  } finally {
    restoreEnv("N8N_BASE_URL", original.N8N_BASE_URL)
    restoreEnv("N8N_API_KEY", original.N8N_API_KEY)
    restoreEnv("N8N_MCP_URL", original.N8N_MCP_URL)
  }
}

function restoreEnv(name: "N8N_BASE_URL" | "N8N_API_KEY" | "N8N_MCP_URL", value: string | undefined): void {
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

  it("registers the four n8n tools", async () => {
    const plugin = createN8nBuilderPlugin({ version: "0.1.0" })

    const result = await plugin(mockPluginInput())

    expect(Object.keys(result.tool ?? {})).toEqual([
      "n8n_build_workflow",
      "n8n_update_workflow",
      "n8n_inspect_workflow",
      "n8n_list_managed_workflows",
    ])
    expect(Object.keys(result.tool?.n8n_build_workflow.args ?? {})).toEqual(["prompt", "name"])
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
})
