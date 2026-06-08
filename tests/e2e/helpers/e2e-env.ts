import path from "node:path"
import type { Env, PluginConfig } from "../../../src/types.js"

export type E2eRuntimeConfigInput = {
  env: Env
  workspaceDir: string
  pluginVersion: string
}

export function requiredEnv(env: Env, name: string): string {
  const value = env[name]
  if (!value) {
    throw new Error(`Missing required E2E environment variable: ${name}`)
  }

  return value
}

function deriveMcpUrl(baseUrl: string): string {
  const appRoot = baseUrl.replace(/\/api\/v\d+\/?$/i, "").replace(/\/+$/, "")

  return `${appRoot}/mcp`
}

export function createE2eRuntimeConfig(input: E2eRuntimeConfigInput): PluginConfig {
  const baseUrl = requiredEnv(input.env, "N8N_E2E_BASE_URL")
  const apiKey = requiredEnv(input.env, "N8N_E2E_API_KEY")
  const configuredMcpUrl = input.env.N8N_E2E_MCP_URL?.trim()
  const mcpUrl = configuredMcpUrl || deriveMcpUrl(baseUrl)
  const mcpToken = input.env.N8N_E2E_MCP_TOKEN

  return {
    baseUrl,
    apiKey,
    mcpUrl,
    ...(mcpToken ? { mcpToken } : {}),
    workspaceDir: input.workspaceDir,
    registryPath: path.join(input.workspaceDir, ".opencode", "n8n-workflows.json"),
    previewDir: path.join(input.workspaceDir, ".opencode", "n8n-update-previews"),
    credentialEnv: {},
    pluginVersion: input.pluginVersion,
  }
}

export function redactSecrets(value: string): string {
  return value
    .replace(
      /(["']?(?:apiKey|api[_-]?key|token|password|secret|N8N_E2E_API_KEY|N8N_E2E_MCP_TOKEN|X-N8N-API-KEY)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,}]+)/gi,
      (_match, prefix: string, rawValue: string) => {
        const quote = rawValue.startsWith("\"") ? "\"" : rawValue.startsWith("'") ? "'" : ""

        return `${prefix}${quote}[REDACTED]${quote}`
      },
    )
    .replace(/Authorization:\s*Bearer\s+[^\s]+/gi, "Authorization: Bearer [REDACTED]")
}
