import { describe, expect, it } from "vitest"
import type { E2eContext } from "./helpers/e2e-clients.js"
import { cleanupE2eContext, createE2eContext } from "./helpers/e2e-clients.js"
import { redactSecrets } from "./helpers/e2e-env.js"

describe("n8n MCP E2E", () => {
  it("calls official workflow builder MCP tools with plugin argument shapes", async () => {
    let context: E2eContext | undefined

    try {
      context = await createE2eContext()

      const sdkReference = await context.mcp.getSdkReference("all")
      const searchResult = await context.mcp.searchNodes("manual trigger set node")
      const nodeTypes = await context.mcp.getNodeTypes([
        "n8n-nodes-base.manualTrigger",
        "n8n-nodes-base.set",
      ])

      expect(sdkReference.length).toBeGreaterThan(0)
      expect(sdkReference).toMatch(/workflow|node|sdk|credential|n8n/i)
      expect(searchResult).toMatch(/manual|trigger|set|n8n-nodes-base/i)
      expect(nodeTypes).toMatch(/manual|trigger|set|n8n-nodes-base/i)
    } catch (error) {
      const configuredMcpUrl = context?.config.mcpUrl ?? process.env.N8N_E2E_MCP_URL ?? "(not configured)"
      const diagnostic = [
        "n8n MCP E2E failed.",
        `Configured MCP URL: ${configuredMcpUrl}`,
        "Expected official workflow-builder MCP tools: get_sdk_reference, search_nodes, and get_node_types.",
        "Expected argument shapes: get_sdk_reference { section }, search_nodes { queries: [...] }, get_node_types { nodeIds: [...] }.",
        "If the MCP endpoint requires auth, set N8N_E2E_MCP_TOKEN and rerun npm run test:e2e.",
        String(error),
      ].join("\n")

      throw new Error(redactSecrets(diagnostic))
    } finally {
      if (context) {
        await cleanupE2eContext(context)
      }
    }
  })
})
