import type { PluginInput } from "@opencode-ai/plugin"
import { describe, expect, it, vi } from "vitest"
import { createN8nBuilderPlugin } from "../../src/index.js"
import { cleanupE2eContext, createE2eContext, trackWorkflow } from "./helpers/e2e-clients.js"

function pluginInput(directory: string, opencodeConfig: unknown): PluginInput {
  return {
    directory,
    worktree: directory,
    client: {
      app: {
        log: vi.fn().mockResolvedValue(undefined),
      },
      config: {
        get: vi.fn().mockResolvedValue(opencodeConfig),
      },
    },
  } as unknown as PluginInput
}

function parseOutput(value: unknown): unknown {
  expect(value).toEqual(expect.objectContaining({ output: expect.any(String) }))
  return JSON.parse((value as { output: string }).output)
}

function workflowUrl(baseUrl: string, workflowId: string): string {
  return baseUrl.replace(/\/api\/v\d+\/?$/i, `/workflow/${workflowId}`)
}

describe("plugin E2E smoke", () => {
  it("registers tools and executes list and inspect against an E2E workspace", async () => {
    const context = await createE2eContext()

    try {
      const created = await context.api.createWorkflow({
        name: `${context.runId} plugin smoke`,
        active: false,
        nodes: [
          {
            id: "manual-trigger",
            name: "Manual Trigger",
            type: "n8n-nodes-base.manualTrigger",
            typeVersion: 1,
            position: [0, 0],
            parameters: {},
          },
        ],
        connections: {},
        settings: { executionOrder: "v1" },
        meta: {
          managedBy: "opencode-n8n-builder",
          managedByVersion: "0.3.0-e2e",
          createdAt: "2026-06-08T00:00:00.000Z",
        },
      })
      trackWorkflow(context, created.id)
      const createdWorkflow = await context.api.getWorkflow(created.id)
      expect(createdWorkflow.active).toBe(false)

      await context.registry.upsert({
        workflowId: created.id,
        name: created.name,
        url: workflowUrl(context.config.baseUrl, created.id),
        baseUrl: context.config.baseUrl,
        managedBy: "opencode-n8n-builder",
        managedByVersion: "0.3.0-e2e",
        lastPlanHash: "plugin-smoke",
        lastUpdatedAt: "2026-06-08T00:00:00.000Z",
      })

      const plugin = createN8nBuilderPlugin({ version: "0.3.0-e2e" })
      const result = await plugin(
        pluginInput(context.workspaceDir, {
          n8n: {
            baseUrl: context.config.baseUrl,
            apiKey: context.config.apiKey,
            mcpUrl: context.config.mcpUrl,
            mcpToken: context.config.mcpToken,
          },
        }),
      )

      expect(Object.keys(result.tool ?? {})).toEqual([
        "n8n_build_workflow",
        "n8n_update_workflow",
        "n8n_claim_workflow",
        "n8n_check_workflow_readiness",
        "n8n_inspect_workflow",
        "n8n_list_managed_workflows",
      ])

      const listed = parseOutput(await result.tool?.n8n_list_managed_workflows.execute({}, {} as never))
      expect(listed).toEqual(
        expect.objectContaining({
          workflows: expect.arrayContaining([expect.objectContaining({ workflowId: created.id })]),
        }),
      )

      const inspected = parseOutput(
        await result.tool?.n8n_inspect_workflow.execute({ workflowId: created.id }, {} as never),
      )
      expect(inspected).toEqual(
        expect.objectContaining({
          workflowId: created.id,
          name: created.name,
        }),
      )
    } finally {
      await cleanupE2eContext(context)
    }
  })
})
