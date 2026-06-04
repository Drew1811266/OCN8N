import path from "node:path"
import { N8nBuilderError } from "./errors.js"
import type { CredentialEnvMapping, Env, PluginConfig } from "./types.js"

export type LoadPluginConfigInput = {
  env: Env
  opencodeConfig: unknown
  workspaceDir: string
  pluginVersion?: string
}

type OpencodeN8nConfig = {
  n8n?: {
    baseUrl?: string
    apiKey?: string
    mcpUrl?: string
    credentialEnv?: Record<string, CredentialEnvMapping>
    projectId?: string
    folderId?: string
  }
}

function asOpencodeN8nConfig(value: unknown): OpencodeN8nConfig {
  if (!value || typeof value !== "object") return {}
  return value as OpencodeN8nConfig
}

export function loadPluginConfig(input: LoadPluginConfigInput): PluginConfig {
  const opencode = asOpencodeN8nConfig(input.opencodeConfig)
  const n8n = opencode.n8n ?? {}

  const baseUrl = n8n.baseUrl ?? input.env.N8N_BASE_URL
  const apiKey = n8n.apiKey ?? input.env.N8N_API_KEY
  const mcpUrl = n8n.mcpUrl ?? input.env.N8N_MCP_URL

  const missing = [
    ["N8N_BASE_URL", baseUrl],
    ["N8N_API_KEY", apiKey],
    ["N8N_MCP_URL", mcpUrl],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (missing.length > 0) {
    throw new N8nBuilderError(
      `Missing required n8n configuration: ${missing.join(", ")}`,
      "CONFIG_MISSING",
      { missing },
    )
  }

  return {
    baseUrl: baseUrl as string,
    apiKey: apiKey as string,
    mcpUrl: mcpUrl as string,
    workspaceDir: input.workspaceDir,
    registryPath: path.join(input.workspaceDir, ".opencode", "n8n-workflows.json"),
    previewDir: path.join(input.workspaceDir, ".opencode", "n8n-update-previews"),
    credentialEnv: n8n.credentialEnv ?? {},
    defaultProjectId: n8n.projectId,
    defaultFolderId: n8n.folderId,
    pluginVersion: input.pluginVersion ?? "0.1.0",
  }
}
