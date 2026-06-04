import { N8nBuilderError } from "./errors.js"

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

type McpContent = {
  type?: string
  text?: unknown
}

type McpResponse = {
  id?: string | number | null
  result?: {
    content?: McpContent[]
    isError?: boolean
    [key: string]: unknown
  }
  error?: {
    code?: unknown
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
    return this.callTextTool("search_nodes", { queries: [query] })
  }

  async getNodeTypes(nodeTypes: string[]): Promise<string> {
    return this.callTextTool("get_node_types", { nodeIds: nodeTypes })
  }

  private async callTextTool(name: string, argumentsValue: Record<string, unknown>): Promise<string> {
    const response = await this.call(name, argumentsValue)

    if (response.result?.isError === true) {
      throw new N8nBuilderError(`n8n MCP tool ${name} failed.`, "N8N_MCP_TOOL_ERROR", { toolName: name })
    }

    const text = response.result?.content
      ?.map((item) => item.text)
      .filter((value): value is string => typeof value === "string")
      .join("\n")

    if (!text) {
      throw new N8nBuilderError(`n8n MCP tool ${name} returned no text content.`, "N8N_MCP_EMPTY", { name })
    }

    return text
  }

  private async call(toolName: string, argumentsValue: Record<string, unknown>): Promise<McpResponse> {
    const expectedId = String(++this.requestId)
    const response = await this.fetchImpl(this.mcpUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: expectedId,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: argumentsValue,
        },
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
        toolName,
      })
    }

    if (data.id !== expectedId) {
      throw new N8nBuilderError("n8n MCP returned a mismatched JSON-RPC response id.", "N8N_MCP_PROTOCOL_ERROR", {
        expectedId,
        responseId: sanitizeProtocolId(data.id),
      })
    }

    if (data.error) {
      const details: Record<string, unknown> = { toolName }
      if (typeof data.error.code === "number" || typeof data.error.code === "string") {
        details.errorCode = data.error.code
      }

      throw new N8nBuilderError(`n8n MCP tool ${toolName} failed.`, "N8N_MCP_TOOL_ERROR", details)
    }

    return data
  }
}

function sanitizeProtocolId(id: string | number | null | undefined): string | number | null | undefined {
  if (typeof id !== "string") return id

  return redactSecretFragments(id)
}

function redactSecretFragments(value: string): string {
  return value.replace(
    /\b(token|password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)=([^\s,;]+)/gi,
    "$1=[REDACTED]",
  )
}
