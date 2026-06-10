import { tool, type Plugin, type PluginInput, type ToolResult } from "@opencode-ai/plugin"
import { loadApiPluginConfig, loadLocalPluginConfig, loadPluginConfig } from "./config.js"
import { CredentialResolver } from "./credential-resolver.js"
import { N8nBuilderError } from "./errors.js"
import { N8nApiClient } from "./n8n-api-client.js"
import { N8nMcpClient } from "./n8n-mcp-client.js"
import { OpencodePlanner } from "./opencode-planner.js"
import { PreviewStore } from "./preview-store.js"
import { WorkflowRegistry } from "./registry.js"
import { buildWorkflow } from "./tools/build-workflow.js"
import { claimWorkflow, type ClaimWorkflowArgs } from "./tools/claim-workflow.js"
import {
  checkWorkflowReadiness,
  type CheckWorkflowReadinessArgs,
} from "./tools/check-workflow-readiness.js"
import { inspectWorkflow } from "./tools/inspect-workflow.js"
import { listManagedWorkflows } from "./tools/list-managed-workflows.js"
import { updateWorkflow, type UpdateWorkflowArgs } from "./tools/update-workflow.js"

export type N8nBuilderPluginOptions = {
  version?: string
}

export function createN8nBuilderPlugin(options: N8nBuilderPluginOptions = {}): Plugin {
  const version = options.version ?? "0.7.0"

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
        registry: new WorkflowRegistry(config.registryPath),
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
        registry: new WorkflowRegistry(config.registryPath),
        previewStore: new PreviewStore(config.previewDir),
      }
    }

    async function fullDeps() {
      const opencodeConfig = await getOpencodeConfig(client, directory)
      const config = loadPluginConfig({
        env: process.env,
        opencodeConfig,
        workspaceDir: directory,
        pluginVersion: version,
      })
      const api = new N8nApiClient({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
      })
      const mcpClient = new N8nMcpClient({ mcpUrl: config.mcpUrl, authToken: config.mcpToken })

      return {
        config,
        api,
        registry: new WorkflowRegistry(config.registryPath),
        previewStore: new PreviewStore(config.previewDir),
        mcp: {
          getSdkReference: (section: string) => mcpClient.getSdkReference(section),
          searchNodes: (query: string) => mcpClient.searchNodes(query),
          getNodeTypes: (nodeTypes: Parameters<N8nMcpClient["getNodeTypes"]>[0]) =>
            mcpClient.getNodeTypes(nodeTypes),
          getSuggestedNodes: (categories: string[]) => mcpClient.getSuggestedNodes(categories),
          validateWorkflowCode: (code: string) => mcpClient.validateWorkflowCode(code),
        },
        planner: new OpencodePlanner({ client }),
        credentialResolver: new CredentialResolver({
          api,
          env: process.env,
          credentialEnv: config.credentialEnv,
          baseUrl: config.baseUrl,
        }),
      }
    }

    return {
      tool: {
        n8n_build_workflow: tool({
          description:
            "Create a new inactive n8n workflow draft managed by OpenCode from a natural-language request.",
          args: {
            prompt: tool.schema.string().min(1),
            name: tool.schema.string().optional(),
          },
          async execute(args) {
            const resolved = await fullDeps()
            const result = await buildWorkflow({
              args,
              config: resolved.config,
              api: resolved.api,
              registry: resolved.registry,
              planner: resolved.planner,
              mcp: resolved.mcp,
              credentialResolver: resolved.credentialResolver,
            })

            return jsonOutput("n8n workflow draft created", result)
          },
        }),

        n8n_update_workflow: tool({
          description:
            "Preview or apply an update to an n8n workflow previously created and managed by OpenCode.",
          args: {
            workflowId: tool.schema.string().min(1),
            prompt: tool.schema.string().optional(),
            mode: tool.schema.enum(["preview", "apply", "rollback-preview", "rollback-apply"]),
            previewId: tool.schema.string().optional(),
          },
          async execute(args) {
            const updateArgs = toUpdateWorkflowArgs(args)

            if (updateArgs.mode === "preview") {
              const resolved = await fullDeps()
              const result = await updateWorkflow({
                args: updateArgs,
                config: resolved.config,
                api: resolved.api,
                registry: resolved.registry,
                previewStore: resolved.previewStore,
                planner: resolved.planner,
                mcp: resolved.mcp,
                credentialResolver: resolved.credentialResolver,
              })

              return jsonOutput("n8n workflow update", result)
            }

            const resolved = await apiDeps()
            const result = await updateWorkflow({
              args: updateArgs,
              config: resolved.config,
              api: resolved.api,
              registry: resolved.registry,
              previewStore: resolved.previewStore,
            })

            return jsonOutput("n8n workflow update", result)
          },
        }),

        n8n_claim_workflow: tool({
          description:
            "Preview or apply explicit onboarding of an existing inactive n8n workflow into OpenCode management.",
          args: {
            workflowId: tool.schema.string().min(1),
            mode: tool.schema.enum(["preview", "apply"]),
            confirm: tool.schema.boolean().optional(),
          },
          async execute(args) {
            const resolved = await apiDeps()
            const result = await claimWorkflow({
              args: toClaimWorkflowArgs(args),
              config: resolved.config,
              api: resolved.api,
              registry: resolved.registry,
            })

            return jsonOutput("n8n workflow claim", result)
          },
        }),

        n8n_check_workflow_readiness: tool({
          description:
            "Check production readiness for a managed n8n workflow, explicitly activate/deactivate it, and report runtime diagnostics.",
          args: {
            workflowId: tool.schema.string().min(1),
            mode: tool.schema.enum(["preview", "activate", "deactivate"]),
            confirm: tool.schema.boolean().optional(),
            allowWarnings: tool.schema.boolean().optional(),
          },
          async execute(args) {
            const resolved = await apiDeps()
            const result = await checkWorkflowReadiness({
              args: toCheckWorkflowReadinessArgs(args),
              config: {
                baseUrl: resolved.config.baseUrl,
                pluginVersion: resolved.config.pluginVersion,
              },
              api: resolved.api,
              registry: resolved.registry,
            })

            return jsonOutput("n8n workflow readiness", result)
          },
        }),

        n8n_inspect_workflow: tool({
          description:
            "Inspect a managed n8n workflow and report nodes, connections, credential gaps, and validation issues.",
          args: {
            workflowId: tool.schema.string().min(1),
          },
          async execute(args) {
            const resolved = await apiDeps()
            const result = await inspectWorkflow({
              args,
              baseUrl: resolved.config.baseUrl,
              api: resolved.api,
              registry: resolved.registry,
            })

            return jsonOutput("n8n workflow inspection", result)
          },
        }),

        n8n_list_managed_workflows: tool({
          description: "List n8n workflows managed by this OpenCode workspace.",
          args: {},
          async execute() {
            const resolved = await localDeps()
            const result = await listManagedWorkflows({
              registry: resolved.registry,
            })

            return jsonOutput("managed n8n workflows", result)
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

function toCheckWorkflowReadinessArgs(args: {
  workflowId: string
  mode: "preview" | "activate" | "deactivate"
  confirm?: boolean
  allowWarnings?: boolean
}): CheckWorkflowReadinessArgs {
  if (args.mode === "preview") {
    return {
      workflowId: args.workflowId,
      mode: args.mode,
      allowWarnings: args.allowWarnings,
    }
  }

  if (args.mode === "activate") {
    return {
      workflowId: args.workflowId,
      mode: args.mode,
      confirm: args.confirm === true,
      allowWarnings: args.allowWarnings,
    }
  }

  return {
    workflowId: args.workflowId,
    mode: args.mode,
    confirm: args.confirm === true,
  }
}

function toClaimWorkflowArgs(args: {
  workflowId: string
  mode: "preview" | "apply"
  confirm?: boolean
}): ClaimWorkflowArgs {
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

function toUpdateWorkflowArgs(args: {
  workflowId: string
  prompt?: string
  mode: "preview" | "apply" | "rollback-preview" | "rollback-apply"
  previewId?: string
}): UpdateWorkflowArgs {
  if (args.mode === "preview") {
    if (!args.prompt?.trim()) {
      throw new N8nBuilderError("Preview updates require a prompt.", "TOOL_ARGS_INVALID", {
        field: "prompt",
      })
    }

    return {
      workflowId: args.workflowId,
      mode: args.mode,
      prompt: args.prompt,
    }
  }

  if (!args.previewId?.trim()) {
    throw new N8nBuilderError(`${args.mode} updates require a previewId.`, "TOOL_ARGS_INVALID", {
      field: "previewId",
    })
  }

  return {
    workflowId: args.workflowId,
    mode: args.mode,
    previewId: args.previewId,
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
