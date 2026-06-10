import type { ApiPluginConfig } from "../config.js"
import { N8nBuilderError } from "../errors.js"
import { stableHash } from "../hash.js"
import { validateWorkflowWithMcp, type McpWorkflowValidationResult } from "../mcp-workflow-validation.js"
import {
  analyzeWorkflowNodeCompatibility,
  buildNodeCompatibilityGuidance,
} from "../node-compatibility.js"
import type { PatchPlannerContext } from "../opencode-planner.js"
import type { SaveUpdatePreviewInput, UpdatePreview } from "../preview-store.js"
import type { WorkflowRegistryRecord } from "../registry.js"
import type { CredentialGap, CredentialSetupAction, Warning } from "../types.js"
import { validateWorkflowForSave, type N8nWorkflow, type WorkflowIssue } from "../validator.js"
import { compileWorkflowPlan } from "../workflow-compiler.js"
import type { WorkflowPatchDraft, WorkflowPatchPlan } from "../workflow-plan.js"
import { extractNodeTypeLookups, type NodeTypeLookup } from "./node-lookup.js"

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
  credentialActions: CredentialSetupAction[]
  warnings: Warning[]
}

export type UpdateWorkflowDeps = {
  args: UpdateWorkflowArgs
  config: ApiPluginConfig
  api: {
    getWorkflow(workflowId: string): Promise<N8nWorkflow & { id: string }>
    updateWorkflow?(workflowId: string, workflow: N8nWorkflow): Promise<N8nWorkflow & { id: string }>
  }
  planner?: {
    createPatchDraft?(context: PatchPlannerContext): Promise<WorkflowPatchDraft>
    createPatchPlan?(context: PatchPlannerContext): Promise<WorkflowPatchPlan>
  }
  mcp?: {
    getSdkReference(section: string): Promise<string>
    searchNodes(query: string): Promise<string>
    getNodeTypes(nodeTypes: NodeTypeLookup[]): Promise<string>
    getSuggestedNodes?(categories: string[]): Promise<string>
    validateWorkflowCode?(code: string): Promise<McpWorkflowValidationResult>
  }
  previewStore?: {
    save?(input: SaveUpdatePreviewInput): Promise<UpdatePreview>
    get?(previewId: string, now?: Date): Promise<UpdatePreview | undefined>
  }
  registry?: {
    get(workflowId: string): Promise<WorkflowRegistryRecord | undefined>
    upsert(record: WorkflowRegistryRecord): Promise<void>
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
    action?: CredentialSetupAction
  }>
}

type WorkflowCredentialResolution = {
  missingCredentials: CredentialGap[]
  credentialActions: CredentialSetupAction[]
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
  const registry = deps.registry

  if (!deps.planner || !deps.mcp || !previewStore?.save || !registry?.get) {
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

  await requireRegistryOwnership(registry, deps.args.workflowId, deps.config.baseUrl)

  const sdkReference = await deps.mcp.getSdkReference("all")
  const searchResult = await deps.mcp.searchNodes(deps.args.prompt)
  const nodeTypes = extractNodeTypeLookups(searchResult)
  const nodeDocumentation =
    nodeTypes.length > 0
      ? [{ nodeType: "selected", documentation: await deps.mcp.getNodeTypes(nodeTypes) }]
      : []
  const suggestedNodes = await getSuggestedNodesForPrompt(deps.mcp, deps.args.prompt)

  const plannerContext = withSuggestedNodes(
    {
      prompt: deps.args.prompt,
      currentWorkflowJson: JSON.stringify(currentWorkflow, null, 2),
      sdkReference,
      nodeDocumentation,
      compatibilityGuidance: compatibilityGuidanceForLookups(nodeTypes),
    },
    suggestedNodes,
  )
  const patchDraft = await createWorkflowPatchDraft(deps.planner, plannerContext)
  const compiledWorkflow = compileWorkflowPlan({
    plan: patchDraft.replacementPlan,
    marker: {
      managedBy,
      managedByVersion: deps.config.pluginVersion,
      createdAt: now.toISOString(),
    },
  })
  const proposedWorkflow = mergeWorkflowLevelFields({
    currentWorkflow,
    compiledWorkflow,
    managedByVersion: deps.config.pluginVersion,
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

  const credentialResolution = await resolveWorkflowCredentials(proposedWorkflow, deps.credentialResolver)
  const compatibilityWarnings = analyzeWorkflowNodeCompatibility(proposedWorkflow)
  const validateWorkflowCode = deps.mcp.validateWorkflowCode?.bind(deps.mcp)
  const mcpWarnings = validateWorkflowCode
    ? await validateWorkflowWithMcp({ mcp: { validateWorkflowCode }, workflow: proposedWorkflow })
    : []
  const preview = await previewStore.save({
    workflowId: deps.args.workflowId,
    baseWorkflowHash: stableHash(currentWorkflow),
    proposedWorkflowHash: stableHash(proposedWorkflow),
    summary: patchDraft.summary,
    changes: patchDraft.changes,
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
    summary: patchDraft.summary,
    changes: patchDraft.changes,
    missingCredentials: credentialResolution.missingCredentials,
    credentialActions: credentialResolution.credentialActions,
    warnings: [...proposedValidation.warnings.map(toWarning), ...compatibilityWarnings, ...mcpWarnings],
  }
}

async function createWorkflowPatchDraft(
  planner: NonNullable<UpdateWorkflowDeps["planner"]>,
  context: PatchPlannerContext,
): Promise<WorkflowPatchDraft> {
  if (planner.createPatchDraft) {
    return planner.createPatchDraft(context)
  }

  if (planner.createPatchPlan) {
    const patchPlan = await planner.createPatchPlan(context)
    return {
      ...patchPlan,
      sdkCode: "",
      nodeSelection: [],
    }
  }

  throw new N8nBuilderError("Preview planner dependencies are not configured.", "UPDATE_PREVIEW_DEPS_MISSING")
}

async function applyUpdate(deps: ApplyUpdateDeps): Promise<UpdateWorkflowResult> {
  const previewStore = deps.previewStore
  const registry = deps.registry

  if (!previewStore?.get || !deps.api.updateWorkflow || !registry?.get || !registry.upsert) {
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

  const currentValidation = validateWorkflowForSave({
    workflow: currentWorkflow,
    requireManagedMarker: true,
    allowActiveUpdate: false,
  })

  if (!currentValidation.valid) {
    throw new N8nBuilderError(
      "Workflow cannot be applied because the current workflow is not updateable.",
      "WORKFLOW_UPDATE_BLOCKED",
      redactedValidationDetails(currentValidation),
    )
  }

  await requireRegistryOwnership(registry, deps.args.workflowId, deps.config.baseUrl)

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

  await registry.upsert({
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
    credentialActions: [],
    warnings: proposedValidation.warnings.map(toWarning),
  }
}

async function requireRegistryOwnership(
  registry: { get(workflowId: string): Promise<WorkflowRegistryRecord | undefined> },
  workflowId: string,
  baseUrl: string,
): Promise<void> {
  const record = await registry.get(workflowId)

  if (!record) {
    throw new N8nBuilderError(
      "Workflow cannot be updated because it is not recorded in the local registry.",
      "WORKFLOW_UPDATE_BLOCKED",
      {
        workflowId,
        issues: [
          {
            code: "WORKFLOW_NOT_IN_REGISTRY",
            message: "Workflow is not recorded in the local OpenCode workflow registry.",
          },
        ],
        warnings: [],
      },
    )
  }

  if (record.baseUrl === baseUrl) return

  throw new N8nBuilderError(
    "Workflow cannot be updated because its local registry record belongs to a different n8n base URL.",
    "WORKFLOW_UPDATE_BLOCKED",
    {
      workflowId,
      issues: [
        {
          code: "WORKFLOW_REGISTRY_BASE_URL_MISMATCH",
          message: "Workflow registry ownership does not match the configured n8n base URL.",
        },
      ],
      warnings: [],
    },
  )
}

function workflowUrl(baseUrl: string, workflowId: string): string {
  const appBaseUrl = baseUrl.replace(/\/api\/v\d+\/?$/i, "").replace(/\/+$/, "")
  return `${appBaseUrl}/workflow/${encodeURIComponent(workflowId)}`
}

async function resolveWorkflowCredentials(
  workflow: N8nWorkflow,
  credentialResolver: WorkflowCredentialResolver | undefined,
): Promise<WorkflowCredentialResolution> {
  if (!credentialResolver) return { missingCredentials: [], credentialActions: [] }

  const missingCredentials: CredentialGap[] = []
  const credentialActions: CredentialSetupAction[] = []

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

      if (result.action) {
        credentialActions.push(result.action)
      }
    }
  }

  return { missingCredentials, credentialActions }
}

function toWarning(issue: WorkflowIssue): Warning {
  return {
    code: issue.code,
    message: issue.message,
    nodeName: issue.nodeName,
  }
}

async function getSuggestedNodesForPrompt(
  mcp: NonNullable<UpdateWorkflowDeps["mcp"]>,
  prompt: string,
): Promise<string | undefined> {
  const categories = suggestedNodeCategories(prompt)
  if (!mcp.getSuggestedNodes || categories.length === 0) return undefined

  const suggestedNodes = await mcp.getSuggestedNodes(categories)
  const trimmed = suggestedNodes?.trim()
  return trimmed ? trimmed : undefined
}

function withSuggestedNodes(context: PatchPlannerContext, suggestedNodes: string | undefined): PatchPlannerContext {
  return suggestedNodes ? { ...context, suggestedNodes } : context
}

function compatibilityGuidanceForLookups(nodeTypes: NodeTypeLookup[]): string {
  return buildNodeCompatibilityGuidance(nodeTypes.map(nodeTypeLookupToNodeType))
}

function nodeTypeLookupToNodeType(lookup: NodeTypeLookup): string {
  return typeof lookup === "string" ? lookup : lookup.nodeId
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

function isPreviewExpired(preview: UpdatePreview, now: Date): boolean {
  const expiresAt = Date.parse(preview.expiresAt)
  return Number.isNaN(expiresAt) || expiresAt <= now.getTime()
}

function mergeWorkflowLevelFields(input: {
  currentWorkflow: N8nWorkflow
  compiledWorkflow: N8nWorkflow
  managedByVersion: string
}): N8nWorkflow {
  return {
    ...input.compiledWorkflow,
    active: false,
    settings: mergeSettings(input.currentWorkflow.settings, input.compiledWorkflow.settings),
    tags: mergeTags(input.currentWorkflow.tags, input.compiledWorkflow.tags),
    meta: mergeMeta({
      currentMeta: input.currentWorkflow.meta,
      compiledMeta: input.compiledWorkflow.meta,
      managedByVersion: input.managedByVersion,
    }),
  }
}

function mergeSettings(
  currentSettings: N8nWorkflow["settings"],
  compiledSettings: N8nWorkflow["settings"],
): N8nWorkflow["settings"] {
  const selectedSettings = Object.keys(compiledSettings).length > 0 ? compiledSettings : currentSettings
  return { ...selectedSettings }
}

function mergeTags(
  currentTags: N8nWorkflow["tags"] = [],
  compiledTags: N8nWorkflow["tags"] = [],
): N8nWorkflow["tags"] {
  const seen = new Set<string>()
  const tags: NonNullable<N8nWorkflow["tags"]> = []

  for (const tag of [...currentTags, ...compiledTags]) {
    const name = tagName(tag)
    if (seen.has(name)) continue

    seen.add(name)
    tags.push(cloneTag(tag))
  }

  if (!seen.has(managedBy)) {
    tags.push({ name: managedBy })
  }

  return tags
}

function mergeMeta(input: {
  currentMeta?: Record<string, unknown>
  compiledMeta?: Record<string, unknown>
  managedByVersion: string
}): Record<string, unknown> {
  return {
    ...(input.compiledMeta ?? {}),
    ...(input.currentMeta ?? {}),
    managedBy,
    managedByVersion: input.managedByVersion,
  }
}

function tagName(tag: NonNullable<N8nWorkflow["tags"]>[number]): string {
  return typeof tag === "string" ? tag : tag.name
}

function cloneTag(tag: NonNullable<N8nWorkflow["tags"]>[number]): NonNullable<N8nWorkflow["tags"]>[number] {
  return typeof tag === "string" ? tag : { ...tag }
}

function redactedValidationDetails(validation: {
  issues: WorkflowIssue[]
  warnings: WorkflowIssue[]
}): { issues: WorkflowIssue[]; warnings: WorkflowIssue[] } {
  return {
    issues: validation.issues.map(redactWorkflowIssue),
    warnings: validation.warnings.map(redactWorkflowIssue),
  }
}

function redactWorkflowIssue(issue: WorkflowIssue): WorkflowIssue {
  const redactedIssue: WorkflowIssue = {
    code: issue.code,
    message: redactIssueText(issue.message),
  }

  if (issue.nodeName !== undefined) {
    redactedIssue.nodeName = redactIssueText(issue.nodeName)
  }

  return redactedIssue
}

function redactIssueText(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/((?:token|password|secret|api[_-]?key|authorization)\s*[:=]\s*)\S+/gi, "$1[REDACTED]")
}
