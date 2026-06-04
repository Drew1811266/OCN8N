import { N8nBuilderError } from "../errors.js"
import { stableHash } from "../hash.js"
import type { NodeTypeLookup } from "../n8n-mcp-client.js"
import type { PatchPlannerContext } from "../opencode-planner.js"
import type { SaveUpdatePreviewInput, UpdatePreview } from "../preview-store.js"
import type { WorkflowRegistryRecord } from "../registry.js"
import type { CredentialGap, PluginConfig, Warning } from "../types.js"
import { validateWorkflowForSave, type N8nWorkflow, type WorkflowIssue } from "../validator.js"
import { compileWorkflowPlan } from "../workflow-compiler.js"
import type { WorkflowPatchPlan } from "../workflow-plan.js"

const managedBy = "opencode-n8n-builder" as const
const previewTtlMs = 30 * 60 * 1000

export type UpdateWorkflowArgs =
  | { workflowId: string; mode: "preview"; prompt: string; previewId?: never }
  | { workflowId: string; mode: "apply"; previewId: string; prompt?: never }

export type UpdateWorkflowResult = {
  workflowId: string
  name: string
  url: string
  mode: "preview" | "apply"
  previewId?: string
  summary: string
  changes: string[]
  missingCredentials: CredentialGap[]
  warnings: Warning[]
}

export type UpdateWorkflowDeps = {
  args: UpdateWorkflowArgs
  config: PluginConfig
  api: {
    getWorkflow(workflowId: string): Promise<N8nWorkflow & { id: string }>
    updateWorkflow?(workflowId: string, workflow: N8nWorkflow): Promise<N8nWorkflow & { id: string }>
  }
  planner?: {
    createPatchPlan(context: PatchPlannerContext): Promise<WorkflowPatchPlan>
  }
  mcp?: {
    getSdkReference(section: string): Promise<string>
    searchNodes(query: string): Promise<string>
    getNodeTypes(nodeTypes: NodeTypeLookup[]): Promise<string>
  }
  previewStore?: {
    save?(input: SaveUpdatePreviewInput): Promise<UpdatePreview>
    get?(previewId: string, now?: Date): Promise<UpdatePreview | undefined>
  }
  registry?: {
    upsert(record: WorkflowRegistryRecord): Promise<void>
  }
  now?: () => Date
}

type PreviewUpdateDeps = UpdateWorkflowDeps & {
  args: Extract<UpdateWorkflowArgs, { mode: "preview" }>
}

type ApplyUpdateDeps = UpdateWorkflowDeps & {
  args: Extract<UpdateWorkflowArgs, { mode: "apply" }>
}

export async function updateWorkflow(deps: UpdateWorkflowDeps): Promise<UpdateWorkflowResult> {
  if (deps.args.mode === "preview") {
    return previewUpdate(deps as PreviewUpdateDeps)
  }

  return applyUpdate(deps as ApplyUpdateDeps)
}

async function previewUpdate(deps: PreviewUpdateDeps): Promise<UpdateWorkflowResult> {
  const previewStore = deps.previewStore

  if (!deps.planner || !deps.mcp || !previewStore?.save) {
    throw new N8nBuilderError("Preview dependencies are not configured.", "UPDATE_PREVIEW_DEPS_MISSING")
  }

  const now = deps.now?.() ?? new Date()
  const currentWorkflow = await deps.api.getWorkflow(deps.args.workflowId)
  const currentValidation = validateWorkflowForSave({
    workflow: currentWorkflow,
    requireManagedMarker: true,
    allowActiveUpdate: false,
  })

  if (!currentValidation.valid) {
    throw new N8nBuilderError("Workflow cannot be previewed for update.", "WORKFLOW_UPDATE_BLOCKED", {
      issues: currentValidation.issues,
      warnings: currentValidation.warnings,
    })
  }

  const sdkReference = await deps.mcp.getSdkReference("all")
  const searchResult = await deps.mcp.searchNodes(deps.args.prompt)
  const nodeTypes = extractNodeTypes(searchResult)
  const nodeDocumentation =
    nodeTypes.length > 0
      ? [{ nodeType: "selected", documentation: await deps.mcp.getNodeTypes(nodeTypes) }]
      : []

  const patchPlan = await deps.planner.createPatchPlan({
    prompt: deps.args.prompt,
    currentWorkflowJson: JSON.stringify(currentWorkflow, null, 2),
    sdkReference,
    nodeDocumentation,
  })
  const proposedWorkflow = compileWorkflowPlan({
    plan: patchPlan.replacementPlan,
    marker: {
      managedBy,
      managedByVersion: deps.config.pluginVersion,
      createdAt: now.toISOString(),
    },
  })
  const proposedValidation = validateWorkflowForSave({
    workflow: proposedWorkflow,
    requireManagedMarker: true,
    allowActiveUpdate: false,
  })

  if (!proposedValidation.valid) {
    throw new N8nBuilderError("Proposed workflow failed validation.", "PROPOSED_WORKFLOW_INVALID", {
      issues: proposedValidation.issues,
      warnings: proposedValidation.warnings,
    })
  }

  const preview = await previewStore.save({
    workflowId: deps.args.workflowId,
    baseWorkflowHash: stableHash(currentWorkflow),
    proposedWorkflowHash: stableHash(proposedWorkflow),
    summary: patchPlan.summary,
    changes: patchPlan.changes,
    proposedWorkflow,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + previewTtlMs).toISOString(),
  })

  return {
    workflowId: deps.args.workflowId,
    name: proposedWorkflow.name,
    url: workflowUrl(deps.config.baseUrl, deps.args.workflowId),
    mode: "preview",
    previewId: preview.previewId,
    summary: patchPlan.summary,
    changes: patchPlan.changes,
    missingCredentials: [],
    warnings: proposedValidation.warnings.map(toWarning),
  }
}

async function applyUpdate(deps: ApplyUpdateDeps): Promise<UpdateWorkflowResult> {
  const previewStore = deps.previewStore

  if (!previewStore?.get || !deps.api.updateWorkflow || !deps.registry) {
    throw new N8nBuilderError("Apply dependencies are not configured.", "UPDATE_APPLY_DEPS_MISSING")
  }

  const now = deps.now?.() ?? new Date()
  const preview = await previewStore.get(deps.args.previewId, now)

  if (
    !preview ||
    preview.workflowId !== deps.args.workflowId ||
    isPreviewExpired(preview, now) ||
    stableHash(preview.proposedWorkflow) !== preview.proposedWorkflowHash
  ) {
    throw new N8nBuilderError("Update preview is missing, expired, invalid, or for a different workflow.", "UPDATE_PREVIEW_INVALID")
  }

  const currentWorkflow = await deps.api.getWorkflow(deps.args.workflowId)
  if (stableHash(currentWorkflow) !== preview.baseWorkflowHash) {
    throw new N8nBuilderError("Workflow changed after preview was created.", "UPDATE_PREVIEW_STALE")
  }

  const proposedValidation = validateWorkflowForSave({
    workflow: preview.proposedWorkflow,
    requireManagedMarker: true,
    allowActiveUpdate: false,
  })

  if (!proposedValidation.valid) {
    throw new N8nBuilderError("Preview workflow failed validation during apply.", "PROPOSED_WORKFLOW_INVALID", {
      issues: proposedValidation.issues,
      warnings: proposedValidation.warnings,
    })
  }

  const updatedWorkflow = await deps.api.updateWorkflow(deps.args.workflowId, preview.proposedWorkflow)
  const url = workflowUrl(deps.config.baseUrl, deps.args.workflowId)

  await deps.registry.upsert({
    workflowId: deps.args.workflowId,
    name: updatedWorkflow.name,
    url,
    baseUrl: deps.config.baseUrl,
    managedBy,
    managedByVersion: deps.config.pluginVersion,
    lastPlanHash: preview.proposedWorkflowHash,
    lastUpdatedAt: now.toISOString(),
  })

  return {
    workflowId: deps.args.workflowId,
    name: updatedWorkflow.name,
    url,
    mode: "apply",
    summary: preview.summary,
    changes: preview.changes,
    missingCredentials: [],
    warnings: proposedValidation.warnings.map(toWarning),
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

function isPreviewExpired(preview: UpdatePreview, now: Date): boolean {
  const expiresAt = Date.parse(preview.expiresAt)
  return Number.isNaN(expiresAt) || expiresAt <= now.getTime()
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
