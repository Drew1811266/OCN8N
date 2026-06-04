import { describe, expect, it, vi } from "vitest"
import { N8nApiClient } from "../src/n8n-api-client.js"
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

  it("supports paginated credential list responses", async () => {
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
})
