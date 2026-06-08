import { describe, expect, it, vi } from "vitest"

import { N8nBuilderError } from "../src/errors.js"
import { validateWorkflowWithMcp, type McpWorkflowValidator } from "../src/mcp-workflow-validation.js"
import type { N8nWorkflow } from "../src/validator.js"

function workflow(overrides: Partial<N8nWorkflow> = {}): N8nWorkflow {
  return {
    name: "Validated Workflow",
    active: false,
    nodes: [
      {
        id: "http-node",
        name: "HTTP Request",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4,
        position: [0, 0],
        parameters: {},
      },
    ],
    connections: {},
    settings: {},
    ...overrides,
  }
}

describe("validateWorkflowWithMcp", () => {
  it("returns MCP warnings with prefixed codes while preserving message and nodeName", async () => {
    const mcp: McpWorkflowValidator = {
      validateWorkflowCode: vi.fn(async () => ({
        valid: true,
        nodeCount: 1,
        warnings: [
          {
            code: "MISSING_RETRY",
            message: "HTTP Request has no retry policy.",
            nodeName: "HTTP Request",
          },
        ],
        errors: [],
      })),
    }

    await expect(
      validateWorkflowWithMcp({
        mcp,
        workflow: workflow(),
        sdkCode: "export default workflow",
      }),
    ).resolves.toEqual([
      {
        code: "MCP_MISSING_RETRY",
        message: "HTTP Request has no retry policy.",
        nodeName: "HTTP Request",
      },
    ])
    expect(mcp.validateWorkflowCode).toHaveBeenCalledWith("export default workflow")
  })

  it("throws a typed error and does not return success when MCP marks the workflow invalid", async () => {
    const mcp: McpWorkflowValidator = {
      validateWorkflowCode: vi.fn(async () => ({
        valid: false,
        nodeCount: 1,
        warnings: [
          {
            code: "DEPRECATED_PARAMETER",
            message: "A deprecated parameter is still set.",
            nodeName: "HTTP Request",
            parameterPath: "parameters.url",
          },
        ],
        errors: ["HTTP Request is missing a required parameter."],
      })),
    }

    await expect(
      validateWorkflowWithMcp({
        mcp,
        workflow: workflow(),
        sdkCode: "export default workflow",
      }),
    ).rejects.toMatchObject({
      code: "MCP_WORKFLOW_VALIDATION_FAILED",
      details: {
        errors: ["HTTP Request is missing a required parameter."],
        warnings: [
          {
            code: "DEPRECATED_PARAMETER",
            message: "A deprecated parameter is still set.",
            nodeName: "HTTP Request",
            parameterPath: "parameters.url",
          },
        ],
      },
    } satisfies Partial<N8nBuilderError>)
  })

  it("throws a typed mismatch error when MCP validates a different node count", async () => {
    const mcp: McpWorkflowValidator = {
      validateWorkflowCode: vi.fn(async () => ({
        valid: true,
        nodeCount: 2,
        warnings: [],
        errors: [],
      })),
    }

    await expect(
      validateWorkflowWithMcp({
        mcp,
        workflow: workflow(),
        sdkCode: "export default workflow",
      }),
    ).rejects.toMatchObject({
      code: "MCP_WORKFLOW_VALIDATION_MISMATCH",
      details: {
        expectedNodeCount: 1,
        validatedNodeCount: 2,
      },
    } satisfies Partial<N8nBuilderError>)
  })
})
