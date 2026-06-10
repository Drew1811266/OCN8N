import { N8nBuilderError } from "./errors.js"
import type { N8nCredentialSummary } from "./n8n-api-client.js"
import {
  buildConfigureMappingAction,
  buildCreatedFromEnvAction,
  buildMissingEnvAction,
  buildOAuthSetupAction,
  buildReuseExistingAction,
} from "./credential-actions.js"
import type { CredentialEnvMapping, CredentialGap, CredentialSetupAction, Env } from "./types.js"

type CredentialApi = {
  listCredentials(): Promise<N8nCredentialSummary[]>
  createCredential(input: {
    name: string
    type: string
    data: Record<string, string>
  }): Promise<N8nCredentialSummary>
}

export type ResolveCredentialInput = {
  nodeName: string
  credentialType: string
}

export type ResolveCredentialResult = {
  reference?: {
    id: string
    name: string
  }
  gap?: CredentialGap
  action?: CredentialSetupAction
}

type CredentialResolverOptions = {
  api: CredentialApi
  env: Env
  credentialEnv: Record<string, CredentialEnvMapping>
  baseUrl: string
}

export class CredentialResolver {
  constructor(private readonly options: CredentialResolverOptions) {}

  async resolve(input: ResolveCredentialInput): Promise<ResolveCredentialResult> {
    const mapping = this.options.credentialEnv[input.credentialType]
    if (!mapping) {
      return {
        gap: {
          nodeName: input.nodeName,
          credentialType: input.credentialType,
          reason: "No credential mapping configured for this credential type.",
        },
        action: buildConfigureMappingAction({
          baseUrl: this.options.baseUrl,
          nodeName: input.nodeName,
          credentialType: input.credentialType,
        }),
      }
    }

    const credentials = await this.options.api.listCredentials()
    const existing = credentials.find((credential) => {
      return credential.type === mapping.type && credential.name === mapping.name
    })

    if (existing) {
      return {
        reference: { id: existing.id, name: existing.name },
        action: buildReuseExistingAction({
          nodeName: input.nodeName,
          credentialType: input.credentialType,
          credentialName: existing.name,
        }),
      }
    }

    if (mapping.authMode === "oauth2") {
      return {
        gap: {
          nodeName: input.nodeName,
          credentialType: input.credentialType,
          credentialName: mapping.name,
          reason: "OAuth credentials must be completed manually in n8n UI.",
        },
        action: buildOAuthSetupAction({
          baseUrl: this.options.baseUrl,
          nodeName: input.nodeName,
          credentialType: input.credentialType,
          credentialName: mapping.name,
          setupUrl: mapping.setupUrl,
          docs: mapping.docs,
        }),
      }
    }

    const envData = resolveEnvData(mapping, this.options.env)
    if (envData.missing.length > 0) {
      return {
        gap: {
          nodeName: input.nodeName,
          credentialType: input.credentialType,
          credentialName: mapping.name,
          reason: `Missing environment variables: ${envData.missing.join(", ")}`,
        },
        action: buildMissingEnvAction({
          baseUrl: this.options.baseUrl,
          nodeName: input.nodeName,
          credentialType: input.credentialType,
          credentialName: mapping.name,
          requiredEnv: envData.missing,
          setupUrl: mapping.setupUrl,
          docs: mapping.docs,
        }),
      }
    }

    const created = await this.options.api.createCredential({
      name: mapping.name,
      type: mapping.type,
      data: envData.data,
    })

    if (!isN8nCredentialSummary(created)) {
      throw new N8nBuilderError("n8n API returned an invalid credential creation response.", "CREDENTIAL_CREATE_INVALID", {
        credentialType: input.credentialType,
        credentialName: mapping.name,
      })
    }

    return {
      reference: { id: created.id, name: created.name },
      action: buildCreatedFromEnvAction({
        nodeName: input.nodeName,
        credentialType: input.credentialType,
        credentialName: created.name,
      }),
    }
  }
}

function isN8nCredentialSummary(value: unknown): value is N8nCredentialSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false

  const credential = value as Record<string, unknown>
  return (
    typeof credential.id === "string" &&
    typeof credential.name === "string" &&
    typeof credential.type === "string"
  )
}

function resolveEnvData(
  mapping: CredentialEnvMapping,
  env: Env,
): {
  data: Record<string, string>
  missing: string[]
} {
  const data: Record<string, string> = {}
  const missing: string[] = []

  for (const [field, envName] of Object.entries(mapping.env)) {
    const value = env[envName]
    if (value) {
      data[field] = value
    } else {
      missing.push(envName)
    }
  }

  return { data, missing }
}
