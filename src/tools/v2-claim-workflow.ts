import type { ApiPluginConfig } from "../config.js"
import { N8nBuilderError } from "../errors.js"
import { stableHash } from "../hash.js"
import { validateWorkflowForSave, type N8nWorkflow, type WorkflowIssue } from "../validator.js"
import type { V2WorkflowRegistry } from "../v2/registry.js"
import type { V2RegistryRecord } from "../v2/types.js"

const managedBy = "opencode-n8n-builder-v2" as const
const v1ManagedBy = "opencode-n8n-builder" as const

export type V2ClaimWorkflowArgs =
  | { workflowId: string; mode: "preview"; confirm?: never }
  | { workflowId: string; mode: "apply"; confirm?: boolean }

export type V2ClaimWorkflowAction = "claim_full" | "claim_read_only" | "repair_registry" | "already_claimed" | "blocked"

export type V2ClaimWorkflowRiskCode =
  | "ACTIVE_READ_ONLY"
  | "INCOMPATIBLE_OWNER"
  | "REGISTRY_BASE_URL_MISMATCH"
  | "PLAINTEXT_SECRET"
  | "INVALID_STRUCTURE"
  | "PRIVATE_NETWORK_HTTP_TARGET"
  | "V1_OWNERSHIP_RESET"

export type V2ClaimWorkflowRisk = {
  code: V2ClaimWorkflowRiskCode
  message: string
  nodeName?: string
}

export type V2ClaimedWorkflowSummary = {
  nodeCount: number
  connectionCount: number
  triggerNodeTypes: string[]
  credentialTypes: string[]
}

export type V2ClaimWorkflowResult = {
  workflowId: string
  name: string
  url: string
  mode: V2ClaimWorkflowArgs["mode"]
  eligible: boolean
  action: V2ClaimWorkflowAction
  claimMode?: V2RegistryRecord["claimMode"]
  active: boolean
  summary: V2ClaimedWorkflowSummary
  risks: V2ClaimWorkflowRisk[]
  markerWritten: boolean
  registryWritten: boolean
  workflowHash: string
}

export type V2ClaimWorkflowDeps = {
  args: V2ClaimWorkflowArgs
  config: Pick<ApiPluginConfig, "baseUrl" | "pluginVersion">
  api: {
    getWorkflow(workflowId: string): Promise<N8nWorkflow & { id: string }>
    updateWorkflow?(workflowId: string, workflow: N8nWorkflow): Promise<N8nWorkflow & { id: string }>
  }
  registry: V2WorkflowRegistry
  now?: () => Date
}

type V2Ownership = "managed_by_v2" | "managed_by_v1" | "managed_by_other" | "unmanaged"

type V2ClaimEvaluation = {
  workflow: N8nWorkflow & { id: string }
  url: string
  eligible: boolean
  action: V2ClaimWorkflowAction
  claimMode?: V2RegistryRecord["claimMode"]
  summary: V2ClaimedWorkflowSummary
  risks: V2ClaimWorkflowRisk[]
  existingRecord?: V2RegistryRecord
}

export async function claimV2Workflow(deps: V2ClaimWorkflowDeps): Promise<V2ClaimWorkflowResult> {
  if (deps.args.mode === "apply" && deps.args.confirm !== true) {
    throw new N8nBuilderError("V2 claim apply requires confirm: true.", "V2_CLAIM_CONFIRM_REQUIRED", {
      workflowId: deps.args.workflowId,
    })
  }

  const now = deps.now?.() ?? new Date()
  const evaluation = await evaluateClaim(deps)

  if (deps.args.mode === "preview" || !evaluation.eligible) {
    return toResult({
      mode: deps.args.mode,
      evaluation,
      markerWritten: false,
      registryWritten: false,
      workflowHash: stableHash(evaluation.workflow),
    })
  }

  let claimedWorkflow = evaluation.workflow
  let markerWritten = false

  if (evaluation.action === "claim_full") {
    if (!deps.api.updateWorkflow) {
      throw new N8nBuilderError("V2 claim apply dependencies are not configured.", "V2_CLAIM_APPLY_DEPS_MISSING", {
        workflowId: deps.args.workflowId,
      })
    }

    claimedWorkflow = markWorkflowManaged({
      workflow: evaluation.workflow,
      pluginVersion: deps.config.pluginVersion,
      claimedAt: now.toISOString(),
    })
    claimedWorkflow = await deps.api.updateWorkflow(deps.args.workflowId, claimedWorkflow)
    markerWritten = true
  }

  const workflowHash = stableHash(claimedWorkflow)

  await deps.registry.upsert({
    workflowId: deps.args.workflowId,
    name: claimedWorkflow.name,
    url: evaluation.url,
    baseUrl: deps.config.baseUrl,
    claimMode: evaluation.claimMode ?? "full",
    activeAtClaim: evaluation.workflow.active,
    managedBy,
    managedByVersion: deps.config.pluginVersion,
    latestWorkflowHash: workflowHash,
    lastUpdatedAt: now.toISOString(),
  } satisfies V2RegistryRecord)

  return toResult({
    mode: deps.args.mode,
    evaluation: {
      ...evaluation,
      workflow: claimedWorkflow,
      summary: summarizeWorkflow(claimedWorkflow),
    },
    markerWritten,
    registryWritten: true,
    workflowHash,
  })
}

async function evaluateClaim(deps: V2ClaimWorkflowDeps): Promise<V2ClaimEvaluation> {
  const workflow = await deps.api.getWorkflow(deps.args.workflowId)
  const url = workflowUrl(deps.config.baseUrl, deps.args.workflowId)
  const existingRecord = await deps.registry.get(deps.args.workflowId)
  const ownership = getV2OwnershipState(workflow)
  const validation = validateWorkflowForSave({
    workflow,
    requireManagedMarker: false,
    allowActiveUpdate: true,
  })
  const risks: V2ClaimWorkflowRisk[] = [
    ...validation.issues.map(issueToRisk),
    ...validation.warnings.map(issueToRisk),
  ]

  if (workflow.active) {
    risks.push({
      code: "ACTIVE_READ_ONLY",
      message: "Active workflows can only be claimed read-only by v2.0.",
    })
  }

  if (ownership === "managed_by_other") {
    risks.push({
      code: "INCOMPATIBLE_OWNER",
      message: "Workflow has an incompatible management marker.",
    })
  }

  if (ownership === "managed_by_v1") {
    risks.push({
      code: "V1_OWNERSHIP_RESET",
      message: "Workflow has a v1 marker and must be explicitly claimed into the separate v2 registry.",
    })
  }

  if (existingRecord && existingRecord.baseUrl !== deps.config.baseUrl) {
    risks.push({
      code: "REGISTRY_BASE_URL_MISMATCH",
      message: "Local v2 registry record belongs to a different n8n base URL.",
    })
  }

  const blockingRisks = risks.filter(isBlockingRisk)
  const action = claimAction({
    hasBlockingRisks: blockingRisks.length > 0,
    ownership,
    existingRecord,
    baseUrl: deps.config.baseUrl,
    active: workflow.active,
  })
  const claimMode = claimModeForAction(action, workflow.active)

  return {
    workflow,
    url,
    eligible: action !== "blocked" && action !== "already_claimed",
    action,
    claimMode,
    summary: summarizeWorkflow(workflow),
    risks,
    existingRecord,
  }
}

function claimAction(input: {
  hasBlockingRisks: boolean
  ownership: V2Ownership
  existingRecord?: V2RegistryRecord
  baseUrl: string
  active: boolean
}): V2ClaimWorkflowAction {
  if (input.hasBlockingRisks) return "blocked"

  if (input.existingRecord?.baseUrl === input.baseUrl) {
    return "already_claimed"
  }

  if (input.active) {
    return "claim_read_only"
  }

  if (input.ownership === "managed_by_v2") {
    return "repair_registry"
  }

  return "claim_full"
}

function claimModeForAction(
  action: V2ClaimWorkflowAction,
  active: boolean,
): V2RegistryRecord["claimMode"] | undefined {
  if (action === "blocked" || action === "already_claimed") return undefined
  return action === "claim_read_only" || active ? "read_only" : "full"
}

function isBlockingRisk(risk: V2ClaimWorkflowRisk): boolean {
  return risk.code !== "ACTIVE_READ_ONLY" && risk.code !== "PRIVATE_NETWORK_HTTP_TARGET" && risk.code !== "V1_OWNERSHIP_RESET"
}

function getV2OwnershipState(workflow: N8nWorkflow): V2Ownership {
  if (workflow.meta?.managedBy === managedBy || hasTag(workflow, managedBy)) {
    return "managed_by_v2"
  }

  if (workflow.meta?.managedBy === v1ManagedBy || hasTag(workflow, v1ManagedBy)) {
    return "managed_by_v1"
  }

  if (typeof workflow.meta?.managedBy === "string" && workflow.meta.managedBy.trim()) {
    return "managed_by_other"
  }

  return "unmanaged"
}

function hasTag(workflow: N8nWorkflow, tagName: string): boolean {
  return (workflow.tags ?? []).some((tag) => {
    const name = typeof tag === "string" ? tag : tag.name
    return name === tagName
  })
}

function issueToRisk(issue: WorkflowIssue): V2ClaimWorkflowRisk {
  switch (issue.code) {
    case "PLAINTEXT_SECRET":
      return {
        code: "PLAINTEXT_SECRET",
        message: "Workflow contains a secret-looking parameter value.",
        nodeName: issue.nodeName,
      }
    case "PRIVATE_NETWORK_HTTP_TARGET":
      return {
        code: "PRIVATE_NETWORK_HTTP_TARGET",
        message: "Workflow contains a private network URL target.",
        nodeName: issue.nodeName,
      }
    case "DUPLICATE_NODE_NAME":
    case "MISSING_CONNECTION_SOURCE":
    case "MISSING_CONNECTION_TARGET":
    case "UNMANAGED_WORKFLOW":
    case "ACTIVE_WORKFLOW_BLOCKED":
      return {
        code: "INVALID_STRUCTURE",
        message: "Workflow structure is not safe to claim.",
        nodeName: issue.nodeName,
      }
  }
}

function summarizeWorkflow(workflow: N8nWorkflow): V2ClaimedWorkflowSummary {
  const credentialTypes = new Set<string>()
  const triggerNodeTypes = new Set<string>()

  for (const node of workflow.nodes) {
    for (const credentialType of Object.keys(node.credentials ?? {})) {
      credentialTypes.add(credentialType)
    }

    if (isTriggerNodeType(node.type)) {
      triggerNodeTypes.add(node.type)
    }
  }

  return {
    nodeCount: workflow.nodes.length,
    connectionCount: countConnections(workflow.connections),
    triggerNodeTypes: [...triggerNodeTypes].sort(),
    credentialTypes: [...credentialTypes].sort(),
  }
}

function isTriggerNodeType(nodeType: string): boolean {
  return /(?:^|\.)(manualTrigger|webhook|scheduleTrigger|cron|trigger)$/i.test(nodeType)
}

function countConnections(connections: N8nWorkflow["connections"]): number {
  let count = 0

  for (const byOutput of Object.values(connections ?? {})) {
    for (const outputGroups of Object.values(byOutput)) {
      for (const group of outputGroups) {
        count += group.length
      }
    }
  }

  return count
}

function markWorkflowManaged(input: {
  workflow: N8nWorkflow & { id: string }
  pluginVersion: string
  claimedAt: string
}): N8nWorkflow & { id: string } {
  return {
    ...input.workflow,
    active: false,
    meta: {
      ...(input.workflow.meta ?? {}),
      managedBy,
      managedByVersion: input.pluginVersion,
      claimedAt: input.claimedAt,
    },
    tags: ensureManagedTag(input.workflow.tags),
  }
}

function ensureManagedTag(tags: N8nWorkflow["tags"]): NonNullable<N8nWorkflow["tags"]> {
  const existing = tags ?? []
  const hasMarker = existing.some((tag) => {
    const name = typeof tag === "string" ? tag : tag.name
    return name === managedBy
  })

  return hasMarker ? existing : [...existing, { name: managedBy }]
}

function toResult(input: {
  mode: V2ClaimWorkflowArgs["mode"]
  evaluation: V2ClaimEvaluation
  markerWritten: boolean
  registryWritten: boolean
  workflowHash: string
}): V2ClaimWorkflowResult {
  return {
    workflowId: input.evaluation.workflow.id,
    name: input.evaluation.workflow.name,
    url: input.evaluation.url,
    mode: input.mode,
    eligible: input.evaluation.eligible,
    action: input.evaluation.action,
    claimMode: input.evaluation.claimMode,
    active: input.evaluation.workflow.active,
    summary: input.evaluation.summary,
    risks: input.evaluation.risks,
    markerWritten: input.markerWritten,
    registryWritten: input.registryWritten,
    workflowHash: input.workflowHash,
  }
}

function workflowUrl(baseUrl: string, workflowId: string): string {
  const appBaseUrl = baseUrl.replace(/\/api\/v\d+\/?$/i, "").replace(/\/+$/, "")
  return `${appBaseUrl}/workflow/${encodeURIComponent(workflowId)}`
}
