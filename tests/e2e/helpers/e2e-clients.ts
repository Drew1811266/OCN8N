import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { N8nBuilderError } from "../../../src/errors.js"
import { N8nApiClient } from "../../../src/n8n-api-client.js"
import { N8nMcpClient } from "../../../src/n8n-mcp-client.js"
import { PreviewStore } from "../../../src/preview-store.js"
import { WorkflowRegistry } from "../../../src/registry.js"
import type { PluginConfig } from "../../../src/types.js"
import { createE2eRuntimeConfig, redactSecrets } from "./e2e-env.js"

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

  try {
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
  } catch (error) {
    try {
      await removeWorkspaceDir(workspaceDir)
    } catch {
      // Preserve the setup error that made context creation fail.
    }
    throw error
  }
}

export async function cleanupE2eWorkflows(context: E2eContext): Promise<void> {
  const failures: Array<{ workflowId: string; message: string }> = []

  for (const workflowId of reverseUnique(context.createdWorkflowIds)) {
    try {
      await context.api.deleteWorkflow(workflowId)
    } catch (error) {
      if (isNotFoundError(error)) {
        continue
      }

      failures.push({
        workflowId,
        message: sanitizeCleanupError(error, context.config),
      })
    }
  }

  if (failures.length > 0) {
    const noun = failures.length === 1 ? "workflow" : "workflows"
    const message = `Failed to delete ${failures.length} E2E ${noun}: ${failures
      .map((failure) => `${failure.workflowId} (${failure.message})`)
      .join("; ")}`
    throw new AggregateError(
      failures.map((failure) => new Error(`${failure.workflowId}: ${failure.message}`)),
      message,
    )
  }
}

export async function cleanupE2eContext(context: E2eContext): Promise<void> {
  let workflowCleanupError: unknown
  let workspaceCleanupError: unknown

  try {
    await cleanupE2eWorkflows(context)
  } catch (error) {
    workflowCleanupError = error
  }

  try {
    await removeWorkspaceDir(context.workspaceDir)
  } catch (error) {
    workspaceCleanupError = error
  }

  if (workflowCleanupError) {
    throw workflowCleanupError
  }

  if (workspaceCleanupError) {
    throw workspaceCleanupError
  }
}

export function trackWorkflow(context: E2eContext, workflowId: string): string {
  if (!context.createdWorkflowIds.includes(workflowId)) {
    context.createdWorkflowIds.push(workflowId)
  }

  return workflowId
}

function reverseUnique(workflowIds: string[]): string[] {
  const seen = new Set<string>()
  const uniqueWorkflowIds: string[] = []

  for (const workflowId of [...workflowIds].reverse()) {
    if (seen.has(workflowId)) {
      continue
    }

    seen.add(workflowId)
    uniqueWorkflowIds.push(workflowId)
  }

  return uniqueWorkflowIds
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof N8nBuilderError && error.details.status === 404
}

function sanitizeCleanupError(error: unknown, config: PluginConfig): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  let sanitized = redactSecrets(message)

  for (const secret of [config.apiKey, config.mcpToken]) {
    if (secret) {
      sanitized = sanitized.split(secret).join("[REDACTED]")
    }
  }

  return sanitized
}

async function removeWorkspaceDir(workspaceDir: string): Promise<void> {
  await rm(workspaceDir, { recursive: true, force: true })
}
