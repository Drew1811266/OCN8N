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

export function createE2eRuntimeConfig(input: E2eRuntimeConfigInput): PluginConfig {
  const baseUrl = requiredEnv(input.env, "N8N_E2E_BASE_URL")
  const apiKey = requiredEnv(input.env, "N8N_E2E_API_KEY")
  const mcpUrl = input.env.N8N_E2E_MCP_URL ?? `${baseUrl.replace(/\/api\/v\d+\/?$/i, "")}/mcp`
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
    .replace(/\b(apiKey|api[_-]?key|token|password|secret)=([^\s]+)/gi, "$1=[REDACTED]")
    .replace(/\bN8N_E2E_API_KEY=([^\s]+)/g, "N8N_E2E_API_KEY=[REDACTED]")
    .replace(/\bN8N_E2E_MCP_TOKEN=([^\s]+)/g, "N8N_E2E_MCP_TOKEN=[REDACTED]")
    .replace(/Authorization:\s*Bearer\s+[^\s]+/gi, "Authorization: Bearer [REDACTED]")
}
