import type { PluginInput } from "@opencode-ai/plugin"
import { describe, expect, it, vi } from "vitest"
import { N8nBuilderPlugin, createN8nBuilderPlugin } from "../src/index.js"

describe("plugin exports", () => {
  it("exports a plugin factory and default plugin function", () => {
    expect(typeof createN8nBuilderPlugin).toBe("function")
    expect(typeof N8nBuilderPlugin).toBe("function")
  })

  it("logs the configured version during initialization", async () => {
    const log = vi.fn().mockResolvedValue(undefined)
    const plugin = createN8nBuilderPlugin({ version: "9.9.9" })

    const result = await plugin({
      client: {
        app: {
          log,
        },
      },
    } as unknown as PluginInput)

    expect(log).toHaveBeenCalledWith({
      body: {
        service: "opencode-n8n-builder",
        level: "info",
        message: "Plugin initialized",
        extra: { version: "9.9.9" },
      },
    })
    expect(result).toEqual({ tool: {} })
  })
})
