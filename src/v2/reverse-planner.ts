import type { N8nWorkflow, N8nWorkflowNode } from "../validator.js"
import type {
  V2CredentialRequirement,
  V2ExternalCall,
  V2PatternFamily,
  V2Plan,
  V2PlanBranch,
  V2PlanLoop,
  V2PlanOutput,
  V2PlanPattern,
  V2PlanStep,
  V2RiskLevel,
  V2Warning,
} from "./types.js"

export type V2ReverseUnmappedNode = {
  name: string
  type: string
  reason: "unsupported_node_type"
  nodeId?: string
}

export type ReversePlanFromWorkflowInput = {
  workflow: N8nWorkflow & { id: string }
  workflowId: string
  workflowName?: string
}

export type ReversePlanFromWorkflowResult = {
  plan: V2Plan
  mappedStepCount: number
  unmappedNodes: V2ReverseUnmappedNode[]
  warnings: V2Warning[]
}

type ReverseMappedNode = {
  node?: N8nWorkflowNode
  family: V2PatternFamily
  variant: string
  stepId: string
  patternId: string
  sourceIndex: number
  synthetic: boolean
}

const workflowStateEntity = "WorkflowState"

export function reversePlanFromWorkflow(input: ReversePlanFromWorkflowInput): ReversePlanFromWorkflowResult {
  const workflowName = input.workflowName ?? input.workflow.name
  const warnings: V2Warning[] = []
  const unmappedNodes: V2ReverseUnmappedNode[] = []
  const mappedNodes: ReverseMappedNode[] = []

  for (const [index, node] of input.workflow.nodes.entries()) {
    const classification = classifyNode(node)
    if (!classification) {
      const unmappedNode: V2ReverseUnmappedNode = {
        name: node.name,
        type: node.type,
        reason: "unsupported_node_type",
        nodeId: node.id,
      }
      unmappedNodes.push(unmappedNode)
      warnings.push({
        code: "V2_REVERSE_UNMAPPED_NODE",
        message: `Node "${node.name}" with type "${node.type}" was not mapped to a v2 pattern.`,
      })
      continue
    }

    mappedNodes.push({
      node,
      family: classification.family,
      variant: classification.variant,
      stepId: `step_reverse_${mappedNodes.length + 1}`,
      patternId: `pattern_reverse_${mappedNodes.length + 1}_${classification.family}`,
      sourceIndex: index,
      synthetic: false,
    })
  }

  const mappedStepCount = mappedNodes.length
  const planNodes = [...mappedNodes]

  if (planNodes.length === 0) {
    planNodes.push({
      family: "transform",
      variant: "manual_review",
      stepId: "step_reverse_1",
      patternId: "pattern_reverse_1_transform",
      sourceIndex: -1,
      synthetic: true,
    })
  }

  if (!planNodes.some((node) => node.family === "output")) {
    const nextIndex = planNodes.length + 1
    planNodes.push({
      family: "output",
      variant: "respond_to_webhook",
      stepId: `step_reverse_${nextIndex}`,
      patternId: `pattern_reverse_${nextIndex}_output`,
      sourceIndex: -1,
      synthetic: true,
    })
  }

  if (input.workflow.active) {
    warnings.push({
      code: "V2_REVERSE_ACTIVE_READ_ONLY",
      message: "Active workflows can be reverse planned only as read-only v2 plans.",
    })
  }

  const inputMode = inferInputMode(planNodes)
  const outputs = buildOutputs(planNodes)
  const externalCalls: V2ExternalCall[] = []
  const credentialRequirements: V2CredentialRequirement[] = []
  const patterns: V2PlanPattern[] = []
  const steps: V2PlanStep[] = []
  const branches: V2PlanBranch[] = []
  const loops: V2PlanLoop[] = []

  for (const [index, mapped] of planNodes.entries()) {
    const patternWarnings: V2Warning[] = []

    if (mapped.family === "external_call") {
      const externalWarning: V2Warning = {
        code: "V2_REVERSE_INFERRED_EXTERNAL_CONTRACT",
        message: `External response contract for "${displayName(mapped)}" was inferred and requires review.`,
        stepId: mapped.stepId,
        patternId: mapped.patternId,
      }
      const credentialWarning: V2Warning = {
        code: "V2_REVERSE_CREDENTIAL_SEMANTICS_UNKNOWN",
        message: `Credential semantics for "${displayName(mapped)}" require manual review.`,
        stepId: mapped.stepId,
        patternId: mapped.patternId,
      }
      warnings.push(externalWarning, credentialWarning)
      patternWarnings.push(externalWarning, credentialWarning)
      const credentialRequirementId = `credential_reverse_${index + 1}`

      externalCalls.push({
        id: `external_reverse_${index + 1}`,
        stepId: mapped.stepId,
        service: displayName(mapped),
        operation: "reverse_detected_call",
        credentialRequirementId,
        requestContract: { payload: "unknown" },
        responseContract: { response: "unknown" },
        responseContractSource: "inferred",
      })
      credentialRequirements.push({
        id: credentialRequirementId,
        service: displayName(mapped),
        credentialType: credentialTypeForNode(mapped.node),
        authMode: authModeForCredentialType(credentialTypeForNode(mapped.node)),
        status: "unknown",
        affectedStepIds: [mapped.stepId],
        blocksApply: true,
      })
    }

    if (mapped.family === "branch") {
      const targetStepId = planNodes[index + 1]?.stepId ?? mapped.stepId
      branches.push(
        {
          id: `branch_${mapped.stepId}_matched`,
          sourceStepId: mapped.stepId,
          condition: "Reverse-detected primary branch from n8n output 0.",
          targetStepId,
        },
        {
          id: `branch_${mapped.stepId}_default`,
          sourceStepId: mapped.stepId,
          condition: "Default branch for all unmatched cases.",
          targetStepId,
          isDefault: true,
        },
      )
    }

    if (mapped.family === "loop_batch") {
      loops.push({
        id: `loop_${mapped.stepId}`,
        sourceStepId: mapped.stepId,
        mode: "batch",
        maxIterations: 100,
        termination: "Stop after all incoming items are processed or the configured cap is reached.",
      })
    }

    patterns.push({
      id: mapped.patternId,
      family: mapped.family,
      variant: mapped.variant,
      summary: patternSummary(mapped),
      confidence: mapped.family === "external_call" || mapped.synthetic ? "low" : "medium",
      riskLevel: riskLevelForMappedNode(mapped),
      warnings: patternWarnings,
    })
    steps.push({
      id: mapped.stepId,
      name: stepName(mapped),
      summary: stepSummary(mapped),
      patternIds: [mapped.patternId],
      inputRefs: mapped.family === "trigger" ? [`input_reverse_${inputMode}`] : [workflowStateEntity],
      outputRefs: mapped.family === "output" ? [outputIdForMappedNode(mapped)] : [workflowStateEntity],
    })
  }

  const riskLevel = riskLevelForPlan({
    active: input.workflow.active,
    unmappedCount: unmappedNodes.length,
    externalCallCount: externalCalls.length,
  })
  const confidence = warnings.length > 0 ? "low" : "medium"
  const planWarnings = [...warnings]
  const trace = [
    `Reverse planned from claimed workflow ${input.workflowId}.`,
    `Mapped ${mappedStepCount} of ${input.workflow.nodes.length} node(s) by node family.`,
    "Raw node parameters were not copied into this plan.",
  ]
  if (input.workflow.active) {
    trace.push("Workflow was active at reverse planning time; plan is read-only.")
  }

  const plan: V2Plan = {
    intent: {
      goal: `Reverse plan for existing n8n workflow "${workflowName}".`,
      scope: [
        "Map known n8n node families to v2 plan patterns.",
        "Preserve local reviewability for claimed workflows.",
      ],
      nonGoals: [
        "Lossless import of every n8n parameter.",
        "Credential creation or secret extraction.",
        "Structural apply to active workflows.",
      ],
    },
    inputs: [
      {
        id: `input_reverse_${inputMode}`,
        mode: inputMode,
        schema: { payload: "object" },
        samples: [{ payload: { sample: true } }],
      },
    ],
    entities: [
      {
        name: workflowStateEntity,
        fields: {
          payload: "object",
          status: "string",
        },
      },
    ],
    steps,
    patterns,
    branches,
    loops,
    externalCalls,
    errorPolicy: externalCalls.length > 0 ? { strategy: "retry_then_fail", maxAttempts: 3, notifications: [] } : { strategy: "fail_fast", notifications: [] },
    outputs,
    testContract: {
      examples: [
        {
          name: "reverse-planned sample",
          input: { payload: { sample: true } },
          expectedOutput: { accepted: true },
        },
      ],
      edgeCases: [],
    },
    credentialRequirements,
    confidence,
    riskLevel,
    warnings: planWarnings,
    trace,
  }

  return {
    plan,
    mappedStepCount,
    unmappedNodes,
    warnings: planWarnings,
  }
}

function classifyNode(node: N8nWorkflowNode): Pick<ReverseMappedNode, "family" | "variant"> | undefined {
  const type = node.type.toLowerCase()
  const suffix = type.split(".").at(-1) ?? type

  if (suffix === "manualtrigger") return { family: "trigger", variant: "manual" }
  if (suffix === "webhook") return { family: "trigger", variant: "webhook" }
  if (suffix === "scheduletrigger" || suffix === "cron" || suffix.endsWith("trigger")) {
    return { family: "trigger", variant: "schedule_or_event" }
  }
  if (suffix === "set" || suffix === "code" || suffix === "function" || suffix === "functionitem") {
    return { family: "transform", variant: suffix }
  }
  if (suffix === "if" || suffix === "switch") return { family: "branch", variant: suffix }
  if (suffix === "splitinbatches") return { family: "loop_batch", variant: "split_in_batches" }
  if (suffix === "httprequest") return { family: "external_call", variant: "http_request" }
  if (suffix === "respondtowebhook") return { family: "output", variant: "respond_to_webhook" }
  if (isNotificationOutputSuffix(suffix)) return { family: "output", variant: "send_notification" }
  if (isWriteServiceSuffix(suffix)) return { family: "output", variant: "write_service" }

  return undefined
}

function inferInputMode(nodes: ReverseMappedNode[]): V2Plan["inputs"][number]["mode"] {
  const trigger = nodes.find((node) => node.family === "trigger")
  if (trigger?.variant === "webhook") return "webhook"
  if (trigger?.variant === "schedule_or_event") return "schedule"
  if (trigger?.variant === "manual") return "manual"
  return "manual"
}

function buildOutputs(nodes: ReverseMappedNode[]): V2PlanOutput[] {
  const outputs: V2PlanOutput[] = []
  const seen = new Set<string>()

  for (const node of nodes.filter((candidate) => candidate.family === "output")) {
    const output: V2PlanOutput =
      node.variant === "write_service"
        ? {
            id: "output_write_service",
            mode: "write_service",
            contract: { writeStatus: "string" },
          }
        : node.variant === "send_notification"
          ? {
              id: "output_notification",
              mode: "send_notification",
              contract: { message: "string" },
            }
          : {
              id: "output_response",
              mode: "respond_to_webhook",
              contract: { accepted: "boolean" },
            }

    if (!seen.has(output.id)) {
      outputs.push(output)
      seen.add(output.id)
    }
  }

  if (outputs.length === 0) {
    outputs.push({
      id: "output_response",
      mode: "respond_to_webhook",
      contract: { accepted: "boolean" },
    })
  }

  return outputs
}

function outputIdForMappedNode(node: ReverseMappedNode): string {
  if (node.variant === "write_service") return "output_write_service"
  if (node.variant === "send_notification") return "output_notification"
  return "output_response"
}

function patternSummary(node: ReverseMappedNode): string {
  if (node.synthetic) return `Synthetic ${node.family} pattern added to keep the reverse plan reviewable.`
  return `Reverse mapped "${displayName(node)}" (${node.node?.type ?? "unknown"}) as ${node.family}.`
}

function stepName(node: ReverseMappedNode): string {
  if (node.synthetic && node.family === "output") return "Return reverse plan response"
  if (node.synthetic) return "Review unmapped workflow"
  return displayName(node)
}

function stepSummary(node: ReverseMappedNode): string {
  if (node.synthetic) return "Synthetic review step added because the original workflow did not expose this v2 pattern directly."
  return `Represents n8n node "${displayName(node)}" without copying raw parameter values.`
}

function displayName(node: ReverseMappedNode): string {
  return node.node?.name ?? stepName({ ...node, synthetic: true, node: undefined })
}

function riskLevelForMappedNode(node: ReverseMappedNode): V2RiskLevel {
  if (node.family === "external_call" || node.synthetic) return "medium"
  return "low"
}

function riskLevelForPlan(input: {
  active: boolean
  unmappedCount: number
  externalCallCount: number
}): V2RiskLevel {
  return input.active || input.unmappedCount > 0 || input.externalCallCount > 0 ? "medium" : "low"
}

function credentialTypeForNode(node: N8nWorkflowNode | undefined): string {
  return Object.keys(node?.credentials ?? {})[0] ?? "unknown"
}

function authModeForCredentialType(credentialType: string): V2CredentialRequirement["authMode"] {
  const normalized = credentialType.toLowerCase()
  if (normalized.includes("oauth")) return "oauth2"
  if (normalized.includes("basic")) return "basic"
  if (normalized.includes("header")) return "header_auth"
  if (normalized.includes("api")) return "api_key"
  return "manual"
}

function isNotificationOutputSuffix(suffix: string): boolean {
  return ["slack", "email", "emailsend", "gmail", "telegram", "discord", "mattermost"].includes(suffix)
}

function isWriteServiceSuffix(suffix: string): boolean {
  return ["googlesheets", "postgres", "mysql", "airtable", "notion", "mongodb"].includes(suffix)
}
