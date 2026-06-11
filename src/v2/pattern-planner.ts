import type { V2Plan, V2PlanInput, V2PlanPattern, V2Warning } from "./types.js"

export type CreatePatternFirstV2PlanInput = {
  prompt: string
  name?: string
}

type PromptSignals = {
  triggerMode: V2PlanInput["mode"]
  hasTransform: boolean
  hasFilter: boolean
  hasBranch: boolean
  hasLoop: boolean
  hasExternalCall: boolean
  hasErrorHandling: boolean
  hasNotification: boolean
  hasWriteOutput: boolean
  hasOrderEntity: boolean
}

export function createPatternFirstV2Plan(input: CreatePatternFirstV2PlanInput): V2Plan {
  const goal = input.prompt.trim()
  const signals = analyzePrompt(goal)
  const warnings: V2Warning[] = []
  const patterns: V2PlanPattern[] = [pattern("pattern_trigger", "trigger", signals.triggerMode, triggerSummary(signals))]
  const steps: V2Plan["steps"] = [
    {
      id: "step_trigger",
      name: "Receive input",
      summary: "Receive the incoming automation input.",
      patternIds: ["pattern_trigger"],
      inputRefs: [inputId(signals.triggerMode)],
      outputRefs: [entityName(signals)],
    },
  ]

  if (signals.hasTransform) {
    patterns.push(pattern("pattern_transform_mapping", "transform", "field_mapping", "Map input fields into the business entity."))
    if (signals.hasFilter) {
      patterns.push(pattern("pattern_transform_filter", "transform", "filtering", "Filter records that do not meet the business rule."))
    }
    steps.push({
      id: "step_transform",
      name: "Transform payload",
      summary: "Map and filter input fields before routing.",
      patternIds: signals.hasFilter ? ["pattern_transform_mapping", "pattern_transform_filter"] : ["pattern_transform_mapping"],
      inputRefs: [entityName(signals)],
      outputRefs: [entityName(signals)],
    })
  }

  if (signals.hasBranch) {
    patterns.push(pattern("pattern_branch_condition", "branch", "multi_condition", "Route records by known business status."))
    patterns.push(pattern("pattern_branch_default", "branch", "default_branch", "Fallback unmatched records to the default output path."))
    steps.push({
      id: "step_branch",
      name: "Route by status",
      summary: "Choose the processing path based on the record status.",
      patternIds: ["pattern_branch_condition", "pattern_branch_default"],
      inputRefs: [entityName(signals)],
      outputRefs: [entityName(signals)],
    })
  }

  if (signals.hasLoop) {
    patterns.push(pattern("pattern_loop_batch", "loop_batch", "batch", "Process records in bounded batches."))
    steps.push({
      id: "step_loop",
      name: "Process batch",
      summary: "Process items in bounded batches before service calls.",
      patternIds: ["pattern_loop_batch"],
      inputRefs: [entityName(signals)],
      outputRefs: [entityName(signals)],
    })
  }

  if (signals.hasExternalCall) {
    patterns.push(pattern("pattern_external_http", "external_call", "http_api_call", "Call an external service API."))
    patterns.push(pattern("pattern_external_auth", "external_call", "auth_requirement", "Use an explicit API key credential requirement."))
    patterns.push(
      pattern(
        "pattern_external_response",
        "external_call",
        "mock_response_schema",
        "Use an inferred response contract until the user supplies a concrete schema.",
        "medium",
      ),
    )
    steps.push({
      id: "step_external_call",
      name: "Call fulfillment API",
      summary: "Call the external fulfillment API and parse the response.",
      patternIds: ["pattern_external_http", "pattern_external_auth", "pattern_external_response"],
      inputRefs: [entityName(signals)],
      outputRefs: ["FulfillmentResult"],
    })
    warnings.push({
      code: "V2_RESPONSE_CONTRACT_INFERRED",
      message: "External API response contract was inferred from the prompt and should be verified before compile.",
      stepId: "step_external_call",
      patternId: "pattern_external_response",
    })
    warnings.push({
      code: "V2_CREDENTIAL_SETUP_REQUIRED",
      message: "External API credential requirement is identified, but no concrete credential mapping is configured.",
      stepId: "step_external_call",
      patternId: "pattern_external_auth",
    })
  }

  if (signals.hasErrorHandling) {
    patterns.push(pattern("pattern_error_retry", "error_handling", "retry", "Retry transient failures before failing."))
    if (signals.hasNotification) {
      patterns.push(
        pattern("pattern_error_notification", "error_handling", "failure_notification", "Notify Slack when processing fails."),
      )
    }
    steps.push({
      id: "step_error_handling",
      name: "Handle failures",
      summary: "Retry transient failures and notify on final failure.",
      patternIds: signals.hasNotification ? ["pattern_error_retry", "pattern_error_notification"] : ["pattern_error_retry"],
      inputRefs: [signals.hasExternalCall ? "FulfillmentResult" : entityName(signals)],
      outputRefs: [signals.hasNotification ? "output_notification" : "output_response"],
    })
  }

  patterns.push(pattern("pattern_output_response", "output", "respond_to_webhook", "Return a response to the caller."))
  if (signals.hasWriteOutput) {
    patterns.push(pattern("pattern_output_write", "output", "write_service", "Write the final result to a target service."))
  }
  if (signals.hasNotification) {
    patterns.push(pattern("pattern_output_notification", "output", "send_notification", "Send a Slack notification."))
  }
  steps.push({
    id: "step_output",
    name: "Return output",
    summary: "Return, write, or notify the final workflow result.",
    patternIds: outputPatternIds(signals),
    inputRefs: [signals.hasExternalCall ? "FulfillmentResult" : entityName(signals)],
    outputRefs: outputRefs(signals),
  })

  return {
    intent: {
      goal,
      scope: [input.name ?? "Generated workflow preview"],
      nonGoals: ["active workflow structural editing", "real external API execution during planning"],
    },
    inputs: [inputContract(signals)],
    entities: entityContracts(signals),
    steps,
    patterns,
    branches: signals.hasBranch
      ? [
          {
            id: "branch_process",
            sourceStepId: "step_branch",
            condition: "status is valid or ready",
            targetStepId: signals.hasLoop ? "step_loop" : signals.hasExternalCall ? "step_external_call" : "step_output",
          },
          {
            id: "branch_default",
            sourceStepId: "step_branch",
            condition: "unmatched or invalid status",
            targetStepId: "step_output",
            isDefault: true,
          },
        ]
      : [],
    loops: signals.hasLoop
      ? [
          {
            id: "loop_batch_items",
            sourceStepId: "step_loop",
            mode: "batch",
            maxIterations: 100,
            termination: "Stop after all items are processed or the maximum batch count is reached.",
          },
        ]
      : [],
    externalCalls: signals.hasExternalCall
      ? [
          {
            id: "external_fulfillment_api",
            stepId: "step_external_call",
            service: "External API",
            operation: "fulfillment",
            credentialRequirementId: "credential_external_api",
            requestContract: { orderId: "string", status: "string" },
            responseContract: { fulfillmentId: "string", status: "string" },
            responseContractSource: "inferred",
          },
        ]
      : [],
    errorPolicy: signals.hasErrorHandling
      ? { strategy: "retry_then_fail", maxAttempts: 3, notifications: signals.hasNotification ? ["Slack"] : [] }
      : { strategy: "fail_fast", notifications: [] },
    outputs: outputs(signals),
    testContract: {
      examples: [defaultExample(signals)],
      edgeCases: edgeCases(signals),
    },
    credentialRequirements: signals.hasExternalCall
      ? [
          {
            id: "credential_external_api",
            service: "External API",
            credentialType: "httpHeaderAuth",
            authMode: "api_key",
            status: "unknown",
            affectedStepIds: ["step_external_call"],
            blocksApply: true,
          },
        ]
      : [],
    confidence: confidence(signals, warnings),
    riskLevel: riskLevel(signals),
    warnings,
    trace: traceEntries(signals),
  }
}

function analyzePrompt(prompt: string): PromptSignals {
  const normalized = prompt.toLowerCase()
  return {
    triggerMode: triggerMode(normalized),
    hasTransform: hasAny(normalized, ["map", "mapping", "transform", "convert", "format", "filter", "aggregate"]),
    hasFilter: hasAny(normalized, ["filter", "invalid", "valid only", "drop"]),
    hasBranch: hasAny(normalized, ["branch", "route", "status", "if ", "switch", "default path"]),
    hasLoop: hasAny(normalized, ["batch", "batches", "paginate", "pagination", "per item", "each item", "rate limit"]),
    hasExternalCall: hasAny(normalized, ["api", "http", "external", "call", "fulfillment"]),
    hasErrorHandling: hasAny(normalized, ["retry", "fallback", "failure", "error", "dead-letter", "dead letter"]),
    hasNotification: hasAny(normalized, ["notify", "notification", "slack", "email"]),
    hasWriteOutput: hasAny(normalized, ["write", "save", "store", "update target", "target service"]),
    hasOrderEntity: normalized.includes("order"),
  }
}

function triggerMode(prompt: string): V2PlanInput["mode"] {
  if (hasAny(prompt, ["schedule", "cron", "daily", "hourly", "every "])) return "schedule"
  if (hasAny(prompt, ["poll", "polling", "check for new"])) return "polling"
  if (prompt.includes("manual")) return "manual"
  if (hasAny(prompt, ["webhook", "http", "request", "inbound"])) return "webhook"
  return "manual"
}

function inputContract(signals: PromptSignals): V2PlanInput {
  const mode = signals.triggerMode
  const id = inputId(mode)
  if (signals.hasOrderEntity) {
    return {
      id,
      mode,
      schema: { orderId: "string", status: "string", items: "array" },
      samples: [{ orderId: "ord_1", status: "ready", items: [{ sku: "sku_1", quantity: 1 }] }],
    }
  }

  return {
    id,
    mode,
    schema: { sample: "boolean" },
    samples: [{ sample: true }],
  }
}

function entityContracts(signals: PromptSignals): V2Plan["entities"] {
  const entities: V2Plan["entities"] = [
    signals.hasOrderEntity
      ? { name: "Order", fields: { orderId: "string", status: "string", items: "array" } }
      : { name: "Payload", fields: { sample: "boolean" } },
  ]
  if (signals.hasExternalCall) {
    entities.push({ name: "FulfillmentResult", fields: { fulfillmentId: "string", status: "string" } })
  }

  return entities
}

function outputs(signals: PromptSignals): V2Plan["outputs"] {
  const result: V2Plan["outputs"] = [
    {
      id: "output_response",
      mode: "respond_to_webhook",
      contract: { accepted: "boolean" },
    },
  ]
  if (signals.hasWriteOutput) {
    result.push({
      id: "output_write",
      mode: "write_service",
      contract: { fulfillmentId: "string", status: "string" },
    })
  }
  if (signals.hasNotification) {
    result.push({
      id: "output_notification",
      mode: "send_notification",
      contract: { channel: "string", message: "string" },
    })
  }

  return result
}

function defaultExample(signals: PromptSignals): V2Plan["testContract"]["examples"][number] {
  return signals.hasOrderEntity
    ? {
        name: "valid order",
        input: { orderId: "ord_1", status: "ready", items: [{ sku: "sku_1", quantity: 1 }] },
        expectedOutput: { accepted: true, status: "queued" },
      }
    : {
        name: "default sample",
        input: { sample: true },
        expectedOutput: { accepted: true },
      }
}

function edgeCases(signals: PromptSignals): V2Plan["testContract"]["edgeCases"] {
  const edgeCases: V2Plan["testContract"]["edgeCases"] = []
  if (signals.hasFilter || signals.hasBranch) {
    edgeCases.push({
      name: "invalid order",
      input: { orderId: "ord_invalid", status: "invalid", items: [] },
      expectedOutput: { accepted: false },
    })
  }
  if (signals.hasExternalCall || signals.hasErrorHandling) {
    edgeCases.push({
      name: "external API failure",
      input: { orderId: "ord_retry", status: "ready", apiStatus: "failed" },
      expectedOutput: { notified: true },
    })
  }

  return edgeCases
}

function pattern(
  id: string,
  family: V2PlanPattern["family"],
  variant: string,
  summary: string,
  confidence: V2PlanPattern["confidence"] = "high",
): V2PlanPattern {
  return {
    id,
    family,
    variant,
    summary,
    confidence,
    riskLevel: family === "external_call" || family === "error_handling" ? "medium" : "low",
    warnings: confidence === "medium" ? [{ code: "V2_PATTERN_REQUIRES_REVIEW", message: summary, patternId: id }] : [],
  }
}

function triggerSummary(signals: PromptSignals): string {
  switch (signals.triggerMode) {
    case "webhook":
      return "Receive an inbound webhook payload."
    case "schedule":
      return "Run from a scheduled cadence."
    case "polling":
      return "Poll a source for new records."
    case "manual":
      return "Start from a manual operator action."
  }
}

function outputPatternIds(signals: PromptSignals): string[] {
  return [
    "pattern_output_response",
    ...(signals.hasWriteOutput ? ["pattern_output_write"] : []),
    ...(signals.hasNotification ? ["pattern_output_notification"] : []),
  ]
}

function outputRefs(signals: PromptSignals): string[] {
  return [
    "output_response",
    ...(signals.hasWriteOutput ? ["output_write"] : []),
    ...(signals.hasNotification ? ["output_notification"] : []),
  ]
}

function confidence(signals: PromptSignals, warnings: V2Warning[]): V2Plan["confidence"] {
  if (warnings.length > 0) return "medium"
  return signals.triggerMode === "manual" && !signals.hasExternalCall ? "high" : "medium"
}

function riskLevel(signals: PromptSignals): V2Plan["riskLevel"] {
  return signals.hasExternalCall || signals.hasWriteOutput || signals.hasErrorHandling ? "medium" : "low"
}

function traceEntries(signals: PromptSignals): string[] {
  const entries = [`Selected ${signals.triggerMode} trigger pattern.`]
  if (signals.hasTransform) entries.push("Selected transform pattern for field mapping or filtering.")
  if (signals.hasBranch) entries.push("Selected branch pattern because routing conditions were requested.")
  if (signals.hasLoop) entries.push("Selected loop/batch pattern for bounded item processing.")
  if (signals.hasExternalCall) entries.push("Selected external call pattern with explicit credential requirement.")
  if (signals.hasErrorHandling) entries.push("Selected error handling pattern for retry or notification behavior.")
  entries.push("Selected output pattern for final response or side effect.")
  return entries
}

function inputId(mode: V2PlanInput["mode"]): string {
  return `input_${mode}`
}

function entityName(signals: PromptSignals): string {
  return signals.hasOrderEntity ? "Order" : "Payload"
}

function hasAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle))
}
