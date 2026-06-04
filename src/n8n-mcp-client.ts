import { N8nBuilderError } from "./errors.js"

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

type McpContent = {
  type?: string
  text?: unknown
}

type McpResponse = {
  jsonrpc: "2.0"
  id?: string | number | null
  result?: {
    content?: McpContent[]
    isError?: boolean
    [key: string]: unknown
  }
  error?: {
    code: number
    message: string
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

    const content = validateMcpContent(response.result?.content)
    const text = content
      .filter((item): item is McpContent & { type: "text"; text: string } => {
        return item.type === "text" && typeof item.text === "string"
      })
      .map((item) => item.text)
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

    let data: unknown
    try {
      data = await response.json()
    } catch {
      throw new N8nBuilderError("n8n MCP returned invalid JSON.", "N8N_MCP_TOOL_ERROR", {
        toolName,
      })
    }

    const mcpResponse = parseMcpResponse(data)

    if (mcpResponse.id !== expectedId) {
      throw new N8nBuilderError("n8n MCP returned a mismatched JSON-RPC response id.", "N8N_MCP_PROTOCOL_ERROR", {
        expectedId,
        responseId: sanitizeProtocolId(mcpResponse.id),
      })
    }

    if (mcpResponse.error) {
      const details: Record<string, unknown> = { toolName }
      if (typeof mcpResponse.error.code === "number") {
        details.errorCode = mcpResponse.error.code
      }

      throw new N8nBuilderError(`n8n MCP tool ${toolName} failed.`, "N8N_MCP_TOOL_ERROR", details)
    }

    return mcpResponse
  }
}

function validateMcpContent(content: unknown): McpContent[] {
  if (!Array.isArray(content)) {
    throwProtocolError("invalid_content")
  }

  if (!content.every(isRecord)) {
    throwProtocolError("invalid_content_item")
  }

  for (const item of content) {
    if (Object.hasOwn(item, "type") && typeof item.type !== "string") {
      throwProtocolError("invalid_content_type")
    }
  }

  return content
}

function parseMcpResponse(value: unknown): McpResponse {
  if (!isRecord(value)) {
    throwProtocolError("response_not_object")
  }

  if (value.jsonrpc !== "2.0") {
    throwProtocolError("invalid_jsonrpc")
  }

  if (!Object.hasOwn(value, "id") || !isJsonRpcId(value.id)) {
    throwProtocolError("invalid_id")
  }

  const id = value.id

  const hasResult = Object.hasOwn(value, "result")
  const hasError = Object.hasOwn(value, "error")

  if (hasResult === hasError) {
    throwProtocolError(hasResult ? "result_and_error_present" : "missing_result_or_error")
  }

  if (hasError) {
    if (!isRecord(value.error)) {
      throwProtocolError("invalid_error")
    }

    if (typeof value.error.code !== "number" || !Number.isInteger(value.error.code)) {
      throwProtocolError("invalid_error_code")
    }

    if (typeof value.error.message !== "string") {
      throwProtocolError("invalid_error_message")
    }

    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: value.error.code,
        message: value.error.message,
      },
    }
  }

  if (!isRecord(value.result)) {
    throwProtocolError("invalid_result")
  }

  return {
    jsonrpc: "2.0",
    id,
    result: value.result,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isJsonRpcId(value: unknown): value is string | number | null {
  return typeof value === "string" || typeof value === "number" || value === null
}

function throwProtocolError(reason: string): never {
  throw new N8nBuilderError("n8n MCP returned a malformed JSON-RPC response.", "N8N_MCP_PROTOCOL_ERROR", {
    reason,
  })
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
