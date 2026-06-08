import { describe, expect, it } from "vitest"
import type { E2eContext } from "./helpers/e2e-clients.js"
import { cleanupE2eContext, createE2eContext } from "./helpers/e2e-clients.js"
import { redactSecrets } from "./helpers/e2e-env.js"
import { e2eManualSetSdkCode } from "./helpers/test-workflows.js"

describe("n8n MCP E2E", () => {
  it("calls official workflow builder MCP tools with plugin argument shapes", async () => {
    let context: E2eContext | undefined
    let testError: Error | undefined

    try {
      context = await createE2eContext()

      const sdkReference = await context.mcp.getSdkReference("all")
      const searchResult = await context.mcp.searchNodes("manual trigger set node")
      const nodeTypes = await context.mcp.getNodeTypes([
        "n8n-nodes-base.manualTrigger",
        "n8n-nodes-base.set",
      ])
      const suggestions = await context.mcp.getSuggestedNodes(["scheduling", "data_transformation"])
      const validation = await context.mcp.validateWorkflowCode(e2eManualSetSdkCode)

      expect(sdkReference.length).toBeGreaterThan(0)
      expect(sdkReference).toMatch(/workflow|node|sdk|credential|n8n/i)
      expect(searchResult).toMatch(/manual|trigger|set|n8n-nodes-base/i)
      expect(nodeTypes).toMatch(/manual|trigger|set|n8n-nodes-base/i)
      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions).toMatch(/schedule|set|if|trigger|node/i)
      expect(validation.valid).toBe(true)
      if (typeof validation.nodeCount === "number") {
        expect(validation.nodeCount).toBeGreaterThan(0)
      }
    } catch (error) {
      testError = createMcpDiagnosticError(error, context)
    }

    let cleanupError: Error | undefined
    if (context) {
      try {
        await cleanupE2eContext(context)
      } catch (error) {
        cleanupError = createCleanupDiagnosticError(error, context)
      }
    }

    if (testError && cleanupError) {
      throw new AggregateError(
        [testError, cleanupError],
        sanitizeDiagnostic("n8n MCP E2E failed and cleanup also failed.", context),
      )
    }

    if (testError) {
      throw testError
    }

    if (cleanupError) {
      throw cleanupError
    }
  })
})

function createMcpDiagnosticError(error: unknown, context: E2eContext | undefined): Error {
  const configuredMcpUrl = context?.config.mcpUrl ?? process.env.N8N_E2E_MCP_URL ?? "(not configured)"
  const diagnostic = [
    "n8n MCP E2E failed.",
    `Configured MCP URL: ${configuredMcpUrl}`,
    "Expected official workflow-builder MCP tools: get_sdk_reference, search_nodes, get_node_types, get_suggested_nodes, and validate_workflow.",
    "Expected argument shapes: get_sdk_reference { section }, search_nodes { queries: [...] }, get_node_types { nodeIds: [...] }, get_suggested_nodes { categories: [...] }, validate_workflow { code }.",
    "Confirm the local n8n version exposes get_suggested_nodes and validate_workflow.",
    "If the MCP endpoint requires auth, set N8N_E2E_MCP_TOKEN and rerun npm run test:e2e.",
    String(error),
  ].join("\n")

  return new Error(sanitizeDiagnostic(diagnostic, context))
}

function createCleanupDiagnosticError(error: unknown, context: E2eContext): Error {
  return new Error(sanitizeDiagnostic(`n8n MCP E2E cleanup failed.\n${String(error)}`, context))
}

function sanitizeDiagnostic(value: string, context: E2eContext | undefined): string {
  let sanitized = redactSecrets(value)

  for (const secret of [
    context?.config.apiKey,
    context?.config.mcpToken,
    process.env.N8N_E2E_API_KEY,
    process.env.N8N_E2E_MCP_TOKEN,
  ]) {
    if (secret) {
      sanitized = sanitized.split(secret).join("[REDACTED]")
    }
  }

  return sanitized
}
