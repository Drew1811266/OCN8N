# v2 Pattern-First Planner Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Pattern-First Planner slice for v2: a seven-family pattern catalog, deterministic prompt-to-plan pattern selection, and stronger pattern composition validation/simulation.

**Architecture:** This stage stays local and deterministic. `src/v2/pattern-catalog.ts` defines supported pattern families and variants; `src/v2/pattern-planner.ts` converts natural-language prompts into a richer `V2Plan`; `src/v2/plan-service.ts` delegates creation to the planner and expands review/validation/simulation. It does not compile to n8n workflow JSON, apply to n8n, perform reverse planning, or call external APIs.

**Tech Stack:** TypeScript, Vitest, existing v2 plan types, existing v2 plan store/tools/plugin wiring.

---

## Scope Check

The approved v2 design includes planner, simulator, compiler, claim/import, reverse planning, trial runs, and release docs. This plan covers only the Pattern-First Planner foundation:

- Seven basic pattern families at catalog/schema level.
- Deterministic medium-depth variants for common prompts.
- Plan creation that can produce all seven families when requested.
- Pattern composition validation for trigger, transform, branch, loop/batch, error handling, external call, and output.
- Lightweight control-flow and field-flow simulation based on plan samples.

## File Structure

- Create `src/v2/pattern-catalog.ts`: pattern family/variant catalog and lookup helpers.
- Create `src/v2/pattern-planner.ts`: prompt analysis and deterministic `V2Plan` assembly.
- Modify `src/v2/plan-service.ts`: delegate create to planner, enrich review, validation, and simulation.
- Modify `src/index.ts`: export public catalog types/helpers that are part of v2 planner foundation.
- Test `tests/v2-pattern-catalog.test.ts`: catalog covers all seven required families and variants.
- Test `tests/v2-pattern-planner.test.ts`: complex prompt produces all seven families and coherent plan structures.
- Modify `tests/v2-plan-service.test.ts`: update existing assumptions and add validation/simulation coverage.
- Modify `tests/public-contract.test.ts`: package boundary exports new catalog contract.

## Task 1: Add v2 Pattern Catalog

**Files:**
- Create: `src/v2/pattern-catalog.ts`
- Modify: `src/index.ts`
- Test: `tests/v2-pattern-catalog.test.ts`
- Test: `tests/public-contract.test.ts`

- [ ] **Step 1: Write failing catalog tests**

Create `tests/v2-pattern-catalog.test.ts`:

```ts
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
```

Add public-contract imports and sample usage:

```ts
  V2PatternCatalog,
  V2PatternCatalogEntry,
```

Inside the v2 public contract test:

```ts
    const catalogEntry: V2PatternCatalogEntry = {
      family: "trigger",
      label: "Trigger",
      summary: "Starts the workflow.",
      variants: [],
    }
    const catalog: V2PatternCatalog = { trigger: catalogEntry } as V2PatternCatalog
```

Include `catalogEntry` and `catalog` in the final expectation object.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-pattern-catalog.test.ts tests/public-contract.test.ts
```

Expected: FAIL because the catalog module and exports do not exist.

- [ ] **Step 3: Implement catalog**

Create `src/v2/pattern-catalog.ts`:

```ts
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
      { id: "webhook", label: "Webhook", summary: "Receive an inbound HTTP payload.", validationFocus: ["input_contract", "explicit_mode"] },
      { id: "schedule", label: "Schedule", summary: "Run on a time-based cadence.", validationFocus: ["cadence", "timezone"] },
      { id: "manual", label: "Manual", summary: "Start from a manual operator action.", validationFocus: ["operator_input"] },
      { id: "polling", label: "Polling", summary: "Poll a source for new records.", validationFocus: ["cadence", "dedupe_strategy"] },
    ],
  },
  transform: {
    family: "transform",
    label: "Transform",
    summary: "Maps, converts, filters, or aggregates fields.",
    variants: [
      { id: "field_mapping", label: "Field mapping", summary: "Map source fields into target fields.", validationFocus: ["required_fields", "output_fields"] },
      { id: "format_conversion", label: "Format conversion", summary: "Convert field formats or primitive types.", validationFocus: ["type_compatibility"] },
      { id: "filtering", label: "Filtering", summary: "Keep or drop records by condition.", validationFocus: ["known_fields"] },
      { id: "aggregation", label: "Aggregation", summary: "Summarize multiple records.", validationFocus: ["grouping_fields", "output_fields"] },
    ],
  },
  branch: {
    family: "branch",
    label: "Branch",
    summary: "Routes execution through conditional paths.",
    variants: [
      { id: "if", label: "If", summary: "Route on a true/false condition.", validationFocus: ["known_fields", "sample_coverage"] },
      { id: "switch", label: "Switch", summary: "Route on one field with multiple values.", validationFocus: ["known_fields", "default_path"] },
      { id: "multi_condition", label: "Multi-condition", summary: "Route on multiple conditions.", validationFocus: ["known_fields", "default_path"] },
      { id: "default_branch", label: "Default branch", summary: "Fallback path for unmatched conditions.", validationFocus: ["default_path"] },
    ],
  },
  loop_batch: {
    family: "loop_batch",
    label: "Loop/Batch",
    summary: "Processes collections, pages, batches, or rate-limited work.",
    variants: [
      { id: "pagination", label: "Pagination", summary: "Fetch pages until a termination condition.", validationFocus: ["termination", "max_iterations"] },
      { id: "batch", label: "Batch", summary: "Process bounded groups of items.", validationFocus: ["batch_size", "error_policy"] },
      { id: "per_item", label: "Per-item", summary: "Process each item independently.", validationFocus: ["iteration_count"] },
      { id: "rate_limit_boundary", label: "Rate limit boundary", summary: "Throttle work to respect limits.", validationFocus: ["rate_limit", "retry"] },
    ],
  },
  error_handling: {
    family: "error_handling",
    label: "Error handling",
    summary: "Handles retry, fallback, notification, and deferred failure paths.",
    variants: [
      { id: "retry", label: "Retry", summary: "Retry transient failures.", validationFocus: ["max_attempts"] },
      { id: "fallback", label: "Fallback", summary: "Use a fallback path after failure.", validationFocus: ["fallback_path"] },
      { id: "failure_notification", label: "Failure notification", summary: "Notify an operator or channel.", validationFocus: ["destination"] },
      { id: "dead_letter", label: "Dead-letter", summary: "Persist failed work for later handling.", validationFocus: ["destination"] },
    ],
  },
  external_call: {
    family: "external_call",
    label: "External call",
    summary: "Calls an API or service with explicit contracts and credentials.",
    variants: [
      { id: "http_api_call", label: "HTTP/API call", summary: "Call an HTTP or service API.", validationFocus: ["request_contract"] },
      { id: "auth_requirement", label: "Auth requirement", summary: "Classify required credentials.", validationFocus: ["credential_requirement"] },
      { id: "response_parsing", label: "Response parsing", summary: "Parse response fields.", validationFocus: ["response_contract"] },
      { id: "mock_response_schema", label: "Mock/response schema", summary: "Use mock or inferred response shape.", validationFocus: ["schema_source"] },
    ],
  },
  output: {
    family: "output",
    label: "Output",
    summary: "Returns, writes, or notifies final workflow results.",
    variants: [
      { id: "respond_to_webhook", label: "Respond to Webhook", summary: "Return a synchronous response.", validationFocus: ["contract_match"] },
      { id: "write_service", label: "Write to service", summary: "Write side effects to a target service.", validationFocus: ["side_effect"] },
      { id: "send_notification", label: "Send notification", summary: "Notify a person or channel.", validationFocus: ["destination"] },
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
    variants: entry.variants.map((variant) => ({ ...variant, validationFocus: [...variant.validationFocus] })),
  }
}
```

Export from `src/index.ts`:

```ts
export type { V2PatternCatalog, V2PatternCatalogEntry, V2PatternVariantCatalogEntry } from "./v2/pattern-catalog.js"
export { V2_PATTERN_CATALOG, getV2PatternFamily, listV2PatternFamilies } from "./v2/pattern-catalog.js"
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-pattern-catalog.test.ts tests/public-contract.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/v2/pattern-catalog.ts src/index.ts tests/v2-pattern-catalog.test.ts tests/public-contract.test.ts
git commit -m "feat: add v2 pattern catalog"
```

## Task 2: Add Deterministic Pattern Planner

**Files:**
- Create: `src/v2/pattern-planner.ts`
- Modify: `src/v2/plan-service.ts`
- Test: `tests/v2-pattern-planner.test.ts`
- Test: `tests/v2-plan-service.test.ts`

- [ ] **Step 1: Write failing planner tests**

Create `tests/v2-pattern-planner.test.ts` with tests for:

- a webhook/API/branch/batch/retry/notification prompt returns all seven pattern families;
- the generated plan has branch, loop, external call, credential requirement, retry policy, output, examples, and edge cases;
- a minimal manual prompt keeps a small trigger/output plan.

Use assertions over plan structure, not exact full object equality.

- [ ] **Step 2: Run planner tests to verify failure**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-pattern-planner.test.ts tests/v2-plan-service.test.ts
```

Expected: FAIL because `src/v2/pattern-planner.ts` does not exist and service still creates only trigger/output plans.

- [ ] **Step 3: Implement planner module**

Create `src/v2/pattern-planner.ts` with:

- `createPatternFirstV2Plan(input: CreatePatternFirstV2PlanInput): V2Plan`
- prompt keyword analysis helpers;
- deterministic step/pattern IDs;
- conservative warnings and confidence/risk scoring;
- no raw secret persistence beyond existing store redaction guarantees.

- [ ] **Step 4: Delegate plan service creation**

Modify `createInitialV2Plan` in `src/v2/plan-service.ts` to return `createPatternFirstV2Plan(input)`.

- [ ] **Step 5: Run tests to verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-pattern-planner.test.ts tests/v2-plan-service.test.ts tests/v2-tools.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/v2/pattern-planner.ts src/v2/plan-service.ts tests/v2-pattern-planner.test.ts tests/v2-plan-service.test.ts
git commit -m "feat: add v2 pattern-first planner"
```

## Task 3: Strengthen Pattern Validation And Simulation

**Files:**
- Modify: `src/v2/plan-service.ts`
- Test: `tests/v2-plan-service.test.ts`

- [ ] **Step 1: Add failing validation/simulation tests**

Add tests proving:

- missing branch default returns `V2_BRANCH_DEFAULT_REQUIRED`;
- unbounded loops return `V2_LOOP_BOUND_REQUIRED`;
- external calls without response contract return `V2_EXTERNAL_RESPONSE_CONTRACT_REQUIRED`;
- external calls without matching credential requirement return `V2_EXTERNAL_CREDENTIAL_REQUIRED`;
- retry policies without `maxAttempts` return `V2_RETRY_ATTEMPTS_REQUIRED`;
- sample simulation path reflects branches and loops;
- field traces include transformed fields and output fields.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-plan-service.test.ts
```

Expected: FAIL because these checks are not implemented.

- [ ] **Step 3: Implement validation and simulation updates**

Modify `validatePlan` and simulation helpers in `src/v2/plan-service.ts` to enforce pattern composition rules and generate richer sample paths/field traces. Keep stable error codes and actionable messages.

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/v2-plan-service.test.ts tests/v2-pattern-planner.test.ts tests/v2-tools.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/v2/plan-service.ts tests/v2-plan-service.test.ts
git commit -m "feat: validate v2 pattern composition"
```

## Task 4: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run full verification**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsup
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" node scripts/check-package-files.mjs
git diff --check
```

Expected: all pass.

- [ ] **Step 2: Review plan coverage**

Confirm this stage delivered:

- seven-family catalog;
- deterministic prompt-to-plan pattern selection;
- all-seven complex prompt coverage;
- stronger pattern composition validation;
- richer sample paths and field traces;
- no compile/apply scope creep.

- [ ] **Step 3: Commit any final fixes**

Only commit if Step 1 or Step 2 required changes.

