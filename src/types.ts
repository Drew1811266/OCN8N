export type Env = Record<string, string | undefined>

export type CredentialEnvMapping = {
  name: string
  type: string
  env: Record<string, string>
}

export type PluginConfig = {
  baseUrl: string
  apiKey: string
  mcpUrl: string
  mcpToken?: string
  workspaceDir: string
  registryPath: string
  previewDir: string
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
