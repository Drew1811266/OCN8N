import { describe, expect, it, vi } from "vitest"
import { N8nApiClient } from "../src/n8n-api-client.js"
import { N8nBuilderError } from "../src/errors.js"
import type { N8nWorkflow } from "../src/validator.js"

function workflow(overrides: Partial<N8nWorkflow> = {}): N8nWorkflow {
  return {
    name: "Orders",
    active: false,
    nodes: [],
    connections: {},
    settings: {},
    ...overrides,
  }
}

describe("N8nApiClient", () => {
  it("creates workflows with JSON headers and X-N8N-API-KEY", async () => {
    const fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "wf_1", name: "Orders", active: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })
    const client = new N8nApiClient({
      baseUrl: "https://demo.app.n8n.cloud/api/v1",
      apiKey: "n8n_api_key",
      fetch,
    })

    const result = await client.createWorkflow(workflow())

    expect(result.id).toBe("wf_1")
    expect(fetch).toHaveBeenCalledWith(
      "https://demo.app.n8n.cloud/api/v1/workflows",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          accept: "application/json",
          "content-type": "application/json",
          "X-N8N-API-KEY": "n8n_api_key",
        }),
        body: JSON.stringify(workflow()),
      }),
    )
  })

  it("supports direct array credential list responses", async () => {
    const fetch = vi.fn(async () => {
      return new Response(JSON.stringify([{ id: "cred_1", name: "OpenCode Slack", type: "slackApi" }]), {
        status: 200,
      })
    })
    const client = new N8nApiClient({
      baseUrl: "https://demo.app.n8n.cloud/api/v1/",
      apiKey: "n8n_api_key",
      fetch,
    })

    await expect(client.listCredentials()).resolves.toEqual([
      { id: "cred_1", name: "OpenCode Slack", type: "slackApi" },
    ])
    expect(fetch).toHaveBeenCalledWith(
      "https://demo.app.n8n.cloud/api/v1/credentials",
      expect.objectContaining({ method: "GET" }),
    )
  })

  it("follows paginated credential list responses with cursor query params", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: "cred_1", name: "OpenCode Slack", type: "slackApi" }],
            nextCursor: "cursor_2",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: "cred_2", name: "OpenCode GitHub", type: "githubApi" }],
          }),
          { status: 200 },
        ),
      )
    const client = new N8nApiClient({
      baseUrl: "https://demo.app.n8n.cloud/api/v1",
      apiKey: "n8n_api_key",
      fetch,
    })

    await expect(client.listCredentials()).resolves.toEqual([
      { id: "cred_1", name: "OpenCode Slack", type: "slackApi" },
      { id: "cred_2", name: "OpenCode GitHub", type: "githubApi" },
    ])
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://demo.app.n8n.cloud/api/v1/credentials",
      expect.objectContaining({ method: "GET" }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://demo.app.n8n.cloud/api/v1/credentials?cursor=cursor_2",
      expect.objectContaining({ method: "GET" }),
    )
  })

  it("supports single object credential list responses", async () => {
    const fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ data: [{ id: "cred_1", name: "OpenCode Slack", type: "slackApi" }] }), {
        status: 200,
      })
    })
    const client = new N8nApiClient({
      baseUrl: "https://demo.app.n8n.cloud/api/v1/",
      apiKey: "n8n_api_key",
      fetch,
    })

    await expect(client.listCredentials()).resolves.toEqual([
      { id: "cred_1", name: "OpenCode Slack", type: "slackApi" },
    ])
    expect(fetch).toHaveBeenCalledWith(
      "https://demo.app.n8n.cloud/api/v1/credentials",
      expect.objectContaining({ method: "GET" }),
    )
  })

  it("throws a redacted parse error when successful credential list body is malformed", async () => {
    const fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ data: [{ id: "cred_1", name: "OpenCode Slack", token: "secret" }] }), {
        status: 200,
      })
    })
    const client = new N8nApiClient({
      baseUrl: "https://demo.app.n8n.cloud/api/v1",
      apiKey: "n8n_api_key",
      fetch,
    })

    let error: unknown
    try {
      await client.listCredentials()
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(N8nBuilderError)
    expect((error as N8nBuilderError).code).toBe("N8N_API_PARSE_ERROR")
    expect((error as N8nBuilderError).details).toEqual({
      path: "/credentials",
      expected: "N8nCredentialSummary[] or { data: N8nCredentialSummary[], nextCursor?: string }",
    })
    expect(JSON.stringify(error)).not.toContain("n8n_api_key")
    expect(JSON.stringify(error)).not.toContain("secret")
  })

  it("throws a typed error with status and path when n8n rejects a request", async () => {
    const fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 })
    })
    const client = new N8nApiClient({
      baseUrl: "https://demo.app.n8n.cloud/api/v1",
      apiKey: "bad_key",
      fetch,
    })

    await expect(client.getWorkflow("wf_1")).rejects.toMatchObject({
      code: "N8N_API_ERROR",
      details: {
        status: 401,
        path: "/workflows/wf_1",
      },
    })
  })

  it("lists workflows from paginated n8n API responses", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: "wf_1", name: "One", active: false, nodes: [], connections: {}, settings: {} }],
            nextCursor: "cursor_2",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: "wf_2", name: "Two", active: false, nodes: [], connections: {}, settings: {} }],
          }),
          { status: 200 },
        ),
      )
    const client = new N8nApiClient({
      baseUrl: "https://demo/api/v1",
      apiKey: "api_key",
      fetch,
    })

    await expect(client.listWorkflows()).resolves.toEqual([
      expect.objectContaining({ id: "wf_1", name: "One" }),
      expect.objectContaining({ id: "wf_2", name: "Two" }),
    ])
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://demo/api/v1/workflows",
      expect.objectContaining({ method: "GET" }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://demo/api/v1/workflows?cursor=cursor_2",
      expect.objectContaining({ method: "GET" }),
    )
  })

  it("deletes workflows by id", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }))
    const client = new N8nApiClient({
      baseUrl: "https://demo/api/v1",
      apiKey: "api_key",
      fetch,
    })

    await expect(client.deleteWorkflow("wf_1")).resolves.toBeUndefined()

    expect(fetch).toHaveBeenCalledWith(
      "https://demo/api/v1/workflows/wf_1",
      expect.objectContaining({ method: "DELETE" }),
    )
  })
})
