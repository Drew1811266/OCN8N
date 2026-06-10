import type { CredentialSetupAction } from "./types.js"

export function credentialSetupUrl(baseUrl: string): string {
  const appBaseUrl = baseUrl.replace(/\/api\/v\d+\/?$/i, "").replace(/\/+$/, "")
  return `${appBaseUrl}/credentials`
}

export function buildConfigureMappingAction(input: {
  baseUrl: string
  nodeName: string
  credentialType: string
}): CredentialSetupAction {
  return {
    nodeName: input.nodeName,
    credentialType: input.credentialType,
    action: "configure_mapping",
    status: "required",
    message: `Configure n8n.credentialEnv.${input.credentialType} so the plugin can reuse or create this credential.`,
    manualSetupUrl: credentialSetupUrl(input.baseUrl),
  }
}

export function buildMissingEnvAction(input: {
  baseUrl: string
  nodeName: string
  credentialType: string
  credentialName: string
  requiredEnv: string[]
  setupUrl?: string
  docs?: string[]
}): CredentialSetupAction {
  return {
    nodeName: input.nodeName,
    credentialType: input.credentialType,
    credentialName: input.credentialName,
    action: "set_missing_env",
    status: "required",
    message: `Set missing environment variables for ${input.credentialName}: ${input.requiredEnv.join(", ")}.`,
    requiredEnv: input.requiredEnv,
    manualSetupUrl: input.setupUrl ?? credentialSetupUrl(input.baseUrl),
    ...(input.docs ? { docs: input.docs } : {}),
  }
}

export function buildOAuthSetupAction(input: {
  baseUrl: string
  nodeName: string
  credentialType: string
  credentialName: string
  setupUrl?: string
  docs?: string[]
}): CredentialSetupAction {
  return {
    nodeName: input.nodeName,
    credentialType: input.credentialType,
    credentialName: input.credentialName,
    action: "complete_oauth_in_n8n",
    status: "required",
    message: `Complete OAuth setup for ${input.credentialName} in n8n, then rerun the workflow update or activation check.`,
    manualSetupUrl: input.setupUrl ?? credentialSetupUrl(input.baseUrl),
    ...(input.docs ? { docs: input.docs } : {}),
  }
}

export function buildReuseExistingAction(input: {
  nodeName: string
  credentialType: string
  credentialName: string
}): CredentialSetupAction {
  return {
    nodeName: input.nodeName,
    credentialType: input.credentialType,
    credentialName: input.credentialName,
    action: "reuse_existing",
    status: "resolved",
    message: `Reusing existing n8n credential ${input.credentialName} for ${input.nodeName}.`,
  }
}

export function buildCreatedFromEnvAction(input: {
  nodeName: string
  credentialType: string
  credentialName: string
}): CredentialSetupAction {
  return {
    nodeName: input.nodeName,
    credentialType: input.credentialType,
    credentialName: input.credentialName,
    action: "create_from_env",
    status: "resolved",
    message: `Created n8n credential ${input.credentialName} from configured environment variables for ${input.nodeName}.`,
  }
}
