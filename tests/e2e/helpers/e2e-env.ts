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

  return `${appRoot}/mcp-server/http`
}

function v2ArtifactPaths(workspaceDir: string): PluginConfig["v2"] {
  const rootDir = path.join(workspaceDir, ".opencode", "n8n-v2")

  return {
    rootDir,
    plansDir: path.join(rootDir, "plans"),
    simulationsDir: path.join(rootDir, "simulations"),
    previewsDir: path.join(rootDir, "previews"),
    registryPath: path.join(rootDir, "registry", "workflows.json"),
    claimsDir: path.join(rootDir, "claims"),
    runsDir: path.join(rootDir, "runs"),
    exportsDir: path.join(rootDir, "exports"),
  }
}

export function createE2eRuntimeConfig(input: E2eRuntimeConfigInput): PluginConfig {
  const baseUrl = requiredEnv(input.env, "N8N_E2E_BASE_URL").trim()
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
    v2: v2ArtifactPaths(input.workspaceDir),
    credentialEnv: {},
    pluginVersion: input.pluginVersion,
  }
}

export function redactSecrets(value: string): string {
  return value
    .replace(
      /(["']?authorization["']?\s*:\s*)("Bearer\s+[^"]*"|'Bearer\s+[^']*'|Bearer\s+[^\s,}]+)/gi,
      (_match, prefix: string, rawValue: string) => {
        const quote = rawValue.startsWith("\"") ? "\"" : rawValue.startsWith("'") ? "'" : ""

        return `${prefix}${quote}Bearer [REDACTED]${quote}`
      },
    )
    .replace(
      /(["']?(?:apiKey|api[_-]?key|token|password|secret|N8N_E2E_API_KEY|N8N_E2E_MCP_TOKEN|X-N8N-API-KEY)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,}]+)/gi,
      (_match, prefix: string, rawValue: string) => {
        const quote = rawValue.startsWith("\"") ? "\"" : rawValue.startsWith("'") ? "'" : ""

        return `${prefix}${quote}[REDACTED]${quote}`
      },
    )
    .replace(/Authorization:\s*Bearer\s+[^\s]+/gi, "Authorization: Bearer [REDACTED]")
}
