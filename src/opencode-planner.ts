import { N8nBuilderError } from "./errors.js"
import {
  workflowPatchPlanSchema,
  workflowPlanSchema,
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
      structured_output?: unknown
      error?: {
        name?: string
        message?: string
      }
    }
  }
}

type OpencodeClientLike = {
  session: {
    create(input: { body: { title: string } }): Promise<OpencodeSessionCreateResult>
    prompt(input: {
      path: { id: string }
      body: {
        parts: Array<{ type: "text"; text: string }>
        format: {
          type: "json_schema"
          schema: JsonSchema
          retryCount: number
        }
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
    const output = await this.promptStructured({
      title: "n8n workflow planning",
      text: this.buildCreatePrompt(context),
      schema: workflowPlanJsonSchema,
    })

    return this.parsePlan(output)
  }

  async createPatchPlan(context: PatchPlannerContext): Promise<WorkflowPatchPlan> {
    const output = await this.promptStructured({
      title: "n8n workflow update planning",
      text: this.buildPatchPrompt(context),
      schema: workflowPatchPlanJsonSchema,
    })

    return this.parsePatchPlan(output)
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
          parts: [{ type: "text", text: input.text }],
          format: {
            type: "json_schema",
            schema: input.schema,
            retryCount: 2,
          },
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

      if (!info?.structured_output) {
        throw new N8nBuilderError("OpenCode structured planning returned no structured output.", "OPENCODE_PLANNER_EMPTY")
      }

      return info.structured_output
    } catch (error) {
      if (error instanceof N8nBuilderError) {
        throw error
      }

      throw new N8nBuilderError("OpenCode structured planning failed.", "OPENCODE_PLANNER_ERROR", {
        cause: serializeError(error),
      })
    }
  }

  private parsePlan(output: unknown): WorkflowPlan {
    try {
      return workflowPlanSchema.parse(output)
    } catch (error) {
      throw new N8nBuilderError("OpenCode structured planning returned an invalid WorkflowPlan.", "OPENCODE_PLANNER_ERROR", {
        cause: serializeError(error),
      })
    }
  }

  private parsePatchPlan(output: unknown): WorkflowPatchPlan {
    try {
      return workflowPatchPlanSchema.parse(output)
    } catch (error) {
      throw new N8nBuilderError(
        "OpenCode structured planning returned an invalid WorkflowPatchPlan.",
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
      "",
      `User request:\n${context.prompt}`,
      "",
      `SDK reference:\n${context.sdkReference}`,
      "",
      `Node documentation:\n${JSON.stringify(context.nodeDocumentation, null, 2)}`,
    ].join("\n")
  }

  private buildPatchPrompt(context: PatchPlannerContext): string {
    return [
      "Create a full replacement WorkflowPatchPlan for a managed n8n workflow.",
      "Preserve existing behavior unless the user request changes it.",
      "Do not include secret values, API keys, tokens, passwords, OAuth secrets, or bearer strings.",
      "Use credential reference names only when a node needs credentials.",
      "",
      `User request:\n${context.prompt}`,
      "",
      `Current workflow JSON:\n${context.currentWorkflowJson}`,
      "",
      `SDK reference:\n${context.sdkReference}`,
      "",
      `Node documentation:\n${JSON.stringify(context.nodeDocumentation, null, 2)}`,
    ].join("\n")
  }
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

const workflowPatchPlanJsonSchema: JsonSchema = {
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
  },
  required: ["summary", "changes", "replacementPlan"],
  additionalProperties: false,
}
