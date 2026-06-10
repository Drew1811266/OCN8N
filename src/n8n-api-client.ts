import { N8nBuilderError } from "./errors.js"
import { redactSecrets } from "./security.js"
import type { N8nWorkflow } from "./validator.js"

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type N8nCredentialSummary = {
  id: string
  name: string
  type: string
}

export type N8nExecutionSummary = {
  id: string
  workflowId?: string
  status?: string
  mode?: string
  startedAt?: string
  stoppedAt?: string
  finished?: boolean
}

export type ListExecutionsInput = {
  workflowId?: string
  limit?: number
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
const workflowListExpected = "N8nWorkflow[] or { data: N8nWorkflow[], nextCursor?: string | null }"
const executionListExpected = "N8nExecutionSummary[] or { data: N8nExecutionSummary[], nextCursor?: string | null }"

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

  async activateWorkflow(workflowId: string): Promise<N8nWorkflow & { id: string }> {
    return this.request<N8nWorkflow & { id: string }>(`/workflows/${encodeURIComponent(workflowId)}/activate`, {
      method: "POST",
    })
  }

  async deactivateWorkflow(workflowId: string): Promise<N8nWorkflow & { id: string }> {
    return this.request<N8nWorkflow & { id: string }>(`/workflows/${encodeURIComponent(workflowId)}/deactivate`, {
      method: "POST",
    })
  }

  async listWorkflows(): Promise<Array<N8nWorkflow & { id: string }>> {
    const workflows: Array<N8nWorkflow & { id: string }> = []
    let cursor: string | undefined

    do {
      const path = cursor ? `/workflows?${new URLSearchParams({ cursor }).toString()}` : "/workflows"
      let response: unknown

      try {
        response = await this.request<unknown>(path, { method: "GET" })
      } catch (error) {
        if (error instanceof N8nBuilderError && error.code === "N8N_API_PARSE_ERROR") {
          throwWorkflowListParseError(path)
        }

        throw error
      }

      if (Array.isArray(response)) {
        if (!response.every(isN8nWorkflowSummary)) {
          throwWorkflowListParseError(path)
        }

        return [...workflows, ...response]
      }

      if (!isWorkflowListPage(response)) {
        throwWorkflowListParseError(path)
      }

      workflows.push(...response.data)
      cursor = response.nextCursor ?? undefined
    } while (cursor)

    return workflows
  }

  async listExecutions(input: ListExecutionsInput = {}): Promise<N8nExecutionSummary[]> {
    const executions: N8nExecutionSummary[] = []
    let cursor: string | undefined

    do {
      const params = new URLSearchParams()
      if (input.workflowId) params.set("workflowId", input.workflowId)
      if (input.limit !== undefined) params.set("limit", String(input.limit))
      if (cursor) params.set("cursor", cursor)

      const query = params.toString()
      const path = query ? `/executions?${query}` : "/executions"
      let response: unknown

      try {
        response = await this.request<unknown>(path, { method: "GET" })
      } catch (error) {
        if (error instanceof N8nBuilderError && error.code === "N8N_API_PARSE_ERROR") {
          throwExecutionListParseError(path)
        }

        throw error
      }

      if (Array.isArray(response)) {
        if (!response.every(isN8nExecutionSummary)) {
          throwExecutionListParseError(path)
        }

        return [...executions, ...response]
      }

      if (!isExecutionListPage(response)) {
        throwExecutionListParseError(path)
      }

      executions.push(...response.data)
      cursor = response.nextCursor ?? undefined
    } while (cursor)

    return executions
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    await this.requestNoContent(`/workflows/${encodeURIComponent(workflowId)}`, {
      method: "DELETE",
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
        await apiErrorDetails(response, path),
      )
    }

    try {
      return (await response.json()) as T
    } catch {
      throw new N8nBuilderError("n8n API returned invalid JSON.", "N8N_API_PARSE_ERROR", { path })
    }
  }

  private async requestNoContent(path: string, init: RequestInit): Promise<void> {
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
        await apiErrorDetails(response, path),
      )
    }
  }
}

async function apiErrorDetails(response: Response, path: string): Promise<Record<string, unknown>> {
  const details: Record<string, unknown> = {
    status: response.status,
    path,
  }
  const responseDetails = await safeErrorResponse(response)

  if (responseDetails !== undefined) {
    details.response = responseDetails
  }

  return details
}

async function safeErrorResponse(response: Response): Promise<unknown> {
  let text: string
  try {
    text = await response.text()
  } catch {
    return undefined
  }

  if (!text.trim()) {
    return undefined
  }

  try {
    return redactSecrets(JSON.parse(text))
  } catch {
    return redactSecrets(text)
  }
}

function isN8nWorkflowSummary(value: unknown): value is N8nWorkflow & { id: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false

  const workflow = value as Record<string, unknown>
  return (
    typeof workflow.id === "string" &&
    typeof workflow.name === "string" &&
    typeof workflow.active === "boolean" &&
    Array.isArray(workflow.nodes) &&
    typeof workflow.connections === "object" &&
    workflow.connections !== null &&
    typeof workflow.settings === "object" &&
    workflow.settings !== null
  )
}

function isWorkflowListPage(
  value: unknown,
): value is { data: Array<N8nWorkflow & { id: string }>; nextCursor?: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false

  const page = value as Record<string, unknown>
  return (
    Array.isArray(page.data) &&
    page.data.every(isN8nWorkflowSummary) &&
    (page.nextCursor === undefined || page.nextCursor === null || typeof page.nextCursor === "string")
  )
}

function throwWorkflowListParseError(path: string): never {
  throw new N8nBuilderError("n8n API returned an invalid workflows response.", "N8N_API_PARSE_ERROR", {
    path,
    expected: workflowListExpected,
  })
}

function isN8nExecutionSummary(value: unknown): value is N8nExecutionSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false

  const execution = value as Record<string, unknown>
  return (
    typeof execution.id === "string" &&
    (execution.workflowId === undefined || typeof execution.workflowId === "string") &&
    (execution.status === undefined || typeof execution.status === "string") &&
    (execution.mode === undefined || typeof execution.mode === "string") &&
    (execution.startedAt === undefined || typeof execution.startedAt === "string") &&
    (execution.stoppedAt === undefined || typeof execution.stoppedAt === "string") &&
    (execution.finished === undefined || typeof execution.finished === "boolean")
  )
}

function isExecutionListPage(
  value: unknown,
): value is { data: N8nExecutionSummary[]; nextCursor?: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false

  const page = value as Record<string, unknown>
  return (
    Array.isArray(page.data) &&
    page.data.every(isN8nExecutionSummary) &&
    (page.nextCursor === undefined || page.nextCursor === null || typeof page.nextCursor === "string")
  )
}

function throwExecutionListParseError(path: string): never {
  throw new N8nBuilderError("n8n API returned an invalid executions response.", "N8N_API_PARSE_ERROR", {
    path,
    expected: executionListExpected,
  })
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
