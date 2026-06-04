import { N8nBuilderError } from "../errors.js"
import { stableHash } from "../hash.js"
import type { NodeTypeLookup } from "../n8n-mcp-client.js"
import type { PlannerContext } from "../opencode-planner.js"
import type { WorkflowRegistryRecord } from "../registry.js"
import type { CredentialGap, PluginConfig, Warning } from "../types.js"
import { validateWorkflowForSave, type N8nWorkflow, type WorkflowIssue } from "../validator.js"
import { compileWorkflowPlan } from "../workflow-compiler.js"
import type { WorkflowPlan } from "../workflow-plan.js"

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
  const nodeTypes = extractNodeTypes(searchResult)
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

function extractNodeTypes(searchResult: string): NodeTypeLookup[] {
  const jsonLookups: NodeTypeLookup[] = []
  const jsonRanges: Array<[number, number]> = []

  for (const candidate of parseJsonCandidates(searchResult)) {
    const lookups = collectNodeTypeLookups(candidate.value)
    if (lookups.length === 0) continue

    jsonLookups.push(...lookups)
    jsonRanges.push(candidate.range)
  }

  const searchableText = removeRanges(searchResult, jsonRanges)
  const textLookups = searchableText.match(/(?:@n8n\/)?n8n-nodes-[a-z0-9_-]+(?:\.[a-z0-9_-]+)+\b/gi) ?? []

  return dedupeNodeTypeLookups([...jsonLookups, ...textLookups]).slice(0, 20)
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

function parseJsonCandidates(input: string): Array<{ value: unknown; range: [number, number] }> {
  const candidates: Array<{ value: unknown; range: [number, number] }> = []

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (char !== "{" && char !== "[") continue

    const end = findJsonEnd(input, index)
    if (end === undefined) continue

    try {
      candidates.push({ value: JSON.parse(input.slice(index, end)), range: [index, end] })
      index = end - 1
    } catch {
      continue
    }
  }

  return candidates
}

function findJsonEnd(input: string, start: number): number | undefined {
  const stack: string[] = []
  let inString = false
  let escaped = false

  for (let index = start; index < input.length; index += 1) {
    const char = input[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === "\"") {
        inString = false
      }

      continue
    }

    if (char === "\"") {
      inString = true
      continue
    }

    if (char === "{") {
      stack.push("}")
      continue
    }

    if (char === "[") {
      stack.push("]")
      continue
    }

    if (char === "}" || char === "]") {
      if (stack.pop() !== char) return undefined
      if (stack.length === 0) return index + 1
    }
  }

  return undefined
}

function collectNodeTypeLookups(value: unknown): NodeTypeLookup[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectNodeTypeLookups)
  }

  if (!isRecord(value)) {
    return []
  }

  const lookups = Object.values(value).flatMap(collectNodeTypeLookups)
  if (typeof value.nodeId !== "string" || !isNodeId(value.nodeId)) {
    return lookups
  }

  const lookup: Exclude<NodeTypeLookup, string> = {
    nodeId: value.nodeId,
  }

  if (typeof value.version === "number") {
    lookup.version = value.version
  }

  if (typeof value.resource === "string") {
    lookup.resource = value.resource
  }

  if (typeof value.operation === "string") {
    lookup.operation = value.operation
  }

  if (typeof value.mode === "string") {
    lookup.mode = value.mode
  }

  return [lookup, ...lookups]
}

function removeRanges(input: string, ranges: Array<[number, number]>): string {
  if (ranges.length === 0) return input

  let output = ""
  let cursor = 0

  for (const [start, end] of mergeRanges(ranges)) {
    output += input.slice(cursor, start)
    output += " ".repeat(end - start)
    cursor = end
  }

  return output + input.slice(cursor)
}

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const sortedRanges = [...ranges].sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []

  for (const [start, end] of sortedRanges) {
    const previous = merged.at(-1)
    if (!previous || start > previous[1]) {
      merged.push([start, end])
      continue
    }

    previous[1] = Math.max(previous[1], end)
  }

  return merged
}

function dedupeNodeTypeLookups(lookups: NodeTypeLookup[]): NodeTypeLookup[] {
  const seen = new Set<string>()
  const deduped: NodeTypeLookup[] = []

  for (const lookup of lookups) {
    const key = nodeTypeLookupKey(lookup)
    if (seen.has(key)) continue

    seen.add(key)
    deduped.push(lookup)
  }

  return deduped
}

function nodeTypeLookupKey(lookup: NodeTypeLookup): string {
  if (typeof lookup === "string") {
    return `string:${lookup}`
  }

  return `object:${JSON.stringify(lookup)}`
}

function isNodeId(value: string): boolean {
  return /^(?:@n8n\/)?n8n-nodes-[a-z0-9_-]+(?:\.[a-z0-9_-]+)+$/i.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
