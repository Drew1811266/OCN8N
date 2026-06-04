import { describe, expect, it, vi } from "vitest"
import { N8nBuilderError } from "../src/errors.js"
import { N8nMcpClient } from "../src/n8n-mcp-client.js"

describe("N8nMcpClient", () => {
  it("calls MCP tools through JSON-RPC and returns text content", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          result: {
            content: [
              { type: "text", text: "SDK docs" },
              { type: "text", text: "Workflow rules" },
            ],
          },
        }),
        { status: 200 },
      )
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    const reference = await client.getSdkReference("rules")

    expect(reference).toBe("SDK docs\nWorkflow rules")
    expect(fetch).toHaveBeenCalledWith(
      "https://demo/mcp",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          accept: "application/json",
          "content-type": "application/json",
        }),
      }),
    )

    const requestInit = fetch.mock.calls[0]?.[1] as RequestInit | undefined
    expect(JSON.parse(requestInit?.body as string)).toEqual({
      jsonrpc: "2.0",
      id: "1",
      method: "tools/call",
      params: {
        name: "get_sdk_reference",
        arguments: { section: "rules" },
      },
    })
  })

  it("throws a typed HTTP error when MCP rejects the request", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => new Response("Unauthorized", { status: 401 }))
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    await expect(client.searchNodes("slack")).rejects.toMatchObject({
      code: "N8N_MCP_HTTP_ERROR",
      details: { status: 401 },
    })
  })

  it("throws a typed tool error for JSON-RPC errors", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          error: { code: -32602, message: "Invalid tool arguments" },
        }),
        { status: 200 },
      )
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    await expect(client.getNodeTypes(["n8n-nodes-base.slack"])).rejects.toMatchObject({
      code: "N8N_MCP_TOOL_ERROR",
      message: "Invalid tool arguments",
      details: { method: "tools/call" },
    })
  })

  it("throws a typed empty error when MCP returns no text content", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: "1", result: { content: [] } }), { status: 200 })
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    let error: unknown
    try {
      await client.getSdkReference("rules")
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(N8nBuilderError)
    expect((error as N8nBuilderError).code).toBe("N8N_MCP_EMPTY")
    expect((error as N8nBuilderError).details).toEqual({ name: "get_sdk_reference" })
  })
})
