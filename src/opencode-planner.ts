import { N8nBuilderError } from "./errors.js"
import {
  workflowDraftSchema,
  workflowPatchDraftSchema,
  type WorkflowDraft,
  type WorkflowPatchDraft,
  type WorkflowPatchPlan,
  type WorkflowPlan,
} from "./workflow-plan.js"

type JsonSchema = Record<string, unknown>

type OpencodeSessionCreateResult = {
  id?: string
  data?: {
    id?: string
  }
}

type OpencodePromptResult = {
  data?: {
    info?: {
      error?: {
        name?: string
        message?: string
      }
    }
    parts?: unknown
  }
  parts?: unknown
}

type OpencodeClientLike = {
  session: {
    create(input: { body: { title: string } }): Promise<OpencodeSessionCreateResult>
    prompt(input: {
      path: { id: string }
      body: {
        parts: Array<{ type: "text"; text: string }>
      }
    }): Promise<OpencodePromptResult>
  }
}

export type PlannerNodeDocumentation = {
  nodeType: string
  documentation: string
}

export type PlannerContext = {
  prompt: string
  sdkReference: string
  nodeDocumentation: PlannerNodeDocumentation[]
  suggestedNodes?: string
}

export type PatchPlannerContext = PlannerContext & {
  currentWorkflowJson: string
}

export class OpencodePlanner {
  private readonly client: OpencodeClientLike

  constructor(options: { client: OpencodeClientLike }) {
    this.client = options.client
  }

  async createPlan(context: PlannerContext): Promise<WorkflowPlan> {
    const draft = await this.createDraft(context)
    return draft.plan
  }

  async createDraft(context: PlannerContext): Promise<WorkflowDraft> {
    const output = await this.promptStructured({
      title: "n8n workflow draft planning",
      text: this.buildCreatePrompt(context),
      schema: workflowDraftJsonSchema,
    })

    return this.parseDraft(output)
  }

  async createPatchPlan(context: PatchPlannerContext): Promise<WorkflowPatchPlan> {
    const draft = await this.createPatchDraft(context)
    return {
      summary: draft.summary,
      changes: draft.changes,
      replacementPlan: draft.replacementPlan,
    }
  }

  async createPatchDraft(context: PatchPlannerContext): Promise<WorkflowPatchDraft> {
    const output = await this.promptStructured({
      title: "n8n workflow update draft planning",
      text: this.buildPatchPrompt(context),
      schema: workflowPatchDraftJsonSchema,
    })

    return this.parsePatchDraft(output)
  }

  private async promptStructured(input: { title: string; text: string; schema: JsonSchema }): Promise<unknown> {
    try {
      const session = await this.client.session.create({ body: { title: input.title } })
      const sessionId = session.id ?? session.data?.id

      if (!sessionId) {
        throw new N8nBuilderError("OpenCode did not return a session id.", "OPENCODE_PLANNER_ERROR")
      }

      const result = await this.client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: buildJsonPrompt(input.text, input.schema) }],
        },
      })

      const info = result.data?.info
      if (info?.error) {
        throw new N8nBuilderError(
          info.error.message ?? "OpenCode structured planning failed.",
          "OPENCODE_PLANNER_ERROR",
          {
            name: info.error.name,
          },
        )
      }

      return parseJsonFromAssistantText(extractAssistantText(result))
    } catch (error) {
      if (error instanceof N8nBuilderError) {
        throw error
      }

      throw new N8nBuilderError("OpenCode structured planning failed.", "OPENCODE_PLANNER_ERROR", {
        cause: serializeError(error),
      })
    }
  }

  private parseDraft(output: unknown): WorkflowDraft {
    try {
      return workflowDraftSchema.parse(output)
    } catch (error) {
      throw new N8nBuilderError(
        "OpenCode structured planning returned an invalid WorkflowDraft.",
        "OPENCODE_PLANNER_ERROR",
        {
          cause: serializeError(error),
        },
      )
    }
  }

  private parsePatchDraft(output: unknown): WorkflowPatchDraft {
    try {
      return workflowPatchDraftSchema.parse(output)
    } catch (error) {
      throw new N8nBuilderError(
        "OpenCode structured planning returned an invalid WorkflowPatchDraft.",
        "OPENCODE_PLANNER_ERROR",
        {
          cause: serializeError(error),
        },
      )
    }
  }

  private buildCreatePrompt(context: PlannerContext): string {
    return [
      "Create an n8n WorkflowPlan from the user request.",
      "Use only node types supported by the provided n8n MCP documentation.",
      "Do not include secret values, API keys, tokens, passwords, OAuth secrets, or bearer strings.",
      "Use credential reference names only when a node needs credentials.",
      "Explain why each selected node type is needed in nodeSelection.",
      "",
      `User request:\n${context.prompt}`,
      "",
      suggestedNodeGuidance(context),
      "",
      `SDK reference:\n${context.sdkReference}`,
      "",
      `Node documentation:\n${JSON.stringify(context.nodeDocumentation, null, 2)}`,
    ].join("\n")
  }

  private buildPatchPrompt(context: PatchPlannerContext): string {
    const redactedCurrentWorkflowJson = redactWorkflowJson(context.currentWorkflowJson)

    return [
      "Create a full replacement WorkflowPatchPlan for a managed n8n workflow.",
      "Preserve existing behavior unless the user request changes it.",
      "Do not include secret values, API keys, tokens, passwords, OAuth secrets, or bearer strings.",
      "Use credential reference names only when a node needs credentials.",
      "Explain why each selected node type is needed in nodeSelection.",
      "",
      `User request:\n${context.prompt}`,
      "",
      `Current workflow JSON:\n${redactedCurrentWorkflowJson}`,
      "",
      suggestedNodeGuidance(context),
      "",
      `SDK reference:\n${context.sdkReference}`,
      "",
      `Node documentation:\n${JSON.stringify(context.nodeDocumentation, null, 2)}`,
    ].join("\n")
  }
}

function suggestedNodeGuidance(context: PlannerContext): string {
  const suggestedNodes = context.suggestedNodes?.trim()
  return suggestedNodes
    ? `Suggested node guidance:\n${suggestedNodes}`
    : "Suggested node guidance:\nNo MCP suggested-node guidance was available."
}

function buildJsonPrompt(text: string, schema: JsonSchema): string {
  return [
    text,
    "",
    "Return only valid JSON matching this JSON Schema.",
    "Do not include Markdown, commentary, or code fences unless no other response format is possible.",
    "",
    `JSON Schema:\n${JSON.stringify(schema, null, 2)}`,
  ].join("\n")
}

function extractAssistantText(result: OpencodePromptResult): string {
  const parts = Array.isArray(result.data?.parts) ? result.data.parts : result.parts
  if (!Array.isArray(parts)) {
    throw new N8nBuilderError("OpenCode structured planning returned no assistant text.", "OPENCODE_PLANNER_EMPTY")
  }

  const text = parts
    .filter(isTextPart)
    .map((part) => part.text)
    .join("\n")
    .trim()

  if (!text) {
    throw new N8nBuilderError("OpenCode structured planning returned no assistant text.", "OPENCODE_PLANNER_EMPTY")
  }

  return text
}

function isTextPart(value: unknown): value is { type: "text"; text: string } {
  return isRecord(value) && value.type === "text" && typeof value.text === "string"
}

function parseJsonFromAssistantText(text: string): unknown {
  const jsonText = extractJsonText(text)

  try {
    return JSON.parse(jsonText)
  } catch (error) {
    throw new N8nBuilderError("OpenCode structured planning returned invalid JSON.", "OPENCODE_PLANNER_ERROR", {
      cause: serializeError(error),
    })
  }
}

function extractJsonText(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return (fenceMatch?.[1] ?? text).trim()
}

function redactWorkflowJson(currentWorkflowJson: string): string {
  try {
    return JSON.stringify(redactSecretValues(JSON.parse(currentWorkflowJson)), null, 2)
  } catch {
    return redactJsonLikeSecretPairs(currentWorkflowJson)
  }
}

function redactSecretValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecretValues)
  }

  if (typeof value === "string" && isSecretStringValue(value)) {
    return "[REDACTED]"
  }

  if (!isRecord(value)) {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (isSecretKey(key) || isContextualSecretValue(key, item, value)) {
        return [key, "[REDACTED]"]
      }

      return [key, redactSecretValues(item)]
    }),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isSecretKey(key: string): boolean {
  const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase()
  return secretKeyFragments.some((fragment) => normalizedKey.includes(fragment))
}

function isSecretStringValue(value: string): boolean {
  return /^Bearer\s+\S+/i.test(value)
}

function isContextualSecretValue(key: string, value: unknown, parent: Record<string, unknown>): boolean {
  return typeof value === "string" && isGenericSecretValueKey(key) && hasSecretSiblingContext(parent)
}

function isGenericSecretValueKey(key: string): boolean {
  const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase()
  return normalizedKey === "value" || normalizedKey === "headervalue"
}

function hasSecretSiblingContext(parent: Record<string, unknown>): boolean {
  return Object.entries(parent).some(([key, value]) => {
    return isSecretContextKey(key) && typeof value === "string" && isSecretLabel(value)
  })
}

function isSecretContextKey(key: string): boolean {
  const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase()
  return normalizedKey === "name" || normalizedKey === "headername"
}

function isSecretLabel(value: string): boolean {
  const normalizedValue = value.replace(/[^a-z0-9]/gi, "").toLowerCase()
  return secretLabelFragments.some((fragment) => normalizedValue.includes(fragment))
}

function redactJsonLikeSecretPairs(value: string): string {
  return value
    .replace(secretJsonPairPattern, '$1"[REDACTED]"')
    .replace(bearerValuePattern, '$1"[REDACTED]"')
    .replace(authorizationNameValuePairPattern, '$1"$2"$3"[REDACTED]"')
    .replace(apiKeyHeaderNameValuePairPattern, '$1"$2"$3"[REDACTED]"')
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    }
  }

  return {
    message: String(error),
  }
}

const secretKeyFragments = [
  "token",
  "password",
  "secret",
  "apikey",
  "accesstoken",
  "refreshtoken",
  "clientsecret",
  "authorization",
]

const secretLabelFragments = [...secretKeyFragments, "xapikey"]

const secretJsonPairPattern = new RegExp(
  '((?:"[A-Za-z0-9_-]*(?:token|password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization)[A-Za-z0-9_-]*"|[A-Za-z0-9_-]*(?:token|password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization)[A-Za-z0-9_-]*)\\s*:\\s*)("(?:\\\\.|[^"\\\\])*"|[^,}\\]\\s]+)',
  "gi",
)

const bearerValuePattern = /((?:"(?:value|headerValue)"|(?:value|headerValue))\s*:\s*)"Bearer\s+[^"]*"/gi

const authorizationNameValuePairPattern =
  /((?:"name"|name)\s*:\s*)"(Authorization)"(\s*,\s*(?:"value"|value)\s*:\s*)"(?:\\.|[^"\\])*"/gi

const apiKeyHeaderNameValuePairPattern =
  /((?:"headerName"|headerName)\s*:\s*)"(X-API-Key|API-Key|ApiKey)"(\s*,\s*(?:"headerValue"|headerValue)\s*:\s*)"(?:\\.|[^"\\])*"/gi

const workflowPlanNodeJsonSchema: JsonSchema = {
  type: "object",
  properties: {
    key: {
      type: "string",
      description: "Stable internal key used by connections.",
    },
    name: {
      type: "string",
      description: "Unique n8n canvas node name.",
    },
    type: {
      type: "string",
      description: "Full n8n node type, for example n8n-nodes-base.webhook.",
    },
    typeVersion: {
      type: "number",
      description: "n8n node type version.",
    },
    position: {
      type: "array",
      items: { type: "number" },
      minItems: 2,
      maxItems: 2,
      description: "Canvas position as [x, y].",
    },
    parameters: {
      type: "object",
      additionalProperties: true,
      description: "n8n node parameters without plaintext secrets.",
    },
    credential: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "n8n credential key accepted by the node.",
        },
        name: {
          type: "string",
          description: "Existing or configured credential name, not secret data.",
        },
      },
      required: ["type", "name"],
      additionalProperties: false,
    },
  },
  required: ["key", "name", "type", "typeVersion", "position", "parameters"],
  additionalProperties: false,
}

const workflowPlanConnectionJsonSchema: JsonSchema = {
  type: "object",
  properties: {
    from: {
      type: "string",
      description: "Source node key.",
    },
    to: {
      type: "string",
      description: "Target node key.",
    },
    output: {
      type: "string",
      description: "Source output connection type, usually main.",
    },
    input: {
      type: "string",
      description: "Target input connection type, usually main.",
    },
    outputIndex: {
      type: "number",
      description: "Source output index.",
    },
    inputIndex: {
      type: "number",
      description: "Target input index.",
    },
  },
  required: ["from", "to"],
  additionalProperties: false,
}

const workflowPlanJsonSchema: JsonSchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Workflow draft name.",
    },
    summary: {
      type: "string",
      description: "Concise workflow behavior summary.",
    },
    nodes: {
      type: "array",
      items: workflowPlanNodeJsonSchema,
    },
    connections: {
      type: "array",
      items: workflowPlanConnectionJsonSchema,
    },
  },
  required: ["name", "summary", "nodes", "connections"],
  additionalProperties: false,
}

const nodeSelectionJsonSchema: JsonSchema = {
  type: "object",
  properties: {
    nodeType: {
      type: "string",
      description: "Full n8n node type selected for the workflow.",
    },
    reason: {
      type: "string",
      description: "Why this node type is needed for the requested workflow.",
    },
  },
  required: ["nodeType", "reason"],
  additionalProperties: false,
}

const workflowDraftJsonSchema: JsonSchema = {
  type: "object",
  properties: {
    plan: workflowPlanJsonSchema,
    sdkCode: {
      type: "string",
      description: "TypeScript SDK code that builds or validates the planned workflow draft.",
    },
    nodeSelection: {
      type: "array",
      items: nodeSelectionJsonSchema,
      description: "Selected node types and rationale.",
    },
  },
  required: ["plan", "sdkCode"],
  additionalProperties: false,
}

const workflowPatchDraftJsonSchema: JsonSchema = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "Concise summary of the requested workflow update.",
    },
    changes: {
      type: "array",
      items: { type: "string" },
      description: "Human-readable list of intended changes.",
    },
    replacementPlan: workflowPlanJsonSchema,
    sdkCode: {
      type: "string",
      description: "TypeScript SDK code that builds or validates the replacement workflow draft.",
    },
    nodeSelection: {
      type: "array",
      items: nodeSelectionJsonSchema,
      description: "Selected node types and rationale.",
    },
  },
  required: ["summary", "changes", "replacementPlan", "sdkCode"],
  additionalProperties: false,
}
