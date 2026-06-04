import { N8nBuilderError } from "./errors.js"
import type { N8nWorkflow } from "./validator.js"

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type N8nCredentialSummary = {
  id: string
  name: string
  type: string
}

type CreateCredentialInput = {
  name: string
  type: string
  data: Record<string, string>
}

type N8nApiClientOptions = {
  baseUrl: string
  apiKey: string
  fetch?: FetchLike
}

const credentialListExpected = "N8nCredentialSummary[] or { data: N8nCredentialSummary[], nextCursor?: string }"

export class N8nApiClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly fetchImpl: FetchLike

  constructor(options: N8nApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "")
    this.apiKey = options.apiKey
    this.fetchImpl = options.fetch ?? fetch
  }

  async createWorkflow(workflow: N8nWorkflow): Promise<N8nWorkflow & { id: string }> {
    return this.request<N8nWorkflow & { id: string }>("/workflows", {
      method: "POST",
      body: JSON.stringify(workflow),
    })
  }

  async updateWorkflow(workflowId: string, workflow: N8nWorkflow): Promise<N8nWorkflow & { id: string }> {
    return this.request<N8nWorkflow & { id: string }>(`/workflows/${encodeURIComponent(workflowId)}`, {
      method: "PUT",
      body: JSON.stringify(workflow),
    })
  }

  async getWorkflow(workflowId: string): Promise<N8nWorkflow & { id: string }> {
    return this.request<N8nWorkflow & { id: string }>(`/workflows/${encodeURIComponent(workflowId)}`, {
      method: "GET",
    })
  }

  async listCredentials(): Promise<N8nCredentialSummary[]> {
    const credentials: N8nCredentialSummary[] = []
    let cursor: string | undefined

    do {
      const path = cursor ? `/credentials?${new URLSearchParams({ cursor }).toString()}` : "/credentials"
      let response: unknown

      try {
        response = await this.request<unknown>(path, { method: "GET" })
      } catch (error) {
        if (error instanceof N8nBuilderError && error.code === "N8N_API_PARSE_ERROR") {
          throwCredentialListParseError(path)
        }

        throw error
      }

      if (Array.isArray(response)) {
        if (!response.every(isN8nCredentialSummary)) {
          throwCredentialListParseError(path)
        }

        return [...credentials, ...response]
      }

      if (!isCredentialListPage(response)) {
        throwCredentialListParseError(path)
      }

      credentials.push(...response.data)
      cursor = response.nextCursor
    } while (cursor)

    return credentials
  }

  async createCredential(input: CreateCredentialInput): Promise<N8nCredentialSummary> {
    return this.request<N8nCredentialSummary>("/credentials", {
      method: "POST",
      body: JSON.stringify(input),
    })
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "X-N8N-API-KEY": this.apiKey,
      },
    })

    if (!response.ok) {
      throw new N8nBuilderError(
        `n8n API request failed with status ${response.status} for ${path}.`,
        "N8N_API_ERROR",
        {
          status: response.status,
          path,
        },
      )
    }

    try {
      return (await response.json()) as T
    } catch {
      throw new N8nBuilderError("n8n API returned invalid JSON.", "N8N_API_PARSE_ERROR", { path })
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

function isCredentialListPage(value: unknown): value is { data: N8nCredentialSummary[]; nextCursor?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false

  const page = value as Record<string, unknown>
  return (
    Array.isArray(page.data) &&
    page.data.every(isN8nCredentialSummary) &&
    (page.nextCursor === undefined || typeof page.nextCursor === "string")
  )
}

function throwCredentialListParseError(path: string): never {
  throw new N8nBuilderError("n8n API returned an invalid credentials response.", "N8N_API_PARSE_ERROR", {
    path,
    expected: credentialListExpected,
  })
}
