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
    const response = await this.request<N8nCredentialSummary[] | { data?: N8nCredentialSummary[] }>("/credentials", {
      method: "GET",
    })

    if (Array.isArray(response)) return response
    return response.data ?? []
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

    return (await response.json()) as T
  }
}
