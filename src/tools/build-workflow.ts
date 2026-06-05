import { N8nBuilderError } from "../errors.js"
import { stableHash } from "../hash.js"
import type { PlannerContext } from "../opencode-planner.js"
import type { WorkflowRegistryRecord } from "../registry.js"
import type { CredentialGap, PluginConfig, Warning } from "../types.js"
import { validateWorkflowForSave, type N8nWorkflow, type WorkflowIssue } from "../validator.js"
import { compileWorkflowPlan } from "../workflow-compiler.js"
import type { WorkflowPlan } from "../workflow-plan.js"
import { extractNodeTypeLookups, type NodeTypeLookup } from "./node-lookup.js"

const managedBy = "opencode-n8n-builder" as const

export type BuildWorkflowArgs = {
  prompt: string
  name?: string
  projectId?: string
  folderId?: string
}

export type BuildWorkflowResult = {
  workflowId: string
  name: string
  url: string
  nodeCount: number
  summary: string
  missingCredentials: CredentialGap[]
  warnings: Warning[]
}

export type BuildWorkflowDeps = {
  args: BuildWorkflowArgs
  config: PluginConfig
  api: {
    createWorkflow(workflow: N8nWorkflow): Promise<N8nWorkflow & { id: string }>
  }
  registry: {
    upsert(record: WorkflowRegistryRecord): Promise<void>
  }
  planner: {
    createPlan(context: PlannerContext): Promise<WorkflowPlan>
  }
  mcp: {
    getSdkReference(section: string): Promise<string>
    searchNodes(query: string): Promise<string>
    getNodeTypes(nodeTypes: NodeTypeLookup[]): Promise<string>
  }
  now?: () => Date
}

export async function buildWorkflow(deps: BuildWorkflowDeps): Promise<BuildWorkflowResult> {
  const createdAt = (deps.now?.() ?? new Date()).toISOString()
  const sdkReference = await deps.mcp.getSdkReference("all")
  const searchResult = await deps.mcp.searchNodes(deps.args.prompt)
  const nodeTypes = extractNodeTypeLookups(searchResult)
  const nodeDocumentation =
    nodeTypes.length > 0
      ? [{ nodeType: "selected", documentation: await deps.mcp.getNodeTypes(nodeTypes) }]
      : []
  const plan = await deps.planner.createPlan({
    prompt: deps.args.prompt,
    sdkReference,
    nodeDocumentation,
  })
  const compiledPlan: WorkflowPlan = {
    ...plan,
    name: deps.args.name ?? plan.name,
  }
  const workflow = compileWorkflowPlan({
    plan: compiledPlan,
    marker: {
      managedBy,
      managedByVersion: deps.config.pluginVersion,
      createdAt,
    },
  })
  const validation = validateWorkflowForSave({
    workflow,
    requireManagedMarker: true,
  })

  if (!validation.valid) {
    throw new N8nBuilderError("Workflow failed validation and was not created.", "WORKFLOW_CREATE_INVALID", {
      issues: validation.issues,
      warnings: validation.warnings,
    })
  }

  const created = await deps.api.createWorkflow(workflow)
  const url = workflowUrl(deps.config.baseUrl, created.id)

  await deps.registry.upsert({
    workflowId: created.id,
    name: workflow.name,
    url,
    baseUrl: deps.config.baseUrl,
    managedBy,
    managedByVersion: deps.config.pluginVersion,
    lastPlanHash: stableHash(compiledPlan),
    lastUpdatedAt: createdAt,
  })

  return {
    workflowId: created.id,
    name: workflow.name,
    url,
    nodeCount: workflow.nodes.length,
    summary: plan.summary,
    missingCredentials: [],
    warnings: validation.warnings.map(toWarning),
  }
}

function workflowUrl(baseUrl: string, workflowId: string): string {
  const appBaseUrl = baseUrl.replace(/\/api\/v\d+\/?$/i, "").replace(/\/+$/, "")
  return `${appBaseUrl}/workflow/${encodeURIComponent(workflowId)}`
}

function toWarning(issue: WorkflowIssue): Warning {
  return {
    code: issue.code,
    message: issue.message,
    nodeName: issue.nodeName,
  }
}
