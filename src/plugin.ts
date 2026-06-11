import { tool, type Plugin, type PluginInput, type ToolResult } from "@opencode-ai/plugin"
import { loadApiPluginConfig, loadLocalPluginConfig } from "./config.js"
import { N8nApiClient } from "./n8n-api-client.js"
import { applyV2Preview } from "./tools/v2-apply.js"
import { autoPreviewV2Workflow } from "./tools/v2-auto-preview.js"
import { claimV2Workflow, type V2ClaimWorkflowArgs } from "./tools/v2-claim-workflow.js"
import { compileV2Preview } from "./tools/v2-compile-preview.js"
import { createV2Plan } from "./tools/v2-create-plan.js"
import { patchV2PlanTool } from "./tools/v2-patch-plan.js"
import { reverseV2WorkflowPlan } from "./tools/v2-reverse-plan.js"
import { reviewV2PlanTool } from "./tools/v2-review-plan.js"
import { runV2Trial } from "./tools/v2-run-trial.js"
import { validateSimulateV2Plan } from "./tools/v2-validate-simulate.js"
import { V2PlanStore } from "./v2/plan-store.js"
import { V2PreviewStore } from "./v2/preview-store.js"
import { V2WorkflowRegistry } from "./v2/registry.js"
import { V2RunStore } from "./v2/run-store.js"

export type N8nBuilderPluginOptions = {
  version?: string
}

export function createN8nBuilderPlugin(options: N8nBuilderPluginOptions = {}): Plugin {
  const version = options.version ?? "2.0.0"

  const plugin: Plugin = async ({ client, directory }) => {
    await client.app.log({
      body: {
        service: "opencode-n8n-builder",
        level: "info",
        message: "Plugin initialized",
        extra: { version },
      },
    })

    async function localDeps() {
      const opencodeConfig = await getOpencodeConfig(client, directory)
      const config = loadLocalPluginConfig({
        env: process.env,
        opencodeConfig,
        workspaceDir: directory,
        pluginVersion: version,
      })

      return {
        config,
        v2PlanStore: new V2PlanStore(config.v2.plansDir),
        v2PreviewStore: new V2PreviewStore(config.v2.previewsDir),
        v2RunStore: new V2RunStore(config.v2.runsDir),
      }
    }

    async function apiDeps() {
      const opencodeConfig = await getOpencodeConfig(client, directory)
      const config = loadApiPluginConfig({
        env: process.env,
        opencodeConfig,
        workspaceDir: directory,
        pluginVersion: version,
      })
      const api = new N8nApiClient({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
      })

      return {
        config,
        api,
        v2PlanStore: new V2PlanStore(config.v2.plansDir),
        v2PreviewStore: new V2PreviewStore(config.v2.previewsDir),
        v2Registry: new V2WorkflowRegistry(config.v2.registryPath),
      }
    }

    return {
      tool: {
        n8n_v2_auto_preview: tool({
          description:
            "Create, review, validate, simulate, and compile a v2 workflow preview from a natural-language request without writing to n8n.",
          args: {
            prompt: tool.schema.string().min(1),
            name: tool.schema.string().optional(),
          },
          async execute(args) {
            const resolved = await localDeps()
            const result = await autoPreviewV2Workflow({
              args,
              planStore: resolved.v2PlanStore,
              previewStore: resolved.v2PreviewStore,
              pluginVersion: resolved.config.pluginVersion,
            })

            return jsonOutput("v2 n8n workflow auto preview compiled", result)
          },
        }),

        n8n_v2_create_plan: tool({
          description: "Create a v2 business workflow plan artifact without connecting to n8n.",
          args: {
            prompt: tool.schema.string().min(1),
            name: tool.schema.string().optional(),
          },
          async execute(args) {
            const resolved = await localDeps()
            const result = await createV2Plan({
              args,
              planStore: resolved.v2PlanStore,
            })

            return jsonOutput("v2 n8n workflow plan created", result)
          },
        }),

        n8n_v2_review_plan: tool({
          description: "Explain and review a stored v2 business workflow plan version.",
          args: {
            planId: tool.schema.string().min(1),
            planVersion: tool.schema.number().int().min(1),
          },
          async execute(args) {
            const resolved = await localDeps()
            const result = await reviewV2PlanTool({
              args,
              planStore: resolved.v2PlanStore,
            })

            return jsonOutput("v2 n8n workflow plan review", result)
          },
        }),

        n8n_v2_patch_plan: tool({
          description: "Patch a stored v2 business workflow plan and save a new plan version.",
          args: {
            planId: tool.schema.string().min(1),
            planVersion: tool.schema.number().int().min(1),
            patch: tool.schema.string().min(1),
          },
          async execute(args) {
            const resolved = await localDeps()
            const result = await patchV2PlanTool({
              args,
              planStore: resolved.v2PlanStore,
            })

            return jsonOutput("v2 n8n workflow plan patched", result)
          },
        }),

        n8n_v2_validate_simulate: tool({
          description: "Run foundation v2 validation and sample simulation for a stored plan version.",
          args: {
            planId: tool.schema.string().min(1),
            planVersion: tool.schema.number().int().min(1),
          },
          async execute(args) {
            const resolved = await localDeps()
            const result = await validateSimulateV2Plan({
              args,
              planStore: resolved.v2PlanStore,
            })

            return jsonOutput("v2 n8n workflow plan validation and simulation", result)
          },
        }),

        n8n_v2_compile_preview: tool({
          description: "Compile a validated v2 business workflow plan version into a local n8n workflow preview artifact.",
          args: {
            planId: tool.schema.string().min(1),
            planVersion: tool.schema.number().int().min(1),
          },
          async execute(args) {
            const resolved = await localDeps()
            const result = await compileV2Preview({
              args,
              planStore: resolved.v2PlanStore,
              previewStore: resolved.v2PreviewStore,
              pluginVersion: resolved.config.pluginVersion,
            })

            return jsonOutput("v2 n8n workflow preview compiled", result)
          },
        }),

        n8n_v2_apply: tool({
          description: "Create a new inactive n8n workflow from a compiled v2 preview after explicit confirmation.",
          args: {
            previewId: tool.schema.string().min(1),
            confirm: tool.schema.boolean(),
          },
          async execute(args) {
            const resolved = await apiDeps()
            const result = await applyV2Preview({
              args,
              config: {
                baseUrl: resolved.config.baseUrl,
                pluginVersion: resolved.config.pluginVersion,
              },
              api: resolved.api,
              planStore: resolved.v2PlanStore,
              previewStore: resolved.v2PreviewStore,
              registry: resolved.v2Registry,
            })

            return jsonOutput("v2 n8n workflow preview applied", result)
          },
        }),

        n8n_v2_claim_workflow: tool({
          description: "Preview or apply explicit v2 claim/import of an existing n8n workflow.",
          args: {
            workflowId: tool.schema.string().min(1),
            mode: tool.schema.enum(["preview", "apply"]),
            confirm: tool.schema.boolean().optional(),
          },
          async execute(args) {
            const resolved = await apiDeps()
            const result = await claimV2Workflow({
              args: toV2ClaimWorkflowArgs(args),
              config: {
                baseUrl: resolved.config.baseUrl,
                pluginVersion: resolved.config.pluginVersion,
              },
              api: resolved.api,
              registry: resolved.v2Registry,
            })

            return jsonOutput("v2 n8n workflow claim", result)
          },
        }),

        n8n_v2_reverse_plan: tool({
          description: "Reverse plan a v2-claimed n8n workflow into a local v2 plan artifact without writing to n8n.",
          args: {
            workflowId: tool.schema.string().min(1),
          },
          async execute(args) {
            const resolved = await apiDeps()
            const result = await reverseV2WorkflowPlan({
              args,
              config: {
                baseUrl: resolved.config.baseUrl,
                pluginVersion: resolved.config.pluginVersion,
              },
              api: resolved.api,
              registry: resolved.v2Registry,
              planStore: resolved.v2PlanStore,
            })

            return jsonOutput("v2 n8n workflow reverse plan", result)
          },
        }),

        n8n_v2_run_trial: tool({
          description:
            "Run a confirm-gated v2 dry-run trial by re-running local validation and simulation for a compiled preview without triggering n8n.",
          args: {
            previewId: tool.schema.string().min(1),
            mode: tool.schema.enum(["dry_run"]),
            confirm: tool.schema.boolean(),
            sampleName: tool.schema.string().optional(),
          },
          async execute(args) {
            const resolved = await localDeps()
            const result = await runV2Trial({
              args,
              planStore: resolved.v2PlanStore,
              previewStore: resolved.v2PreviewStore,
              runStore: resolved.v2RunStore,
            })

            return jsonOutput("v2 n8n workflow dry-run trial", result)
          },
        }),
      },
    }
  }

  return plugin
}

export const N8nBuilderPlugin = createN8nBuilderPlugin()

async function getOpencodeConfig(client: PluginInput["client"], directory: string): Promise<unknown> {
  const response = await client.config.get({ query: { directory } })

  if (isRecord(response) && "data" in response && response.data !== undefined) {
    return response.data
  }

  return response
}

function toV2ClaimWorkflowArgs(args: {
  workflowId: string
  mode: "preview" | "apply"
  confirm?: boolean
}): V2ClaimWorkflowArgs {
  if (args.mode === "preview") {
    return {
      workflowId: args.workflowId,
      mode: args.mode,
    }
  }

  return {
    workflowId: args.workflowId,
    mode: args.mode,
    confirm: args.confirm,
  }
}

function jsonOutput(title: string, result: unknown): ToolResult {
  return {
    title,
    output: JSON.stringify(result, null, 2),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
