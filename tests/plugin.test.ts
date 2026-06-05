import type { PluginInput } from "@opencode-ai/plugin"
import { describe, expect, it, vi } from "vitest"
import { N8nBuilderPlugin, createN8nBuilderPlugin } from "../src/index.js"

function mockPluginInput(log = vi.fn().mockResolvedValue(undefined)): PluginInput {
  return {
    directory: "/tmp/project",
    worktree: "/tmp/project",
    client: {
      app: {
        log,
      },
      config: {
        get: vi.fn().mockResolvedValue({ n8n: {} }),
      },
    },
  } as unknown as PluginInput
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
  })

  it("logs the configured version during initialization", async () => {
    const log = vi.fn().mockResolvedValue(undefined)
    const plugin = createN8nBuilderPlugin({ version: "9.9.9" })

    const result = await plugin(mockPluginInput(log))

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
})
