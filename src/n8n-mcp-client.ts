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
  authToken?: string
  fetch?: FetchLike
}

export type NodeTypeLookup =
  | string
  | {
      nodeId: string
      version?: number
      resource?: string
      operation?: string
      mode?: string
    }

export type McpWorkflowValidationWarning = {
  code: string
  message: string
  nodeName?: string
  parameterPath?: string
}

export type McpWorkflowValidationResult = {
  valid: boolean
  nodeCount?: number
  warnings: McpWorkflowValidationWarning[]
  errors: string[]
}

export class N8nMcpClient {
  private requestId = 0
  private readonly mcpUrl: string
  private readonly authToken: string | undefined
  private readonly fetchImpl: FetchLike

  constructor(options: N8nMcpClientOptions) {
    this.mcpUrl = options.mcpUrl
    this.authToken = options.authToken
    this.fetchImpl = options.fetch ?? fetch
  }

  async getSdkReference(section: string): Promise<string> {
    return this.callTextTool("get_sdk_reference", { section })
  }

  async searchNodes(query: string): Promise<string> {
    return this.callTextTool("search_nodes", { queries: [query] })
  }

  async getNodeTypes(nodeTypes: NodeTypeLookup[]): Promise<string> {
    return this.callTextTool("get_node_types", { nodeIds: nodeTypes })
  }

  async getSuggestedNodes(categories: string[]): Promise<string> {
    return this.callTextTool("get_suggested_nodes", { categories })
  }

  async validateWorkflowCode(code: string): Promise<McpWorkflowValidationResult> {
    const text = await this.callTextTool("validate_workflow", { code })

    return parseWorkflowValidationResult(text)
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
      headers: requestHeaders(this.authToken),
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

function requestHeaders(authToken: string | undefined): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
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
    if (typeof item.type !== "string") {
      throwProtocolError("invalid_content_type")
    }

    if (item.type === "text" && typeof item.text !== "string") {
      throwProtocolError("invalid_content_text")
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

function parseWorkflowValidationResult(text: string): McpWorkflowValidationResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractWorkflowValidationJson(text))
  } catch {
    throw new N8nBuilderError("n8n MCP validate_workflow returned invalid JSON.", "N8N_MCP_TOOL_ERROR", {
      toolName: "validate_workflow",
      reason: "invalid_json",
    })
  }

  if (!isRecord(parsed)) {
    throwWorkflowValidationParseError("result_not_object")
  }

  if (typeof parsed.valid !== "boolean") {
    throwWorkflowValidationParseError("invalid_valid")
  }

  const result: McpWorkflowValidationResult = {
    valid: parsed.valid,
    warnings: parseWorkflowValidationWarnings(parsed.warnings),
    errors: parseWorkflowValidationErrors(parsed.errors),
  }

  if (typeof parsed.nodeCount === "number" && Number.isFinite(parsed.nodeCount)) {
    result.nodeCount = parsed.nodeCount
  }

  return result
}

function extractWorkflowValidationJson(text: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const searchText = fencedMatch?.[1] ?? text
  const jsonText = findFirstJsonObject(searchText)

  if (!jsonText) {
    throw new Error("No JSON object found.")
  }

  return jsonText
}

function findFirstJsonObject(text: string): string | undefined {
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    const candidate = readBalancedJsonObject(text, start)
    if (!candidate) continue

    return candidate
  }

  return undefined
}

function readBalancedJsonObject(text: string, start: number): string | undefined {
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < text.length; index += 1) {
    const char = text[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
    } else if (char === "{") {
      depth += 1
    } else if (char === "}") {
      depth -= 1
      if (depth === 0) {
        return text.slice(start, index + 1)
      }
    }
  }

  return undefined
}

function parseWorkflowValidationWarnings(value: unknown): McpWorkflowValidationWarning[] {
  if (value === undefined) return []

  if (!Array.isArray(value)) {
    throwWorkflowValidationParseError("invalid_warnings")
  }

  return value.map((warning) => {
    if (!isRecord(warning) || typeof warning.code !== "string" || typeof warning.message !== "string") {
      throwWorkflowValidationParseError("invalid_warning")
    }

    const parsedWarning: McpWorkflowValidationWarning = {
      code: warning.code,
      message: warning.message,
    }

    if (typeof warning.nodeName === "string") {
      parsedWarning.nodeName = warning.nodeName
    }

    if (typeof warning.parameterPath === "string") {
      parsedWarning.parameterPath = warning.parameterPath
    }

    return parsedWarning
  })
}

function parseWorkflowValidationErrors(value: unknown): string[] {
  if (value === undefined) return []

  if (!Array.isArray(value) || !value.every((error): error is string => typeof error === "string")) {
    throwWorkflowValidationParseError("invalid_errors")
  }

  return value
}

function throwWorkflowValidationParseError(reason: string): never {
  throw new N8nBuilderError("n8n MCP validate_workflow returned an invalid validation result.", "N8N_MCP_TOOL_ERROR", {
    toolName: "validate_workflow",
    reason,
  })
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
