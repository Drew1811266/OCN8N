import { N8nBuilderError } from "../errors.js"
import { stableHash } from "../hash.js"
import type { WorkflowRegistryRecord } from "../registry.js"
import type { Warning } from "../types.js"
import {
  getWorkflowOwnershipState,
  validateWorkflowForSave,
  type N8nWorkflow,
  type WorkflowIssue,
} from "../validator.js"

const managedBy = "opencode-n8n-builder" as const

export type ClaimWorkflowArgs =
  | { workflowId: string; mode: "preview"; confirm?: never }
  | { workflowId: string; mode: "apply"; confirm?: boolean }

export type ClaimWorkflowAction = "claim" | "repair_registry" | "already_managed" | "blocked"

export type ClaimWorkflowRiskCode =
  | "ACTIVE_WORKFLOW"
  | "INCOMPATIBLE_OWNER"
  | "REGISTRY_BASE_URL_MISMATCH"
  | "PLAINTEXT_SECRET"
  | "INVALID_STRUCTURE"
  | "PRIVATE_NETWORK_HTTP_TARGET"

export type ClaimWorkflowRisk = {
  code: ClaimWorkflowRiskCode
  message: string
  nodeName?: string
}

export type ClaimedWorkflowSummary = {
  nodeCount: number
  connectionCount: number
  triggerNodeTypes: string[]
  credentialTypes: string[]
}

export type ClaimWorkflowResult = {
  workflowId: string
  name: string
  url: string
  mode: ClaimWorkflowArgs["mode"]
  eligible: boolean
  action: ClaimWorkflowAction
  summary: ClaimedWorkflowSummary
  risks: ClaimWorkflowRisk[]
  markerWritten: boolean
  registryWritten: boolean
}

export type ClaimWorkflowDeps = {
  args: ClaimWorkflowArgs
  config: {
    baseUrl: string
    pluginVersion: string
  }
  api: {
    getWorkflow(workflowId: string): Promise<N8nWorkflow & { id: string }>
    updateWorkflow?(workflowId: string, workflow: N8nWorkflow): Promise<N8nWorkflow & { id: string }>
  }
  registry: {
    get(workflowId: string): Promise<WorkflowRegistryRecord | undefined>
    upsert(record: WorkflowRegistryRecord): Promise<void>
  }
  now?: () => Date
}

type ClaimEvaluation = {
  workflow: N8nWorkflow & { id: string }
  url: string
  eligible: boolean
  action: ClaimWorkflowAction
  summary: ClaimedWorkflowSummary
  risks: ClaimWorkflowRisk[]
  existingRecord?: WorkflowRegistryRecord
}

export async function claimWorkflow(deps: ClaimWorkflowDeps): Promise<ClaimWorkflowResult> {
  if (deps.args.mode === "apply" && deps.args.confirm !== true) {
    throw new N8nBuilderError("Claim apply requires confirm: true.", "CLAIM_CONFIRMATION_REQUIRED", {
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
    })
  }

  if (!deps.api.updateWorkflow) {
    throw new N8nBuilderError("Claim apply dependencies are not configured.", "CLAIM_APPLY_DEPS_MISSING", {
      workflowId: deps.args.workflowId,
    })
  }

  let claimedWorkflow = evaluation.workflow
  let markerWritten = false

  if (evaluation.action === "claim") {
    claimedWorkflow = markWorkflowManaged({
      workflow: evaluation.workflow,
      pluginVersion: deps.config.pluginVersion,
      claimedAt: now.toISOString(),
    })
    claimedWorkflow = await deps.api.updateWorkflow(deps.args.workflowId, claimedWorkflow)
    markerWritten = true
  }

  await deps.registry.upsert({
    workflowId: deps.args.workflowId,
    name: claimedWorkflow.name,
    url: evaluation.url,
    baseUrl: deps.config.baseUrl,
    managedBy,
    managedByVersion: deps.config.pluginVersion,
    lastPlanHash: stableHash(claimedWorkflow),
    lastUpdatedAt: now.toISOString(),
  })

  return toResult({
    mode: deps.args.mode,
    evaluation: {
      ...evaluation,
      workflow: claimedWorkflow,
      summary: summarizeWorkflow(claimedWorkflow),
    },
    markerWritten,
    registryWritten: true,
  })
}

async function evaluateClaim(deps: ClaimWorkflowDeps): Promise<ClaimEvaluation> {
  const workflow = await deps.api.getWorkflow(deps.args.workflowId)
  const url = workflowUrl(deps.config.baseUrl, deps.args.workflowId)
  const existingRecord = await deps.registry.get(deps.args.workflowId)
  const ownership = getWorkflowOwnershipState(workflow)
  const validation = validateWorkflowForSave({
    workflow,
    requireManagedMarker: false,
    allowActiveUpdate: false,
  })
  const risks: ClaimWorkflowRisk[] = [
    ...validation.issues.map(issueToRisk),
    ...validation.warnings.map(warningToRisk),
  ]

  if (ownership === "managed_by_other") {
    risks.push({
      code: "INCOMPATIBLE_OWNER",
      message: "Workflow has an incompatible management marker.",
    })
  }

  if (existingRecord && existingRecord.baseUrl !== deps.config.baseUrl) {
    risks.push({
      code: "REGISTRY_BASE_URL_MISMATCH",
      message: "Local registry record belongs to a different n8n base URL.",
    })
  }

  const blockingRisks = risks.filter((risk) => risk.code !== "PRIVATE_NETWORK_HTTP_TARGET")
  const action = claimAction({
    hasBlockingRisks: blockingRisks.length > 0,
    ownership,
    existingRecord,
    baseUrl: deps.config.baseUrl,
  })

  return {
    workflow,
    url,
    eligible: action !== "blocked" && action !== "already_managed",
    action,
    summary: summarizeWorkflow(workflow),
    risks,
    existingRecord,
  }
}

function claimAction(input: {
  hasBlockingRisks: boolean
  ownership: ReturnType<typeof getWorkflowOwnershipState>
  existingRecord?: WorkflowRegistryRecord
  baseUrl: string
}): ClaimWorkflowAction {
  if (input.hasBlockingRisks) return "blocked"

  if (input.existingRecord?.baseUrl === input.baseUrl) {
    return "already_managed"
  }

  if (input.ownership === "managed_by_opencode") {
    return "repair_registry"
  }

  if (input.ownership === "unmanaged") {
    return "claim"
  }

  return "blocked"
}

function issueToRisk(issue: WorkflowIssue): ClaimWorkflowRisk {
  switch (issue.code) {
    case "ACTIVE_WORKFLOW_BLOCKED":
      return {
        code: "ACTIVE_WORKFLOW",
        message: "Active workflows cannot be claimed by v0.6.",
      }
    case "PLAINTEXT_SECRET":
      return {
        code: "PLAINTEXT_SECRET",
        message: "Workflow contains a secret-looking parameter value.",
      }
    case "DUPLICATE_NODE_NAME":
    case "MISSING_CONNECTION_SOURCE":
    case "MISSING_CONNECTION_TARGET":
    case "UNMANAGED_WORKFLOW":
      return {
        code: "INVALID_STRUCTURE",
        message: "Workflow structure is not safe to claim.",
      }
    case "PRIVATE_NETWORK_HTTP_TARGET":
      return {
        code: "PRIVATE_NETWORK_HTTP_TARGET",
        message: "Workflow contains a private network URL target.",
      }
  }
}

function warningToRisk(warning: Warning): ClaimWorkflowRisk {
  return {
    code: "PRIVATE_NETWORK_HTTP_TARGET",
    message: "Workflow contains a private network URL target.",
    nodeName: warning.nodeName,
  }
}

function summarizeWorkflow(workflow: N8nWorkflow): ClaimedWorkflowSummary {
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
  mode: ClaimWorkflowArgs["mode"]
  evaluation: ClaimEvaluation
  markerWritten: boolean
  registryWritten: boolean
}): ClaimWorkflowResult {
  return {
    workflowId: input.evaluation.workflow.id,
    name: safeWorkflowName(input.evaluation),
    url: input.evaluation.url,
    mode: input.mode,
    eligible: input.evaluation.eligible,
    action: input.evaluation.action,
    summary: input.evaluation.summary,
    risks: input.evaluation.risks,
    markerWritten: input.markerWritten,
    registryWritten: input.registryWritten,
  }
}

function safeWorkflowName(evaluation: ClaimEvaluation): string {
  return evaluation.eligible ? evaluation.workflow.name : ""
}

function workflowUrl(baseUrl: string, workflowId: string): string {
  const appBaseUrl = baseUrl.replace(/\/api\/v\d+\/?$/i, "").replace(/\/+$/, "")
  return `${appBaseUrl}/workflow/${encodeURIComponent(workflowId)}`
}
