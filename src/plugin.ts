import type { Plugin } from "@opencode-ai/plugin"

export type N8nBuilderPluginOptions = {
  version?: string
}

export function createN8nBuilderPlugin(options: N8nBuilderPluginOptions = {}): Plugin {
  const version = options.version ?? "0.1.0"

  const plugin: Plugin = async ({ client }) => {
    await client.app.log({
      body: {
        service: "opencode-n8n-builder",
        level: "info",
        message: "Plugin initialized",
        extra: { version },
      },
    })

    return {
      tool: {},
    }
  }

  return plugin
}

export const N8nBuilderPlugin = createN8nBuilderPlugin()
