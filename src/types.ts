export type Env = Record<string, string | undefined>

export type CredentialAuthMode = "api_key" | "oauth2" | "manual"

export type CredentialEnvMapping = {
  name: string
  type: string
  env: Record<string, string>
  authMode?: CredentialAuthMode
  setupUrl?: string
  docs?: string[]
}

export type CredentialActionStatus = "resolved" | "required"

export type CredentialActionType =
  | "reuse_existing"
  | "create_from_env"
  | "set_missing_env"
  | "configure_mapping"
  | "complete_oauth_in_n8n"

export type CredentialSetupAction = {
  nodeName: string
  credentialType: string
  credentialName?: string
  action: CredentialActionType
  status: CredentialActionStatus
  message: string
  requiredEnv?: string[]
  manualSetupUrl?: string
  docs?: string[]
}

export type V2ArtifactPaths = {
  rootDir: string
  plansDir: string
  simulationsDir: string
  previewsDir: string
  registryPath: string
  claimsDir: string
  runsDir: string
  exportsDir: string
}

export type PluginConfig = {
  baseUrl: string
  apiKey: string
  mcpUrl: string
  mcpToken?: string
  workspaceDir: string
  registryPath: string
  previewDir: string
  v2: V2ArtifactPaths
  credentialEnv: Record<string, CredentialEnvMapping>
  defaultProjectId?: string
  defaultFolderId?: string
  pluginVersion: string
}

export type Warning = {
  code: string
  message: string
  nodeName?: string
}

export type CredentialGap = {
  nodeName: string
  credentialType: string
  credentialName?: string
  reason: string
}

export type ManagedMarker = {
  managedBy: "opencode-n8n-builder"
  managedByVersion: string
  createdAt: string
  workspaceId?: string
}
