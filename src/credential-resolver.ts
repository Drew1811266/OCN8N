import type { N8nCredentialSummary } from "./n8n-api-client.js"
import type { CredentialEnvMapping, CredentialGap, Env } from "./types.js"

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
}

type CredentialResolverOptions = {
  api: CredentialApi
  env: Env
  credentialEnv: Record<string, CredentialEnvMapping>
}

export class CredentialResolver {
  constructor(private readonly options: CredentialResolverOptions) {}

  async resolve(input: ResolveCredentialInput): Promise<ResolveCredentialResult> {
    const mapping = this.options.credentialEnv[input.credentialType]
    const credentials = await this.options.api.listCredentials()

    if (mapping) {
      const existing = credentials.find((credential) => {
        return credential.type === mapping.type && credential.name === mapping.name
      })

      if (existing) {
        return { reference: { id: existing.id, name: existing.name } }
      }
    }

    if (!mapping) {
      return {
        gap: {
          nodeName: input.nodeName,
          credentialType: input.credentialType,
          reason: "No credential mapping configured for this credential type.",
        },
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
      }
    }

    const created = await this.options.api.createCredential({
      name: mapping.name,
      type: mapping.type,
      data: envData.data,
    })

    return { reference: { id: created.id, name: created.name } }
  }
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
