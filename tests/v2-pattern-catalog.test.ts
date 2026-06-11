import { describe, expect, it } from "vitest"
import { V2_PATTERN_CATALOG, getV2PatternFamily, listV2PatternFamilies } from "../src/v2/pattern-catalog.js"

describe("v2 pattern catalog", () => {
  it("covers the seven required pattern families with medium-depth variants", () => {
    expect(listV2PatternFamilies()).toEqual([
      "trigger",
      "transform",
      "branch",
      "loop_batch",
      "error_handling",
      "external_call",
      "output",
    ])
    expect(V2_PATTERN_CATALOG.trigger.variants.map((variant) => variant.id)).toEqual([
      "webhook",
      "schedule",
      "manual",
      "polling",
    ])
    expect(V2_PATTERN_CATALOG.transform.variants.map((variant) => variant.id)).toEqual([
      "field_mapping",
      "format_conversion",
      "filtering",
      "aggregation",
    ])
    expect(V2_PATTERN_CATALOG.branch.variants.map((variant) => variant.id)).toEqual([
      "if",
      "switch",
      "multi_condition",
      "default_branch",
    ])
    expect(V2_PATTERN_CATALOG.loop_batch.variants.map((variant) => variant.id)).toEqual([
      "pagination",
      "batch",
      "per_item",
      "rate_limit_boundary",
    ])
    expect(V2_PATTERN_CATALOG.error_handling.variants.map((variant) => variant.id)).toEqual([
      "retry",
      "fallback",
      "failure_notification",
      "dead_letter",
    ])
    expect(V2_PATTERN_CATALOG.external_call.variants.map((variant) => variant.id)).toEqual([
      "http_api_call",
      "auth_requirement",
      "response_parsing",
      "mock_response_schema",
    ])
    expect(V2_PATTERN_CATALOG.output.variants.map((variant) => variant.id)).toEqual([
      "respond_to_webhook",
      "write_service",
      "send_notification",
    ])
  })

  it("returns catalog entries without exposing mutable internals", () => {
    const trigger = getV2PatternFamily("trigger")
    trigger.variants.push({
      id: "mutated",
      label: "Mutated",
      summary: "Mutation attempt.",
      validationFocus: [],
    })

    expect(getV2PatternFamily("trigger").variants.map((variant) => variant.id)).not.toContain("mutated")
  })
})
