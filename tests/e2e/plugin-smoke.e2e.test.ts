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

describe("plugin E2E smoke", () => {
  it("runs a complex v2 preview, dry-run trial, and inactive apply against an E2E workspace", async () => {
    const context = await createE2eContext()

    try {
      const plugin = createN8nBuilderPlugin({ version: "2.0.0-e2e" })
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
        "n8n_v2_auto_preview",
        "n8n_v2_create_plan",
        "n8n_v2_review_plan",
        "n8n_v2_patch_plan",
        "n8n_v2_validate_simulate",
        "n8n_v2_compile_preview",
        "n8n_v2_apply",
        "n8n_v2_claim_workflow",
        "n8n_v2_reverse_plan",
        "n8n_v2_run_trial",
      ])

      const preview = parseOutput(
        await result.tool?.n8n_v2_auto_preview.execute(
          {
            prompt:
              "Create a webhook order workflow that maps fields, filters invalid orders, branches by status with a default path, processes each item in batches, and responds to the webhook.",
            name: `${context.runId} v2 complex orders`,
          },
          {} as never,
        ),
      ) as { previewId: string; planVersion: number; validationStatus: string; nodeCount: number; mappingTrace: unknown[] }
      expect(preview).toEqual(
        expect.objectContaining({
          planVersion: 1,
          validationStatus: "passed",
          nodeCount: expect.any(Number),
        }),
      )
      expect(preview.mappingTrace.length).toBeGreaterThan(0)

      const trial = parseOutput(
        await result.tool?.n8n_v2_run_trial.execute(
          {
            previewId: preview.previewId,
            mode: "dry_run",
            confirm: true,
            sampleName: "valid order",
          },
          {} as never,
        ),
      ) as { previewId: string; status: string; triggered: boolean; executionMode: string }
      expect(trial).toEqual(
        expect.objectContaining({
          previewId: preview.previewId,
          status: "passed",
          triggered: false,
          executionMode: "not_triggered",
        }),
      )

      const applied = parseOutput(
        await result.tool?.n8n_v2_apply.execute(
          {
            previewId: preview.previewId,
            confirm: true,
          },
          {} as never,
        ),
      ) as { workflowId: string; mode: string; validationStatus: string }
      trackWorkflow(context, applied.workflowId)
      expect(applied).toEqual(
        expect.objectContaining({
          mode: "create",
          validationStatus: "passed",
        }),
      )

      const appliedWorkflow = await context.api.getWorkflow(applied.workflowId)
      expect(appliedWorkflow.active).toBe(false)
      expect(appliedWorkflow.tags).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "opencode-n8n-builder-v2" })]),
      )
    } finally {
      await cleanupE2eContext(context)
    }
  })
})
