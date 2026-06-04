import { N8nBuilderError } from "./errors.js"

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

type McpContent = {
  type?: string
  text?: unknown
}

type McpResponse = {
  result?: {
    content?: McpContent[]
    [key: string]: unknown
  }
  error?: {
    code?: number
    message?: unknown
  }
}

export type N8nMcpClientOptions = {
  mcpUrl: string
  fetch?: FetchLike
}

export class N8nMcpClient {
  private requestId = 0
  private readonly mcpUrl: string
  private readonly fetchImpl: FetchLike

  constructor(options: N8nMcpClientOptions) {
    this.mcpUrl = options.mcpUrl
    this.fetchImpl = options.fetch ?? fetch
  }

  async getSdkReference(section: string): Promise<string> {
    return this.callTextTool("get_sdk_reference", { section })
  }

  async searchNodes(query: string): Promise<string> {
    return this.callTextTool("search_nodes", { query })
  }

  async getNodeTypes(nodeTypes: string[]): Promise<string> {
    return this.callTextTool("get_node_types", { nodeTypes })
  }

  private async callTextTool(name: string, argumentsValue: Record<string, unknown>): Promise<string> {
    const response = await this.call({
      method: "tools/call",
      params: {
        name,
        arguments: argumentsValue,
      },
    })

    const text = response.result?.content
      ?.map((item) => item.text)
      .filter((value): value is string => typeof value === "string")
      .join("\n")

    if (!text) {
      throw new N8nBuilderError(`n8n MCP tool ${name} returned no text content.`, "N8N_MCP_EMPTY", { name })
    }

    return text
  }

  private async call(payload: { method: "tools/call"; params: Record<string, unknown> }): Promise<McpResponse> {
    const response = await this.fetchImpl(this.mcpUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: String(++this.requestId),
        ...payload,
      }),
    })

    if (!response.ok) {
      throw new N8nBuilderError(
        `n8n MCP request failed with status ${response.status}.`,
        "N8N_MCP_HTTP_ERROR",
        {
          status: response.status,
        },
      )
    }

    let data: McpResponse
    try {
      data = (await response.json()) as McpResponse
    } catch {
      throw new N8nBuilderError("n8n MCP returned invalid JSON.", "N8N_MCP_TOOL_ERROR", {
        method: payload.method,
      })
    }

    if (data.error) {
      const message = typeof data.error.message === "string" ? data.error.message : "n8n MCP tool call failed."
      throw new N8nBuilderError(message, "N8N_MCP_TOOL_ERROR", { method: payload.method })
    }

    return data
  }
}
