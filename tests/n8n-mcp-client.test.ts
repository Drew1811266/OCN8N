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

  it("calls search_nodes with queries array", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          result: { content: [{ type: "text", text: "Slack node" }] },
        }),
        { status: 200 },
      )
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    await expect(client.searchNodes("slack")).resolves.toBe("Slack node")

    const requestInit = fetch.mock.calls[0]?.[1] as RequestInit | undefined
    expect(JSON.parse(requestInit?.body as string)).toEqual({
      jsonrpc: "2.0",
      id: "1",
      method: "tools/call",
      params: {
        name: "search_nodes",
        arguments: { queries: ["slack"] },
      },
    })
  })

  it("calls get_node_types with nodeIds array", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          result: { content: [{ type: "text", text: "Slack docs" }] },
        }),
        { status: 200 },
      )
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    await expect(client.getNodeTypes(["n8n-nodes-base.slack"])).resolves.toBe("Slack docs")

    const requestInit = fetch.mock.calls[0]?.[1] as RequestInit | undefined
    expect(JSON.parse(requestInit?.body as string)).toEqual({
      jsonrpc: "2.0",
      id: "1",
      method: "tools/call",
      params: {
        name: "get_node_types",
        arguments: { nodeIds: ["n8n-nodes-base.slack"] },
      },
    })
  })

  it("passes get_node_types discriminator objects through as nodeIds", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          result: { content: [{ type: "text", text: "Google Sheets docs" }] },
        }),
        { status: 200 },
      )
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    await expect(
      client.getNodeTypes([
        {
          nodeId: "n8n-nodes-base.googleSheets",
          resource: "sheet",
          operation: "append",
        },
      ]),
    ).resolves.toBe("Google Sheets docs")

    const requestInit = fetch.mock.calls[0]?.[1] as RequestInit | undefined
    expect(JSON.parse(requestInit?.body as string)).toEqual({
      jsonrpc: "2.0",
      id: "1",
      method: "tools/call",
      params: {
        name: "get_node_types",
        arguments: {
          nodeIds: [
            {
              nodeId: "n8n-nodes-base.googleSheets",
              resource: "sheet",
              operation: "append",
            },
          ],
        },
      },
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
      message: "n8n MCP tool get_node_types failed.",
      details: { toolName: "get_node_types", errorCode: -32602 },
    })
  })

  it("does not expose secret-looking values from JSON-RPC error messages", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          error: { code: -32000, message: "remote failed token=secret-value" },
        }),
        { status: 200 },
      )
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    let error: unknown
    try {
      await client.searchNodes("slack")
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(N8nBuilderError)
    expect((error as N8nBuilderError).code).toBe("N8N_MCP_TOOL_ERROR")
    expect((error as N8nBuilderError).message).toBe("n8n MCP tool search_nodes failed.")
    expect((error as N8nBuilderError).details).toEqual({ toolName: "search_nodes", errorCode: -32000 })
    expect(JSON.stringify(error)).not.toContain("secret-value")
  })

  it("throws a sanitized typed error for MCP tool-level failures", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          result: {
            isError: true,
            content: [{ type: "text", text: "token=secret-value" }],
          },
        }),
        { status: 200 },
      )
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    let error: unknown
    try {
      await client.getSdkReference("rules")
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(N8nBuilderError)
    expect((error as N8nBuilderError).code).toBe("N8N_MCP_TOOL_ERROR")
    expect((error as N8nBuilderError).message).toBe("n8n MCP tool get_sdk_reference failed.")
    expect((error as N8nBuilderError).details).toEqual({ toolName: "get_sdk_reference" })
    expect(JSON.stringify(error)).not.toContain("secret-value")
  })

  it("throws a typed protocol error for null JSON-RPC responses", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response("null", { status: 200 })
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    let error: unknown
    try {
      await client.getSdkReference("rules")
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(N8nBuilderError)
    expect((error as N8nBuilderError).code).toBe("N8N_MCP_PROTOCOL_ERROR")
    expect(error).not.toBeInstanceOf(TypeError)
  })

  it("throws a typed protocol error for invalid JSON-RPC versions", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          jsonrpc: "1.0",
          id: "1",
          result: { content: [{ type: "text", text: "SDK docs" }] },
        }),
        { status: 200 },
      )
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    await expect(client.getSdkReference("rules")).rejects.toMatchObject({
      code: "N8N_MCP_PROTOCOL_ERROR",
    })
  })

  it("throws a typed protocol error for invalid response ids without leaking id content", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: { token: "secret-value" },
          result: { content: [{ type: "text", text: "SDK docs" }] },
        }),
        { status: 200 },
      )
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    let error: unknown
    try {
      await client.getSdkReference("rules")
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(N8nBuilderError)
    expect((error as N8nBuilderError).code).toBe("N8N_MCP_PROTOCOL_ERROR")
    expect(JSON.stringify(error)).not.toContain("secret-value")
  })

  it("rejects JSON-RPC string error codes without leaking code content", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          error: { code: "token=secret-value", message: "remote failure" },
        }),
        { status: 200 },
      )
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    let error: unknown
    try {
      await client.searchNodes("slack")
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(N8nBuilderError)
    expect((error as N8nBuilderError).code).toBe("N8N_MCP_PROTOCOL_ERROR")
    expect(JSON.stringify(error)).not.toContain("secret-value")
  })

  it("throws a typed protocol error when both result and error are present", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          result: { content: [{ type: "text", text: "SDK docs" }] },
          error: { code: -32000, message: "Tool failed" },
        }),
        { status: 200 },
      )
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    await expect(client.getSdkReference("rules")).rejects.toMatchObject({
      code: "N8N_MCP_PROTOCOL_ERROR",
    })
  })

  it("throws a typed protocol error when JSON-RPC error code is missing", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          error: { message: "Tool failed" },
        }),
        { status: 200 },
      )
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    await expect(client.getSdkReference("rules")).rejects.toMatchObject({
      code: "N8N_MCP_PROTOCOL_ERROR",
    })
  })

  it("throws a typed protocol error when JSON-RPC error code is not an integer", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          error: { code: -32000.5, message: "Tool failed" },
        }),
        { status: 200 },
      )
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    await expect(client.getSdkReference("rules")).rejects.toMatchObject({
      code: "N8N_MCP_PROTOCOL_ERROR",
    })
  })

  it("throws a typed protocol error when JSON-RPC error message is missing or not a string", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: "1", error: { code: -32000 } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: "2", error: { code: -32000, message: 123 } }), {
          status: 200,
        }),
      )
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    await expect(client.getSdkReference("rules")).rejects.toMatchObject({
      code: "N8N_MCP_PROTOCOL_ERROR",
    })
    await expect(client.getSdkReference("rules")).rejects.toMatchObject({
      code: "N8N_MCP_PROTOCOL_ERROR",
    })
  })

  it("throws a typed protocol error when JSON-RPC response id mismatches the request id", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "unexpected",
          result: { content: [{ type: "text", text: "SDK docs" }] },
        }),
        { status: 200 },
      )
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    let error: unknown
    try {
      await client.getSdkReference("rules")
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(N8nBuilderError)
    expect((error as N8nBuilderError).code).toBe("N8N_MCP_PROTOCOL_ERROR")
    expect((error as N8nBuilderError).details).toEqual({ expectedId: "1", responseId: "unexpected" })
  })

  it("throws a typed protocol error when MCP content is not an array", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: "1", result: { content: "SDK docs" } }),
        { status: 200 },
      )
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    await expect(client.getSdkReference("rules")).rejects.toMatchObject({
      code: "N8N_MCP_PROTOCOL_ERROR",
    })
  })

  it("throws a typed protocol error when MCP content contains null", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: "1", result: { content: [null] } }), { status: 200 })
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    await expect(client.getSdkReference("rules")).rejects.toMatchObject({
      code: "N8N_MCP_PROTOCOL_ERROR",
    })
  })

  it("throws a typed protocol error when MCP content item has no string type", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: "1", result: { content: [{}] } }), { status: 200 })
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    await expect(client.getSdkReference("rules")).rejects.toMatchObject({
      code: "N8N_MCP_PROTOCOL_ERROR",
    })
  })

  it("throws a typed protocol error when MCP text content has non-string text", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: "1", result: { content: [{ type: "text", text: 123 }] } }),
        { status: 200 },
      )
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    await expect(client.getSdkReference("rules")).rejects.toMatchObject({
      code: "N8N_MCP_PROTOCOL_ERROR",
    })
  })

  it("throws a typed empty error when MCP content has no text items", async () => {
    const fetch = vi.fn(async (_input: string, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          result: { content: [{ type: "image", data: "abc123" }] },
        }),
        { status: 200 },
      )
    })
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    await expect(client.getSdkReference("rules")).rejects.toMatchObject({
      code: "N8N_MCP_EMPTY",
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
