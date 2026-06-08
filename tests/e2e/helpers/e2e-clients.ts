import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { N8nApiClient } from "../../../src/n8n-api-client.js"
import { N8nMcpClient } from "../../../src/n8n-mcp-client.js"
import { PreviewStore } from "../../../src/preview-store.js"
import { WorkflowRegistry } from "../../../src/registry.js"
import type { PluginConfig } from "../../../src/types.js"
import { createE2eRuntimeConfig } from "./e2e-env.js"

export type E2eContext = {
  runId: string
  workspaceDir: string
  config: PluginConfig
  api: N8nApiClient
  mcp: N8nMcpClient
  registry: WorkflowRegistry
  previewStore: PreviewStore
  createdWorkflowIds: string[]
}

export async function createE2eContext(): Promise<E2eContext> {
  const runId = `ocn8n-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const workspaceDir = await mkdtemp(path.join(tmpdir(), `${runId}-`))
  const config = createE2eRuntimeConfig({
    env: process.env,
    workspaceDir,
    pluginVersion: "0.2.0-e2e",
  })
  const api = new N8nApiClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  })
  const mcp = new N8nMcpClient({
    mcpUrl: config.mcpUrl,
    authToken: config.mcpToken,
  })

  return {
    runId,
    workspaceDir,
    config,
    api,
    mcp,
    registry: new WorkflowRegistry(config.registryPath),
    previewStore: new PreviewStore(config.previewDir),
    createdWorkflowIds: [],
  }
}

export async function cleanupE2eWorkflows(context: E2eContext): Promise<void> {
  for (const workflowId of [...context.createdWorkflowIds].reverse()) {
    try {
      await context.api.deleteWorkflow(workflowId)
    } catch (error) {
      console.warn(`Failed to delete E2E workflow ${workflowId}: ${String(error)}`)
    }
  }
}

export function trackWorkflow(context: E2eContext, workflowId: string): string {
  context.createdWorkflowIds.push(workflowId)
  return workflowId
}
