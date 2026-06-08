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
    getSuggestedNodes?(categories: string[]): Promise<string>
  }
  credentialResolver?: WorkflowCredentialResolver
  now?: () => Date
}

type WorkflowCredentialResolver = {
  resolve(input: { nodeName: string; credentialType: string }): Promise<{
    reference?: {
      id: string
      name: string
    }
    gap?: CredentialGap
  }>
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
  const suggestedNodes = await getSuggestedNodesForPrompt(deps.mcp, deps.args.prompt)
  const plan = await deps.planner.createPlan(
    withSuggestedNodes(
      {
        prompt: deps.args.prompt,
        sdkReference,
        nodeDocumentation,
      },
      suggestedNodes,
    ),
  )
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

  const missingCredentials = await resolveWorkflowCredentials(workflow, deps.credentialResolver)
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
    missingCredentials,
    warnings: validation.warnings.map(toWarning),
  }
}

async function resolveWorkflowCredentials(
  workflow: N8nWorkflow,
  credentialResolver: WorkflowCredentialResolver | undefined,
): Promise<CredentialGap[]> {
  if (!credentialResolver) return []

  const missingCredentials: CredentialGap[] = []

  for (const node of workflow.nodes) {
    if (!node.credentials) continue

    for (const credentialType of Object.keys(node.credentials)) {
      const result = await credentialResolver.resolve({
        nodeName: node.name,
        credentialType,
      })

      if (result.reference) {
        node.credentials[credentialType] = {
          id: result.reference.id,
          name: result.reference.name,
        }
      }

      if (result.gap) {
        missingCredentials.push(result.gap)
      }
    }
  }

  return missingCredentials
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

async function getSuggestedNodesForPrompt(
  mcp: BuildWorkflowDeps["mcp"],
  prompt: string,
): Promise<string | undefined> {
  const categories = suggestedNodeCategories(prompt)
  if (!mcp.getSuggestedNodes || categories.length === 0) return undefined

  const suggestedNodes = await mcp.getSuggestedNodes(categories)
  const trimmed = suggestedNodes?.trim()
  return trimmed ? trimmed : undefined
}

function withSuggestedNodes(context: PlannerContext, suggestedNodes: string | undefined): PlannerContext {
  return suggestedNodes ? { ...context, suggestedNodes } : context
}

function suggestedNodeCategories(prompt: string): string[] {
  const normalized = prompt.toLowerCase()
  const categories: string[] = []

  if (/\b(schedule|cron|daily|weekly|hourly)\b|every morning|定时|每天|每周/.test(normalized)) {
    categories.push("scheduling")
  }
  if (/\b(webhook|form)\b|表单/.test(normalized)) {
    categories.push("form_input")
  }
  if (/\b(http|api|fetch|request)\b|接口/.test(normalized)) {
    categories.push("data_extraction")
  }
  if (/\b(transform|filter|if|merge|set)\b|整理|过滤|判断/.test(normalized)) {
    categories.push("data_transformation")
  }
  if (/\b(email|slack|notify|notification)\b|提醒|通知/.test(normalized)) {
    categories.push("notification")
  }

  return categories.slice(0, 4)
}
