import type { V2PatternFamily } from "./types.js"

export type V2PatternVariantCatalogEntry = {
  id: string
  label: string
  summary: string
  validationFocus: string[]
}

export type V2PatternCatalogEntry = {
  family: V2PatternFamily
  label: string
  summary: string
  variants: V2PatternVariantCatalogEntry[]
}

export type V2PatternCatalog = Record<V2PatternFamily, V2PatternCatalogEntry>

const catalog = {
  trigger: {
    family: "trigger",
    label: "Trigger",
    summary: "Starts a workflow from webhook, schedule, manual, or polling input.",
    variants: [
      {
        id: "webhook",
        label: "Webhook",
        summary: "Receive an inbound HTTP payload.",
        validationFocus: ["input_contract", "explicit_mode"],
      },
      {
        id: "schedule",
        label: "Schedule",
        summary: "Run on a time-based cadence.",
        validationFocus: ["cadence", "timezone"],
      },
      {
        id: "manual",
        label: "Manual",
        summary: "Start from a manual operator action.",
        validationFocus: ["operator_input"],
      },
      {
        id: "polling",
        label: "Polling",
        summary: "Poll a source for new records.",
        validationFocus: ["cadence", "dedupe_strategy"],
      },
    ],
  },
  transform: {
    family: "transform",
    label: "Transform",
    summary: "Maps, converts, filters, or aggregates fields.",
    variants: [
      {
        id: "field_mapping",
        label: "Field mapping",
        summary: "Map source fields into target fields.",
        validationFocus: ["required_fields", "output_fields"],
      },
      {
        id: "format_conversion",
        label: "Format conversion",
        summary: "Convert field formats or primitive types.",
        validationFocus: ["type_compatibility"],
      },
      {
        id: "filtering",
        label: "Filtering",
        summary: "Keep or drop records by condition.",
        validationFocus: ["known_fields"],
      },
      {
        id: "aggregation",
        label: "Aggregation",
        summary: "Summarize multiple records.",
        validationFocus: ["grouping_fields", "output_fields"],
      },
    ],
  },
  branch: {
    family: "branch",
    label: "Branch",
    summary: "Routes execution through conditional paths.",
    variants: [
      {
        id: "if",
        label: "If",
        summary: "Route on a true/false condition.",
        validationFocus: ["known_fields", "sample_coverage"],
      },
      {
        id: "switch",
        label: "Switch",
        summary: "Route on one field with multiple values.",
        validationFocus: ["known_fields", "default_path"],
      },
      {
        id: "multi_condition",
        label: "Multi-condition",
        summary: "Route on multiple conditions.",
        validationFocus: ["known_fields", "default_path"],
      },
      {
        id: "default_branch",
        label: "Default branch",
        summary: "Fallback path for unmatched conditions.",
        validationFocus: ["default_path"],
      },
    ],
  },
  loop_batch: {
    family: "loop_batch",
    label: "Loop/Batch",
    summary: "Processes collections, pages, batches, or rate-limited work.",
    variants: [
      {
        id: "pagination",
        label: "Pagination",
        summary: "Fetch pages until a termination condition.",
        validationFocus: ["termination", "max_iterations"],
      },
      {
        id: "batch",
        label: "Batch",
        summary: "Process bounded groups of items.",
        validationFocus: ["batch_size", "error_policy"],
      },
      {
        id: "per_item",
        label: "Per-item",
        summary: "Process each item independently.",
        validationFocus: ["iteration_count"],
      },
      {
        id: "rate_limit_boundary",
        label: "Rate limit boundary",
        summary: "Throttle work to respect limits.",
        validationFocus: ["rate_limit", "retry"],
      },
    ],
  },
  error_handling: {
    family: "error_handling",
    label: "Error handling",
    summary: "Handles retry, fallback, notification, and deferred failure paths.",
    variants: [
      {
        id: "retry",
        label: "Retry",
        summary: "Retry transient failures.",
        validationFocus: ["max_attempts"],
      },
      {
        id: "fallback",
        label: "Fallback",
        summary: "Use a fallback path after failure.",
        validationFocus: ["fallback_path"],
      },
      {
        id: "failure_notification",
        label: "Failure notification",
        summary: "Notify an operator or channel.",
        validationFocus: ["destination"],
      },
      {
        id: "dead_letter",
        label: "Dead-letter",
        summary: "Persist failed work for later handling.",
        validationFocus: ["destination"],
      },
    ],
  },
  external_call: {
    family: "external_call",
    label: "External call",
    summary: "Calls an API or service with explicit contracts and credentials.",
    variants: [
      {
        id: "http_api_call",
        label: "HTTP/API call",
        summary: "Call an HTTP or service API.",
        validationFocus: ["request_contract"],
      },
      {
        id: "auth_requirement",
        label: "Auth requirement",
        summary: "Classify required credentials.",
        validationFocus: ["credential_requirement"],
      },
      {
        id: "response_parsing",
        label: "Response parsing",
        summary: "Parse response fields.",
        validationFocus: ["response_contract"],
      },
      {
        id: "mock_response_schema",
        label: "Mock/response schema",
        summary: "Use mock or inferred response shape.",
        validationFocus: ["schema_source"],
      },
    ],
  },
  output: {
    family: "output",
    label: "Output",
    summary: "Returns, writes, or notifies final workflow results.",
    variants: [
      {
        id: "respond_to_webhook",
        label: "Respond to Webhook",
        summary: "Return a synchronous response.",
        validationFocus: ["contract_match"],
      },
      {
        id: "write_service",
        label: "Write to service",
        summary: "Write side effects to a target service.",
        validationFocus: ["side_effect"],
      },
      {
        id: "send_notification",
        label: "Send notification",
        summary: "Notify a person or channel.",
        validationFocus: ["destination"],
      },
    ],
  },
} satisfies V2PatternCatalog

export const V2_PATTERN_CATALOG: V2PatternCatalog = catalog

export function listV2PatternFamilies(): V2PatternFamily[] {
  return Object.keys(catalog) as V2PatternFamily[]
}

export function getV2PatternFamily(family: V2PatternFamily): V2PatternCatalogEntry {
  const entry = catalog[family]
  return {
    ...entry,
    variants: entry.variants.map((variant) => ({
      ...variant,
      validationFocus: [...variant.validationFocus],
    })),
  }
}
