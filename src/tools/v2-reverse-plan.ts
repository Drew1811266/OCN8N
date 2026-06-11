import type { ApiPluginConfig } from "../config.js"
import { N8nBuilderError } from "../errors.js"
import { stableHash } from "../hash.js"
import type { N8nWorkflow } from "../validator.js"
import type { V2PlanStore } from "../v2/plan-store.js"
import { reversePlanFromWorkflow, type V2ReverseUnmappedNode } from "../v2/reverse-planner.js"
import type { V2WorkflowRegistry } from "../v2/registry.js"
import type { V2Confidence, V2RegistryRecord, V2RiskLevel, V2Warning } from "../v2/types.js"

export type V2ReversePlanArgs = {
  workflowId: string
}

export type V2ReversePlanResult = {
  workflowId: string
  name: string
  url: string
  planId: string
  planVersion: number
  source: "reverse"
  confidence: V2Confidence
  riskLevel: V2RiskLevel
  mappedStepCount: number
  unmappedNodes: V2ReverseUnmappedNode[]
  warnings: V2Warning[]
  workflowHash: string
}

export async function reverseV2WorkflowPlan(input: {
  args: V2ReversePlanArgs
  config: Pick<ApiPluginConfig, "baseUrl" | "pluginVersion">
  api: {
    getWorkflow(workflowId: string): Promise<N8nWorkflow & { id: string }>
  }
  registry: V2WorkflowRegistry
  planStore: V2PlanStore
  now?: () => Date
}): Promise<V2ReversePlanResult> {
  const record = await input.registry.get(input.args.workflowId)

  if (!record) {
    throw new N8nBuilderError("V2 workflow must be claimed before reverse planning.", "V2_WORKFLOW_NOT_CLAIMED", {
      workflowId: input.args.workflowId,
    })
  }

  if (record.baseUrl !== input.config.baseUrl) {
    throw new N8nBuilderError("V2 registry record belongs to a different n8n base URL.", "V2_REGISTRY_BASE_URL_MISMATCH", {
      workflowId: input.args.workflowId,
      expectedBaseUrl: input.config.baseUrl,
      actualBaseUrl: record.baseUrl,
    })
  }

  const workflow = await input.api.getWorkflow(input.args.workflowId)
  const now = input.now?.() ?? new Date()
  const reverse = reversePlanFromWorkflow({
    workflow,
    workflowId: input.args.workflowId,
    workflowName: workflow.name,
  })
  const version = await input.planStore.saveReverse({
    plan: reverse.plan,
    createdAt: now.toISOString(),
    summary: `Reverse planned workflow ${workflow.name}.`,
  })
  const workflowHash = stableHash(workflow)
  const workflowId = input.args.workflowId
  const url = workflowUrl(input.config.baseUrl, workflowId)

  await input.registry.upsert({
    ...record,
    workflowId,
    name: workflow.name,
    url,
    baseUrl: input.config.baseUrl,
    managedByVersion: input.config.pluginVersion,
    latestPlanId: version.planId,
    latestPlanVersion: version.planVersion,
    latestWorkflowHash: workflowHash,
    lastUpdatedAt: now.toISOString(),
  } satisfies V2RegistryRecord)

  return {
    workflowId,
    name: workflow.name,
    url,
    planId: version.planId,
    planVersion: version.planVersion,
    source: "reverse",
    confidence: version.plan.confidence,
    riskLevel: version.plan.riskLevel,
    mappedStepCount: reverse.mappedStepCount,
    unmappedNodes: reverse.unmappedNodes,
    warnings: reverse.warnings,
    workflowHash,
  }
}

function workflowUrl(baseUrl: string, workflowId: string): string {
  const appBaseUrl = baseUrl.replace(/\/api\/v\d+\/?$/i, "").replace(/\/+$/, "")
  return `${appBaseUrl}/workflow/${encodeURIComponent(workflowId)}`
}
