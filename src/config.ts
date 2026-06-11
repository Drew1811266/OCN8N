import path from "node:path"
import { N8nBuilderError } from "./errors.js"
import type { CredentialAuthMode, CredentialEnvMapping, Env, PluginConfig } from "./types.js"

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

type PlainRecord = Record<string, unknown>

export type LocalPluginConfig = Pick<
  PluginConfig,
  | "workspaceDir"
  | "registryPath"
  | "previewDir"
  | "v2"
  | "credentialEnv"
  | "defaultProjectId"
  | "defaultFolderId"
  | "pluginVersion"
> &
  Partial<Pick<PluginConfig, "mcpUrl" | "mcpToken">>

export type ApiPluginConfig = Omit<PluginConfig, "mcpUrl" | "mcpToken"> &
  Partial<Pick<PluginConfig, "mcpUrl" | "mcpToken">>

const optionalStringFields = ["baseUrl", "apiKey", "mcpUrl", "mcpToken", "projectId", "folderId"] as const
const credentialAuthModes = new Set(["api_key", "oauth2", "manual"])

function isPlainObject(value: unknown): value is PlainRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function throwInvalidConfig(field: string, reason: string): never {
  throw new N8nBuilderError(`Invalid n8n configuration: ${field} ${reason}.`, "CONFIG_INVALID", {
    field,
    reason,
  })
}

function readOptionalString(value: PlainRecord, field: (typeof optionalStringFields)[number]): string | undefined {
  const fieldValue = value[field]
  if (fieldValue === undefined) return undefined
  if (typeof fieldValue !== "string") {
    throwInvalidConfig(`n8n.${field}`, "must be a string")
  }

  return fieldValue
}

function readCredentialEnvMapping(id: string, value: unknown): CredentialEnvMapping {
  const field = `n8n.credentialEnv.${id}`
  if (!isPlainObject(value)) {
    throwInvalidConfig(field, "must be an object")
  }

  if (typeof value.name !== "string") {
    throwInvalidConfig(`${field}.name`, "must be a string")
  }

  if (typeof value.type !== "string") {
    throwInvalidConfig(`${field}.type`, "must be a string")
  }

  if (!isPlainObject(value.env)) {
    throwInvalidConfig(`${field}.env`, "must be an object")
  }

  const env: Record<string, string> = {}
  for (const [envField, envValue] of Object.entries(value.env)) {
    if (typeof envValue !== "string") {
      throwInvalidConfig(`${field}.env.${envField}`, "must be a string")
    }

    env[envField] = envValue
  }

  const authMode = readCredentialAuthMode(`${field}.authMode`, value.authMode)
  const setupUrl = readOptionalCredentialString(`${field}.setupUrl`, value.setupUrl)
  const docs = readOptionalStringArray(`${field}.docs`, value.docs)

  return {
    name: value.name,
    type: value.type,
    env,
    ...(authMode ? { authMode } : {}),
    ...(setupUrl ? { setupUrl } : {}),
    ...(docs ? { docs } : {}),
  }
}

function readCredentialAuthMode(field: string, value: unknown): CredentialAuthMode | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string" || !credentialAuthModes.has(value)) {
    throwInvalidConfig(field, "must be one of api_key, oauth2, manual")
  }

  return value as CredentialAuthMode
}

function readOptionalCredentialString(field: string, value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string") {
    throwInvalidConfig(field, "must be a string")
  }

  return value
}

function readOptionalStringArray(field: string, value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throwInvalidConfig(field, "must be an array of strings")
  }

  return value
}

function readCredentialEnv(value: unknown): Record<string, CredentialEnvMapping> {
  if (value === undefined) return {}
  if (!isPlainObject(value)) {
    throwInvalidConfig("n8n.credentialEnv", "must be an object")
  }

  const credentialEnv: Record<string, CredentialEnvMapping> = {}
  for (const [id, mapping] of Object.entries(value)) {
    credentialEnv[id] = readCredentialEnvMapping(id, mapping)
  }

  return credentialEnv
}

function asOpencodeN8nConfig(value: unknown): OpencodeN8nConfig {
  if (!value || typeof value !== "object") return {}
  const n8n = (value as Record<string, unknown>).n8n
  if (n8n === undefined) return {}
  if (!isPlainObject(n8n)) {
    throwInvalidConfig("n8n", "must be a plain object")
  }

  return {
    n8n: {
      baseUrl: readOptionalString(n8n, "baseUrl"),
      apiKey: readOptionalString(n8n, "apiKey"),
      mcpUrl: readOptionalString(n8n, "mcpUrl"),
      credentialEnv: readCredentialEnv(n8n.credentialEnv),
      projectId: readOptionalString(n8n, "projectId"),
      folderId: readOptionalString(n8n, "folderId"),
    },
  }
}

export function loadPluginConfig(input: LoadPluginConfigInput): PluginConfig {
  const opencode = asOpencodeN8nConfig(input.opencodeConfig)
  const n8n = opencode.n8n ?? {}

  const baseUrl = n8n.baseUrl ?? input.env.N8N_BASE_URL
  const apiKey = n8n.apiKey ?? input.env.N8N_API_KEY
  const mcpUrl = n8n.mcpUrl ?? input.env.N8N_MCP_URL
  const mcpToken = readOpencodeMcpToken(input.opencodeConfig) ?? input.env.N8N_MCP_TOKEN

  requireConfigValues([
    ["N8N_BASE_URL", baseUrl],
    ["N8N_API_KEY", apiKey],
    ["N8N_MCP_URL", mcpUrl],
  ])

  return {
    ...localConfigFromInput(input, n8n),
    baseUrl: baseUrl as string,
    apiKey: apiKey as string,
    mcpUrl: mcpUrl as string,
    ...(mcpToken ? { mcpToken } : {}),
  }
}

function readOpencodeMcpToken(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined
  const n8n = (value as Record<string, unknown>).n8n
  if (n8n === undefined) return undefined
  if (!isPlainObject(n8n)) {
    throwInvalidConfig("n8n", "must be a plain object")
  }

  return readOptionalString(n8n, "mcpToken")
}

export function loadApiPluginConfig(input: LoadPluginConfigInput): ApiPluginConfig {
  const opencode = asOpencodeN8nConfig(input.opencodeConfig)
  const n8n = opencode.n8n ?? {}

  const baseUrl = n8n.baseUrl ?? input.env.N8N_BASE_URL
  const apiKey = n8n.apiKey ?? input.env.N8N_API_KEY

  requireConfigValues([
    ["N8N_BASE_URL", baseUrl],
    ["N8N_API_KEY", apiKey],
  ])

  return {
    ...localConfigFromInput(input, n8n, { includeMcp: true }),
    baseUrl: baseUrl as string,
    apiKey: apiKey as string,
  }
}

export function loadLocalPluginConfig(input: LoadPluginConfigInput): LocalPluginConfig {
  const opencode = asOpencodeN8nConfig(input.opencodeConfig)
  const n8n = opencode.n8n ?? {}

  return localConfigFromInput(input, n8n, { includeMcp: true })
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

function localConfigFromInput(
  input: LoadPluginConfigInput,
  n8n: NonNullable<OpencodeN8nConfig["n8n"]>,
  options: { includeMcp?: boolean } = {},
): LocalPluginConfig {
  return {
    workspaceDir: input.workspaceDir,
    registryPath: path.join(input.workspaceDir, ".opencode", "n8n-workflows.json"),
    previewDir: path.join(input.workspaceDir, ".opencode", "n8n-update-previews"),
    v2: v2ArtifactPaths(input.workspaceDir),
    credentialEnv: n8n.credentialEnv ?? {},
    defaultProjectId: n8n.projectId,
    defaultFolderId: n8n.folderId,
    pluginVersion: input.pluginVersion ?? "1.0.0",
    ...(options.includeMcp ? localMcpConfigFromInput(input, n8n) : {}),
  }
}

function localMcpConfigFromInput(
  input: LoadPluginConfigInput,
  n8n: NonNullable<OpencodeN8nConfig["n8n"]>,
): Partial<Pick<PluginConfig, "mcpUrl" | "mcpToken">> {
  const mcpUrl = n8n.mcpUrl ?? input.env.N8N_MCP_URL
  if (!mcpUrl) return {}

  const mcpToken = readOpencodeMcpToken(input.opencodeConfig) ?? input.env.N8N_MCP_TOKEN

  return {
    mcpUrl,
    ...(mcpToken ? { mcpToken } : {}),
  }
}

function requireConfigValues(values: Array<[string, string | undefined]>): void {
  const missing = values.filter(([, value]) => !value).map(([name]) => name)

  if (missing.length > 0) {
    throw new N8nBuilderError(
      `Missing required n8n configuration: ${missing.join(", ")}`,
      "CONFIG_MISSING",
      { missing },
    )
  }
}
