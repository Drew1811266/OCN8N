import { N8nBuilderError } from "./errors.js"
import type { McpWorkflowValidationResult, McpWorkflowValidationWarning } from "./n8n-mcp-client.js"
import type { Warning } from "./types.js"
import type { N8nWorkflow } from "./validator.js"

export type { McpWorkflowValidationResult }

export type McpWorkflowValidator = {
  validateWorkflowCode(code: string): Promise<McpWorkflowValidationResult>
}

export type ValidateWorkflowWithMcpInput = {
  mcp: McpWorkflowValidator
  workflow: N8nWorkflow
}

export async function validateWorkflowWithMcp(input: ValidateWorkflowWithMcpInput): Promise<Warning[]> {
  const result = await input.mcp.validateWorkflowCode(workflowToMcpValidationCode(input.workflow))

  if (!result.valid) {
    throw new N8nBuilderError("n8n MCP workflow validation failed.", "MCP_WORKFLOW_VALIDATION_FAILED", {
      errors: result.errors,
      warnings: result.warnings.map(toDetailsWarning),
    })
  }

  if (typeof result.nodeCount === "number" && result.nodeCount !== input.workflow.nodes.length) {
    throw new N8nBuilderError("n8n MCP workflow validation node count mismatch.", "MCP_WORKFLOW_VALIDATION_MISMATCH", {
      expectedNodeCount: input.workflow.nodes.length,
      validatedNodeCount: result.nodeCount,
    })
  }

  return result.warnings.map((warning) => ({
    code: `MCP_${warning.code}`,
    message: warning.message,
    nodeName: warning.nodeName,
  }))
}

export function workflowToMcpValidationCode(workflow: N8nWorkflow): string {
  const validationWorkflow = {
    name: workflow.name,
    nodes: workflow.nodes.map((node) => ({
      ...(node.id ? { id: node.id } : {}),
      name: node.name,
      type: node.type,
      typeVersion: node.typeVersion,
      position: node.position,
      parameters: node.parameters,
    })),
    connections: workflow.connections,
  }

  return [
    "import { Workflow } from '@n8n/workflow'",
    "",
    `const workflow = new Workflow(${JSON.stringify(validationWorkflow, null, 2)})`,
    "",
    "export default workflow",
  ].join("\n")
}

function toDetailsWarning(warning: McpWorkflowValidationWarning): McpWorkflowValidationWarning {
  return {
    code: warning.code,
    message: warning.message,
    nodeName: warning.nodeName,
    parameterPath: warning.parameterPath,
  }
}
