# v2 Plan Artifact Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first v2 foundation layer: isolated `.opencode/n8n-v2/` paths, public v2 plan types, plan artifact storage, v2 registry storage, and local-only plan/review/patch/validate tool primitives.

**Architecture:** This plan does not implement the full v2 pattern library, simulator, compiler, reverse planner, or n8n apply path. It creates stable v2 data structures and storage boundaries so those later subsystems can be built independently. v1 runtime behavior remains available during this foundation step; the final v2 breaking public-contract switch belongs in a later plan.

**Tech Stack:** TypeScript, Vitest, Node.js `fs/promises`, `crypto.randomUUID`, existing `N8nBuilderError`, existing `redactSecrets`, existing OpenCode plugin tool API.

---

## Scope Check

The v2 complex planning spec covers multiple independent subsystems:

- v2 artifact and registry foundation.
- seven pattern schemas and pattern validation.
- control-flow and field-flow simulation.
- mixed compiler and mapping trace.
- claim/import and reverse planning.
- opt-in trial runs.
- final v2 public contract switch and release docs.

This plan covers only the first subsystem: artifact foundation. It should leave the repository in a working state with tests, build, and package checks passing. Later plans should build on the types and storage introduced here.

## File Structure

- Modify `src/types.ts`: add `V2ArtifactPaths` and attach it to local/plugin config.
- Modify `src/config.ts`: compute `.opencode/n8n-v2/` paths.
- Create `src/v2/types.ts`: public v2 plan, artifact, registry, review, and validation types.
- Create `src/v2/plan-store.ts`: save/load versioned plan artifacts under `plans/<planId>/v<planVersion>.json`.
- Create `src/v2/registry.ts`: save/list/get v2 workflow registry records under `.opencode/n8n-v2/registry/workflows.json`.
- Create `src/v2/plan-service.ts`: deterministic local plan creation, review, patch, and basic validation primitives for foundation tests.
- Create `src/tools/v2-create-plan.ts`: tool orchestration for `n8n_v2_create_plan`.
- Create `src/tools/v2-review-plan.ts`: tool orchestration for `n8n_v2_review_plan`.
- Create `src/tools/v2-patch-plan.ts`: tool orchestration for `n8n_v2_patch_plan`.
- Create `src/tools/v2-validate-simulate.ts`: tool orchestration for `n8n_v2_validate_simulate`.
- Modify `src/plugin.ts`: wire local-only v2 tools alongside current v1 tools for this foundation phase.
- Modify `src/index.ts`: export v2 public types.
- Create `tests/v2-plan-store.test.ts`: artifact persistence tests.
- Create `tests/v2-registry.test.ts`: v2 registry tests.
- Create `tests/v2-plan-service.test.ts`: local create/review/patch/validate behavior tests.
- Modify `tests/config.test.ts`: assert v2 artifact paths.
- Modify `tests/plugin.test.ts`: assert v2 tools are registered and local-only tools do not require n8n API/MCP config.
- Modify `tests/public-contract.test.ts`: assert v2 types compile from package entrypoint.

## Task 1: Add v2 Artifact Paths To Local Config

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Add failing config test**

Add this assertion block to `tests/config.test.ts` inside `it("loads local workspace config without n8n connection settings", ...)`, after the existing `previewDir` expectation:

```ts
    expect(config.v2).toEqual({
      rootDir: "/tmp/project/.opencode/n8n-v2",
      plansDir: "/tmp/project/.opencode/n8n-v2/plans",
      simulationsDir: "/tmp/project/.opencode/n8n-v2/simulations",
      previewsDir: "/tmp/project/.opencode/n8n-v2/previews",
      registryPath: "/tmp/project/.opencode/n8n-v2/registry/workflows.json",
      claimsDir: "/tmp/project/.opencode/n8n-v2/claims",
      runsDir: "/tmp/project/.opencode/n8n-v2/runs",
      exportsDir: "/tmp/project/.opencode/n8n-v2/exports",
    })
```

Also add this assertion to `it("loads API config without requiring MCP URL", ...)`:

```ts
    expect(config.v2.rootDir).toBe("/tmp/project/.opencode/n8n-v2")
```

- [ ] **Step 2: Run config test to verify failure**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/vitest run tests/config.test.ts
```

Expected: FAIL because `config.v2` is undefined.

- [ ] **Step 3: Add v2 path types**

In `src/types.ts`, add this type above `PluginConfig`:

```ts
export type V2ArtifactPaths = {
  rootDir: string
  plansDir: string
  simulationsDir: string
  previewsDir: string
  registryPath: string
  claimsDir: string
  runsDir: string
  exportsDir: string
}
```

Then add this field to `PluginConfig`:

```ts
  v2: V2ArtifactPaths
```

- [ ] **Step 4: Compute v2 paths in local config**

In `src/config.ts`, add this helper above `localConfigFromInput`:

```ts
function v2ArtifactPaths(workspaceDir: string): PluginConfig["v2"] {
  const rootDir = path.join(workspaceDir, ".opencode", "n8n-v2")

  return {
    rootDir,
    plansDir: path.join(rootDir, "plans"),
    simulationsDir: path.join(rootDir, "simulations"),
    previewsDir: path.join(rootDir, "previews"),
    registryPath: path.join(rootDir, "registry", "workflows.json"),
    claimsDir: path.join(rootDir, "claims"),
    runsDir: path.join(rootDir, "runs"),
    exportsDir: path.join(rootDir, "exports"),
  }
}
```

Then add this property to the object returned from `localConfigFromInput`:

```ts
    v2: v2ArtifactPaths(input.workspaceDir),
```

- [ ] **Step 5: Run config test to verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/vitest run tests/config.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/config.ts tests/config.test.ts
git commit -m "feat: add v2 artifact paths"
```

## Task 2: Add Public v2 Plan Types

**Files:**
- Create: `src/v2/types.ts`
- Modify: `src/index.ts`
- Test: `tests/public-contract.test.ts`

- [ ] **Step 1: Add failing public contract test**

Add these imports to `tests/public-contract.test.ts`:

```ts
  V2Plan,
  V2PlanPattern,
  V2PlanReview,
  V2PlanVersion,
  V2RegistryRecord,
  V2SimulationResult,
```

Add this test at the end of the `describe("public package contract exports", ...)` block:

```ts
  it("exports v2 plan artifact contract types", () => {
    const pattern: V2PlanPattern = {
      id: "pattern_trigger_1",
      family: "trigger",
      variant: "webhook",
      summary: "Receive order payloads.",
      confidence: "high",
      riskLevel: "low",
      warnings: [],
    }
    const plan: V2Plan = {
      intent: {
        goal: "Receive order payloads and return an acknowledgement.",
        scope: ["webhook input", "response output"],
        nonGoals: ["production activation"],
      },
      inputs: [
        {
          id: "input_webhook",
          mode: "webhook",
          schema: { orderId: "string" },
          samples: [{ orderId: "ord_1" }],
        },
      ],
      entities: [{ name: "Order", fields: { orderId: "string" } }],
      steps: [
        {
          id: "step_receive",
          name: "Receive order",
          summary: "Accept order input.",
          patternIds: ["pattern_trigger_1"],
          inputRefs: ["input_webhook"],
          outputRefs: ["Order"],
        },
      ],
      patterns: [pattern],
      branches: [],
      loops: [],
      externalCalls: [],
      errorPolicy: { strategy: "fail_fast", notifications: [] },
      outputs: [
        {
          id: "output_response",
          mode: "respond_to_webhook",
          contract: { accepted: "boolean" },
        },
      ],
      testContract: {
        examples: [
          {
            name: "valid order",
            input: { orderId: "ord_1" },
            expectedOutput: { accepted: true },
          },
        ],
        edgeCases: [],
      },
      credentialRequirements: [],
      confidence: "high",
      riskLevel: "low",
      warnings: [],
      trace: ["Mapped webhook request to trigger and response patterns."],
    }
    const version: V2PlanVersion = {
      planId: "123e4567-e89b-12d3-a456-426614174000",
      planVersion: 1,
      plan,
      createdAt: "2026-06-11T00:00:00.000Z",
      source: "create",
      summary: "Initial plan",
      contentHash: "hash",
    }
    const review: V2PlanReview = {
      planId: version.planId,
      planVersion: version.planVersion,
      summary: "Plan is ready for validation.",
      patternReviews: [],
      assumptions: [],
      risks: [],
      openQuestions: [],
      simulationCoverage: [],
      confidence: "high",
      riskLevel: "low",
    }
    const simulation: V2SimulationResult = {
      planId: version.planId,
      planVersion: version.planVersion,
      status: "passed",
      checkedAt: "2026-06-11T00:00:00.000Z",
      issues: [],
      sampleResults: [],
      fieldTraces: [],
    }
    const registry: V2RegistryRecord = {
      workflowId: "wf_1",
      name: "Orders",
      url: "https://demo/workflow/wf_1",
      baseUrl: "https://demo/api/v1",
      claimMode: "full",
      activeAtClaim: false,
      managedBy: "opencode-n8n-builder-v2",
      managedByVersion: "2.0.0",
      latestPlanId: version.planId,
      latestPlanVersion: version.planVersion,
      latestWorkflowHash: "workflow_hash",
      lastUpdatedAt: "2026-06-11T00:00:00.000Z",
    }

    expect({ pattern, plan, version, review, simulation, registry }).toBeDefined()
  })
```

- [ ] **Step 2: Run public contract test to verify failure**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/vitest run tests/public-contract.test.ts
```

Expected: FAIL because v2 types are not exported.

- [ ] **Step 3: Create v2 type model**

Create `src/v2/types.ts` with:

```ts
export type V2Confidence = "high" | "medium" | "low"
export type V2RiskLevel = "low" | "medium" | "high"

export type V2PatternFamily =
  | "trigger"
  | "transform"
  | "branch"
  | "loop_batch"
  | "error_handling"
  | "external_call"
  | "output"

export type V2Warning = {
  code: string
  message: string
  stepId?: string
  patternId?: string
}

export type V2PlanIntent = {
  goal: string
  scope: string[]
  nonGoals: string[]
}

export type V2PlanInput = {
  id: string
  mode: "webhook" | "schedule" | "manual" | "polling"
  schema: Record<string, string>
  samples: Array<Record<string, unknown>>
}

export type V2PlanEntity = {
  name: string
  fields: Record<string, string>
}

export type V2PlanStep = {
  id: string
  name: string
  summary: string
  patternIds: string[]
  inputRefs: string[]
  outputRefs: string[]
}

export type V2PlanPattern = {
  id: string
  family: V2PatternFamily
  variant: string
  summary: string
  confidence: V2Confidence
  riskLevel: V2RiskLevel
  warnings: V2Warning[]
}

export type V2PlanBranch = {
  id: string
  sourceStepId: string
  condition: string
  targetStepId: string
  isDefault?: boolean
}

export type V2PlanLoop = {
  id: string
  sourceStepId: string
  mode: "pagination" | "batch" | "per_item"
  maxIterations: number
  termination: string
}

export type V2ExternalCall = {
  id: string
  stepId: string
  service: string
  operation: string
  credentialRequirementId?: string
  requestContract: Record<string, string>
  responseContract?: Record<string, string>
  responseContractSource: "user" | "docs" | "inferred" | "missing"
}

export type V2ErrorPolicy = {
  strategy: "fail_fast" | "retry_then_fail" | "fallback" | "dead_letter"
  maxAttempts?: number
  notifications: string[]
}

export type V2PlanOutput = {
  id: string
  mode: "respond_to_webhook" | "write_service" | "send_notification"
  contract: Record<string, string>
}

export type V2TestExample = {
  name: string
  input: Record<string, unknown>
  expectedOutput: Record<string, unknown>
}

export type V2TestContract = {
  examples: V2TestExample[]
  edgeCases: V2TestExample[]
}

export type V2CredentialRequirement = {
  id: string
  service: string
  credentialType: string
  authMode: "api_key" | "header_auth" | "basic" | "manual" | "oauth2"
  status: "available" | "missing_env" | "manual_setup" | "oauth_handoff" | "unknown"
  affectedStepIds: string[]
  blocksApply: boolean
}

export type V2Plan = {
  intent: V2PlanIntent
  inputs: V2PlanInput[]
  entities: V2PlanEntity[]
  steps: V2PlanStep[]
  patterns: V2PlanPattern[]
  branches: V2PlanBranch[]
  loops: V2PlanLoop[]
  externalCalls: V2ExternalCall[]
  errorPolicy: V2ErrorPolicy
  outputs: V2PlanOutput[]
  testContract: V2TestContract
  credentialRequirements: V2CredentialRequirement[]
  confidence: V2Confidence
  riskLevel: V2RiskLevel
  warnings: V2Warning[]
  trace: string[]
}

export type V2PlanVersionSource = "create" | "patch" | "reverse"

export type V2PlanVersion = {
  planId: string
  planVersion: number
  plan: V2Plan
  createdAt: string
  source: V2PlanVersionSource
  summary: string
  contentHash: string
  parentPlanVersion?: number
}

export type V2PlanReview = {
  planId: string
  planVersion: number
  summary: string
  patternReviews: Array<{
    patternId: string
    family: V2PatternFamily
    decision: string
    confidence: V2Confidence
    riskLevel: V2RiskLevel
  }>
  assumptions: string[]
  risks: string[]
  openQuestions: string[]
  simulationCoverage: string[]
  confidence: V2Confidence
  riskLevel: V2RiskLevel
}

export type V2ValidationIssue = {
  code: string
  message: string
  severity: "error" | "warning"
  stepId?: string
  patternId?: string
}

export type V2SimulationResult = {
  planId: string
  planVersion: number
  status: "passed" | "failed" | "warning"
  checkedAt: string
  issues: V2ValidationIssue[]
  sampleResults: Array<{
    name: string
    status: "passed" | "failed"
    path: string[]
  }>
  fieldTraces: Array<{
    field: string
    source: string
    target: string
  }>
}

export type V2RegistryRecord = {
  workflowId: string
  name: string
  url: string
  baseUrl: string
  claimMode: "full" | "read_only"
  activeAtClaim: boolean
  managedBy: "opencode-n8n-builder-v2"
  managedByVersion: string
  latestPlanId?: string
  latestPlanVersion?: number
  latestWorkflowHash?: string
  latestPreviewId?: string
  lastValidationStatus?: "passed" | "failed" | "warning"
  lastUpdatedAt: string
}
```

- [ ] **Step 4: Export v2 types from package entrypoint**

Add this export block to `src/index.ts`:

```ts
export type {
  V2Confidence,
  V2CredentialRequirement,
  V2ExternalCall,
  V2PatternFamily,
  V2Plan,
  V2PlanBranch,
  V2PlanEntity,
  V2PlanInput,
  V2PlanLoop,
  V2PlanOutput,
  V2PlanPattern,
  V2PlanReview,
  V2PlanStep,
  V2PlanVersion,
  V2RegistryRecord,
  V2RiskLevel,
  V2SimulationResult,
  V2TestContract,
  V2ValidationIssue,
  V2Warning,
} from "./v2/types.js"
```

- [ ] **Step 5: Run public contract test to verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/vitest run tests/public-contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/v2/types.ts src/index.ts tests/public-contract.test.ts
git commit -m "feat: export v2 plan contract types"
```

## Task 3: Add v2 Plan Store

**Files:**
- Create: `src/v2/plan-store.ts`
- Test: `tests/v2-plan-store.test.ts`

- [ ] **Step 1: Add failing plan store tests**

Create `tests/v2-plan-store.test.ts` with:

```ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { V2PlanStore } from "../src/v2/plan-store.js"
import type { V2Plan } from "../src/v2/types.js"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ocn8n-v2-plan-store-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function plansDir(): string {
  return path.join(dir, ".opencode", "n8n-v2", "plans")
}

function plan(overrides: Partial<V2Plan> = {}): V2Plan {
  return {
    intent: {
      goal: "Receive order payloads and return an acknowledgement.",
      scope: ["webhook input", "response output"],
      nonGoals: ["production activation"],
    },
    inputs: [
      {
        id: "input_webhook",
        mode: "webhook",
        schema: { orderId: "string" },
        samples: [{ orderId: "ord_1" }],
      },
    ],
    entities: [{ name: "Order", fields: { orderId: "string" } }],
    steps: [
      {
        id: "step_receive",
        name: "Receive order",
        summary: "Accept order input.",
        patternIds: ["pattern_trigger"],
        inputRefs: ["input_webhook"],
        outputRefs: ["Order"],
      },
    ],
    patterns: [
      {
        id: "pattern_trigger",
        family: "trigger",
        variant: "webhook",
        summary: "Receive payload.",
        confidence: "high",
        riskLevel: "low",
        warnings: [],
      },
    ],
    branches: [],
    loops: [],
    externalCalls: [],
    errorPolicy: { strategy: "fail_fast", notifications: [] },
    outputs: [
      {
        id: "output_response",
        mode: "respond_to_webhook",
        contract: { accepted: "boolean" },
      },
    ],
    testContract: {
      examples: [
        {
          name: "valid order",
          input: { orderId: "ord_1" },
          expectedOutput: { accepted: true },
        },
      ],
      edgeCases: [],
    },
    credentialRequirements: [],
    confidence: "high",
    riskLevel: "low",
    warnings: [],
    trace: ["Mapped prompt to trigger and output patterns."],
    ...overrides,
  }
}

describe("V2PlanStore", () => {
  it("saves initial and next plan versions under isolated v2 plan directory", async () => {
    const store = new V2PlanStore(plansDir())

    const first = await store.saveInitial({
      plan: plan(),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Initial webhook plan",
    })
    const second = await store.saveNext({
      planId: first.planId,
      parentPlanVersion: first.planVersion,
      plan: plan({ trace: ["Patched response output."] }),
      createdAt: "2026-06-11T00:05:00.000Z",
      summary: "Patch response output",
    })

    expect(first.planId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/,
    )
    expect(first.planVersion).toBe(1)
    expect(second.planId).toBe(first.planId)
    expect(second.planVersion).toBe(2)
    expect(second.parentPlanVersion).toBe(1)
    expect(await store.get(first.planId, 1)).toEqual(first)
    expect(await store.get(first.planId, 2)).toEqual(second)
    expect(await store.latest(first.planId)).toEqual(second)
    expect((await store.listVersions(first.planId)).map((version) => version.planVersion)).toEqual([1, 2])

    const raw = await readFile(path.join(plansDir(), first.planId, "v1.json"), "utf8")
    expect(raw.endsWith("\n")).toBe(true)
  })

  it("redacts secret-looking values before persistence", async () => {
    const store = new V2PlanStore(plansDir())
    const saved = await store.saveInitial({
      plan: plan({
        inputs: [
          {
            id: "input_webhook",
            mode: "webhook",
            schema: { authorization: "string" },
            samples: [{ authorization: "Bearer secret-token" }],
          },
        ],
      }),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Plan with sensitive sample",
    })

    const raw = await readFile(path.join(plansDir(), saved.planId, "v1.json"), "utf8")
    expect(raw).not.toContain("secret-token")
    expect(raw).toContain("[REDACTED]")
  })

  it("returns undefined for traversal IDs, malformed versions, missing files, and malformed JSON", async () => {
    const store = new V2PlanStore(plansDir())
    expect(await store.get("../../outside", 1)).toBeUndefined()
    expect(await store.get("123e4567-e89b-12d3-a456-426614174000", 0)).toBeUndefined()
    expect(await store.get("123e4567-e89b-12d3-a456-426614174000", 1)).toBeUndefined()

    const validId = "123e4567-e89b-12d3-a456-426614174000"
    await mkdir(path.join(plansDir(), validId), { recursive: true })
    await writeFile(path.join(plansDir(), validId, "v1.json"), JSON.stringify({ planId: validId }), "utf8")

    expect(await store.get(validId, 1)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run plan store test to verify failure**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/vitest run tests/v2-plan-store.test.ts
```

Expected: FAIL because `src/v2/plan-store.ts` does not exist.

- [ ] **Step 3: Implement plan store**

Create `src/v2/plan-store.ts` with:

```ts
import { randomUUID } from "node:crypto"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { stableHash } from "../hash.js"
import { redactSecrets } from "../security.js"
import type { V2Plan, V2PlanVersion } from "./types.js"

export type SaveInitialV2PlanInput = {
  plan: V2Plan
  createdAt: string
  summary: string
}

export type SaveNextV2PlanInput = SaveInitialV2PlanInput & {
  planId: string
  parentPlanVersion: number
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i

export class V2PlanStore {
  constructor(private readonly plansDir: string) {}

  async saveInitial(input: SaveInitialV2PlanInput): Promise<V2PlanVersion> {
    return this.writeVersion({
      planId: randomUUID(),
      planVersion: 1,
      plan: sanitizePlan(input.plan),
      createdAt: input.createdAt,
      source: "create",
      summary: input.summary,
      contentHash: stableHash(input.plan),
    })
  }

  async saveNext(input: SaveNextV2PlanInput): Promise<V2PlanVersion> {
    const latest = await this.latest(input.planId)
    const nextVersion = latest ? latest.planVersion + 1 : input.parentPlanVersion + 1

    return this.writeVersion({
      planId: input.planId,
      planVersion: nextVersion,
      plan: sanitizePlan(input.plan),
      createdAt: input.createdAt,
      source: "patch",
      summary: input.summary,
      contentHash: stableHash(input.plan),
      parentPlanVersion: input.parentPlanVersion,
    })
  }

  async get(planId: string, planVersion: number): Promise<V2PlanVersion | undefined> {
    if (!isSafePlanId(planId) || !isSafeVersion(planVersion)) {
      return undefined
    }

    try {
      const raw = await readFile(this.versionPath(planId, planVersion), "utf8")
      const parsed: unknown = JSON.parse(raw)

      return isV2PlanVersion(parsed) ? parsed : undefined
    } catch {
      return undefined
    }
  }

  async latest(planId: string): Promise<V2PlanVersion | undefined> {
    const versions = await this.listVersions(planId)
    return versions.at(-1)
  }

  async listVersions(planId: string): Promise<V2PlanVersion[]> {
    if (!isSafePlanId(planId)) {
      return []
    }

    try {
      const entries = await readdir(path.join(this.plansDir, planId))
      const versionNumbers = entries
        .map((entry) => /^v([1-9]\d*)\.json$/.exec(entry)?.[1])
        .filter((value): value is string => value !== undefined)
        .map((value) => Number(value))
        .sort((a, b) => a - b)
      const versions = await Promise.all(versionNumbers.map((version) => this.get(planId, version)))

      return versions.filter((version): version is V2PlanVersion => version !== undefined)
    } catch {
      return []
    }
  }

  private async writeVersion(version: V2PlanVersion): Promise<V2PlanVersion> {
    await mkdir(path.dirname(this.versionPath(version.planId, version.planVersion)), { recursive: true })
    await writeFile(
      this.versionPath(version.planId, version.planVersion),
      `${JSON.stringify(version, null, 2)}\n`,
      "utf8",
    )

    return version
  }

  private versionPath(planId: string, planVersion: number): string {
    return path.join(this.plansDir, planId, `v${planVersion}.json`)
  }
}

function sanitizePlan(plan: V2Plan): V2Plan {
  return redactSecrets(plan) as V2Plan
}

function isSafePlanId(planId: string): boolean {
  return uuidPattern.test(planId)
}

function isSafeVersion(planVersion: number): boolean {
  return Number.isInteger(planVersion) && planVersion > 0
}

function isV2PlanVersion(value: unknown): value is V2PlanVersion {
  return (
    isRecord(value) &&
    typeof value.planId === "string" &&
    isSafePlanId(value.planId) &&
    typeof value.planVersion === "number" &&
    isSafeVersion(value.planVersion) &&
    isV2Plan(value.plan) &&
    typeof value.createdAt === "string" &&
    (value.source === "create" || value.source === "patch" || value.source === "reverse") &&
    typeof value.summary === "string" &&
    typeof value.contentHash === "string" &&
    (value.parentPlanVersion === undefined ||
      (typeof value.parentPlanVersion === "number" && isSafeVersion(value.parentPlanVersion)))
  )
}

function isV2Plan(value: unknown): value is V2Plan {
  return (
    isRecord(value) &&
    isRecord(value.intent) &&
    typeof value.intent.goal === "string" &&
    Array.isArray(value.inputs) &&
    Array.isArray(value.entities) &&
    Array.isArray(value.steps) &&
    Array.isArray(value.patterns) &&
    Array.isArray(value.branches) &&
    Array.isArray(value.loops) &&
    Array.isArray(value.externalCalls) &&
    isRecord(value.errorPolicy) &&
    Array.isArray(value.outputs) &&
    isRecord(value.testContract) &&
    Array.isArray(value.credentialRequirements) &&
    (value.confidence === "high" || value.confidence === "medium" || value.confidence === "low") &&
    (value.riskLevel === "low" || value.riskLevel === "medium" || value.riskLevel === "high") &&
    Array.isArray(value.warnings) &&
    Array.isArray(value.trace)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
```

- [ ] **Step 4: Run plan store test to verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/vitest run tests/v2-plan-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/v2/plan-store.ts tests/v2-plan-store.test.ts
git commit -m "feat: add v2 plan store"
```

## Task 4: Add v2 Registry Store

**Files:**
- Create: `src/v2/registry.ts`
- Test: `tests/v2-registry.test.ts`

- [ ] **Step 1: Add failing registry tests**

Create `tests/v2-registry.test.ts` with:

```ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { V2WorkflowRegistry } from "../src/v2/registry.js"
import type { V2RegistryRecord } from "../src/v2/types.js"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ocn8n-v2-registry-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function registryPath(): string {
  return path.join(dir, ".opencode", "n8n-v2", "registry", "workflows.json")
}

function record(overrides: Partial<V2RegistryRecord> = {}): V2RegistryRecord {
  return {
    workflowId: "wf_1",
    name: "Orders",
    url: "https://demo/workflow/wf_1",
    baseUrl: "https://demo/api/v1",
    claimMode: "full",
    activeAtClaim: false,
    managedBy: "opencode-n8n-builder-v2",
    managedByVersion: "2.0.0",
    latestPlanId: "123e4567-e89b-12d3-a456-426614174000",
    latestPlanVersion: 1,
    latestWorkflowHash: "workflow_hash",
    lastUpdatedAt: "2026-06-11T00:00:00.000Z",
    ...overrides,
  }
}

describe("V2WorkflowRegistry", () => {
  it("saves, replaces, sorts, and reads v2 records", async () => {
    const registry = new V2WorkflowRegistry(registryPath())

    await registry.upsert(record({ workflowId: "wf_b", name: "Orders" }))
    await registry.upsert(record({ workflowId: "wf_a", name: "Orders" }))
    await registry.upsert(record({ workflowId: "wf_b", name: "Invoices", claimMode: "read_only" }))

    expect(await registry.get("wf_b")).toMatchObject({
      workflowId: "wf_b",
      name: "Invoices",
      claimMode: "read_only",
    })
    expect((await registry.list()).map((item) => item.workflowId)).toEqual(["wf_b", "wf_a"])

    const raw = await readFile(registryPath(), "utf8")
    expect(raw.endsWith("\n")).toBe(true)
    expect(JSON.parse(raw).workflows).toHaveLength(2)
  })

  it("reads missing, malformed, and v1 registry files as empty", async () => {
    const registry = new V2WorkflowRegistry(registryPath())
    expect(await registry.list()).toEqual([])

    await mkdir(path.dirname(registryPath()), { recursive: true })
    await writeFile(registryPath(), "not json", "utf8")
    expect(await registry.list()).toEqual([])

    await writeFile(
      registryPath(),
      JSON.stringify({
        workflows: [
          {
            workflowId: "wf_1",
            managedBy: "opencode-n8n-builder",
          },
        ],
      }),
      "utf8",
    )
    expect(await registry.list()).toEqual([])
  })
})
```

- [ ] **Step 2: Run registry test to verify failure**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/vitest run tests/v2-registry.test.ts
```

Expected: FAIL because `src/v2/registry.ts` does not exist.

- [ ] **Step 3: Implement v2 registry**

Create `src/v2/registry.ts` with:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { V2RegistryRecord } from "./types.js"

type V2RegistryFile = {
  workflows: V2RegistryRecord[]
}

export class V2WorkflowRegistry {
  constructor(private readonly filePath: string) {}

  async list(): Promise<V2RegistryRecord[]> {
    return (await this.read()).workflows
  }

  async get(workflowId: string): Promise<V2RegistryRecord | undefined> {
    return (await this.list()).find((record) => record.workflowId === workflowId)
  }

  async upsert(record: V2RegistryRecord): Promise<void> {
    const file = await this.read()
    const workflows = file.workflows.filter((item) => item.workflowId !== record.workflowId)
    workflows.push(record)
    workflows.sort(
      (a, b) => a.name.localeCompare(b.name) || a.workflowId.localeCompare(b.workflowId),
    )

    await this.write({ workflows })
  }

  private async read(): Promise<V2RegistryFile> {
    try {
      const raw = await readFile(this.filePath, "utf8")
      const parsed: unknown = JSON.parse(raw)

      return isV2RegistryFile(parsed) ? { workflows: parsed.workflows } : { workflows: [] }
    } catch {
      return { workflows: [] }
    }
  }

  private async write(file: V2RegistryFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`, "utf8")
  }
}

function isV2RegistryFile(value: unknown): value is V2RegistryFile {
  return isRecord(value) && Array.isArray(value.workflows) && value.workflows.every(isV2RegistryRecord)
}

function isV2RegistryRecord(value: unknown): value is V2RegistryRecord {
  return (
    isRecord(value) &&
    typeof value.workflowId === "string" &&
    typeof value.name === "string" &&
    typeof value.url === "string" &&
    typeof value.baseUrl === "string" &&
    (value.claimMode === "full" || value.claimMode === "read_only") &&
    typeof value.activeAtClaim === "boolean" &&
    value.managedBy === "opencode-n8n-builder-v2" &&
    typeof value.managedByVersion === "string" &&
    (value.latestPlanId === undefined || typeof value.latestPlanId === "string") &&
    (value.latestPlanVersion === undefined || typeof value.latestPlanVersion === "number") &&
    (value.latestWorkflowHash === undefined || typeof value.latestWorkflowHash === "string") &&
    (value.latestPreviewId === undefined || typeof value.latestPreviewId === "string") &&
    (value.lastValidationStatus === undefined ||
      value.lastValidationStatus === "passed" ||
      value.lastValidationStatus === "failed" ||
      value.lastValidationStatus === "warning") &&
    typeof value.lastUpdatedAt === "string"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
```

- [ ] **Step 4: Run registry test to verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/vitest run tests/v2-registry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/v2/registry.ts tests/v2-registry.test.ts
git commit -m "feat: add v2 workflow registry"
```

## Task 5: Add Local v2 Plan Service

**Files:**
- Create: `src/v2/plan-service.ts`
- Test: `tests/v2-plan-service.test.ts`

- [ ] **Step 1: Add failing plan service tests**

Create `tests/v2-plan-service.test.ts` with:

```ts
import { describe, expect, it } from "vitest"
import {
  createInitialV2Plan,
  patchV2Plan,
  reviewV2Plan,
  validateAndSimulateV2Plan,
} from "../src/v2/plan-service.js"

describe("v2 plan service foundation", () => {
  it("creates a deterministic initial plan with trigger and output patterns", () => {
    const plan = createInitialV2Plan({
      prompt: "Receive an order webhook and return accepted true",
      name: "Order intake",
    })

    expect(plan.intent.goal).toBe("Receive an order webhook and return accepted true")
    expect(plan.patterns.map((pattern) => pattern.family)).toEqual(["trigger", "output"])
    expect(plan.testContract.examples).toEqual([
      {
        name: "default sample",
        input: { sample: true },
        expectedOutput: { accepted: true },
      },
    ])
    expect(plan.confidence).toBe("medium")
  })

  it("reviews plan decisions and simulation coverage", () => {
    const plan = createInitialV2Plan({ prompt: "Create a webhook workflow" })
    const review = reviewV2Plan({
      planId: "123e4567-e89b-12d3-a456-426614174000",
      planVersion: 1,
      plan,
    })

    expect(review.summary).toContain("2 pattern")
    expect(review.patternReviews).toHaveLength(2)
    expect(review.simulationCoverage).toContain("1 example(s) available for control-flow and field-flow checks.")
  })

  it("patches a plan by appending trace and warning metadata", () => {
    const plan = createInitialV2Plan({ prompt: "Create a webhook workflow" })
    const patched = patchV2Plan({
      plan,
      patch: "Add fallback notification when validation fails",
    })

    expect(patched.trace.at(-1)).toBe("Patch request: Add fallback notification when validation fails")
    expect(patched.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "PATCH_REQUIRES_REVALIDATION",
        }),
      ]),
    )
  })

  it("validates required plan structure and simulates sample paths", () => {
    const plan = createInitialV2Plan({ prompt: "Create a webhook workflow" })
    const result = validateAndSimulateV2Plan({
      planId: "123e4567-e89b-12d3-a456-426614174000",
      planVersion: 1,
      plan,
      checkedAt: "2026-06-11T00:00:00.000Z",
    })

    expect(result.status).toBe("passed")
    expect(result.issues).toEqual([])
    expect(result.sampleResults).toEqual([
      {
        name: "default sample",
        status: "passed",
        path: ["step_trigger", "step_output"],
      },
    ])
  })

  it("returns validation errors when required structures are missing", () => {
    const plan = createInitialV2Plan({ prompt: "Create a webhook workflow" })
    const result = validateAndSimulateV2Plan({
      planId: "123e4567-e89b-12d3-a456-426614174000",
      planVersion: 1,
      plan: { ...plan, outputs: [], testContract: { examples: [], edgeCases: [] } },
      checkedAt: "2026-06-11T00:00:00.000Z",
    })

    expect(result.status).toBe("failed")
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "V2_OUTPUT_REQUIRED",
      "V2_TEST_EXAMPLE_REQUIRED",
    ])
  })
})
```

- [ ] **Step 2: Run plan service test to verify failure**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/vitest run tests/v2-plan-service.test.ts
```

Expected: FAIL because `src/v2/plan-service.ts` does not exist.

- [ ] **Step 3: Implement local plan service**

Create `src/v2/plan-service.ts` with:

```ts
import type { V2Plan, V2PlanReview, V2SimulationResult, V2ValidationIssue, V2Warning } from "./types.js"

export type CreateInitialV2PlanInput = {
  prompt: string
  name?: string
}

export type ReviewV2PlanInput = {
  planId: string
  planVersion: number
  plan: V2Plan
}

export type PatchV2PlanInput = {
  plan: V2Plan
  patch: string
}

export type ValidateAndSimulateV2PlanInput = {
  planId: string
  planVersion: number
  plan: V2Plan
  checkedAt: string
}

export function createInitialV2Plan(input: CreateInitialV2PlanInput): V2Plan {
  const goal = input.prompt.trim()

  return {
    intent: {
      goal,
      scope: [input.name ?? "Generated workflow preview"],
      nonGoals: ["active workflow structural editing"],
    },
    inputs: [
      {
        id: "input_webhook",
        mode: "webhook",
        schema: { sample: "boolean" },
        samples: [{ sample: true }],
      },
    ],
    entities: [{ name: "Payload", fields: { sample: "boolean" } }],
    steps: [
      {
        id: "step_trigger",
        name: "Receive input",
        summary: "Receive the incoming automation input.",
        patternIds: ["pattern_trigger"],
        inputRefs: ["input_webhook"],
        outputRefs: ["Payload"],
      },
      {
        id: "step_output",
        name: "Return output",
        summary: "Return an acknowledgement output.",
        patternIds: ["pattern_output"],
        inputRefs: ["Payload"],
        outputRefs: ["output_response"],
      },
    ],
    patterns: [
      {
        id: "pattern_trigger",
        family: "trigger",
        variant: "webhook",
        summary: "Receive an input payload.",
        confidence: "medium",
        riskLevel: "low",
        warnings: [],
      },
      {
        id: "pattern_output",
        family: "output",
        variant: "respond_to_webhook",
        summary: "Return a response to the caller.",
        confidence: "medium",
        riskLevel: "low",
        warnings: [],
      },
    ],
    branches: [],
    loops: [],
    externalCalls: [],
    errorPolicy: { strategy: "fail_fast", notifications: [] },
    outputs: [
      {
        id: "output_response",
        mode: "respond_to_webhook",
        contract: { accepted: "boolean" },
      },
    ],
    testContract: {
      examples: [
        {
          name: "default sample",
          input: { sample: true },
          expectedOutput: { accepted: true },
        },
      ],
      edgeCases: [],
    },
    credentialRequirements: [],
    confidence: "medium",
    riskLevel: "low",
    warnings: [],
    trace: [`Created foundation v2 plan from prompt: ${goal}`],
  }
}

export function reviewV2Plan(input: ReviewV2PlanInput): V2PlanReview {
  return {
    planId: input.planId,
    planVersion: input.planVersion,
    summary: `Plan contains ${input.plan.patterns.length} pattern(s), ${input.plan.steps.length} step(s), and ${input.plan.testContract.examples.length} example(s).`,
    patternReviews: input.plan.patterns.map((pattern) => ({
      patternId: pattern.id,
      family: pattern.family,
      decision: pattern.summary,
      confidence: pattern.confidence,
      riskLevel: pattern.riskLevel,
    })),
    assumptions: input.plan.trace,
    risks: input.plan.warnings.map((warning) => warning.message),
    openQuestions: input.plan.confidence === "low" ? ["Plan confidence is low; review required before compile."] : [],
    simulationCoverage: [
      `${input.plan.testContract.examples.length} example(s) available for control-flow and field-flow checks.`,
    ],
    confidence: input.plan.confidence,
    riskLevel: input.plan.riskLevel,
  }
}

export function patchV2Plan(input: PatchV2PlanInput): V2Plan {
  const warning: V2Warning = {
    code: "PATCH_REQUIRES_REVALIDATION",
    message: "Plan was patched and must be validated and simulated before compile.",
  }

  return {
    ...input.plan,
    confidence: input.plan.confidence === "high" ? "medium" : input.plan.confidence,
    warnings: [...input.plan.warnings, warning],
    trace: [...input.plan.trace, `Patch request: ${input.patch.trim()}`],
  }
}

export function validateAndSimulateV2Plan(input: ValidateAndSimulateV2PlanInput): V2SimulationResult {
  const issues = validatePlan(input.plan)
  const status: V2SimulationResult["status"] =
    issues.some((issue) => issue.severity === "error") ? "failed" : issues.length > 0 ? "warning" : "passed"

  return {
    planId: input.planId,
    planVersion: input.planVersion,
    status,
    checkedAt: input.checkedAt,
    issues,
    sampleResults:
      status === "failed"
        ? []
        : input.plan.testContract.examples.map((example) => ({
            name: example.name,
            status: "passed",
            path: input.plan.steps.map((step) => step.id),
          })),
    fieldTraces:
      status === "failed"
        ? []
        : input.plan.entities.flatMap((entity) =>
            Object.keys(entity.fields).map((field) => ({
              field,
              source: entity.name,
              target: input.plan.outputs[0]?.id ?? "unknown",
            })),
          ),
  }
}

function validatePlan(plan: V2Plan): V2ValidationIssue[] {
  const issues: V2ValidationIssue[] = []

  if (plan.inputs.length === 0) {
    issues.push({
      code: "V2_INPUT_REQUIRED",
      message: "Plan requires at least one input.",
      severity: "error",
    })
  }
  if (plan.steps.length === 0) {
    issues.push({
      code: "V2_STEP_REQUIRED",
      message: "Plan requires at least one business step.",
      severity: "error",
    })
  }
  if (plan.patterns.length === 0) {
    issues.push({
      code: "V2_PATTERN_REQUIRED",
      message: "Plan requires at least one pattern.",
      severity: "error",
    })
  }
  if (plan.outputs.length === 0) {
    issues.push({
      code: "V2_OUTPUT_REQUIRED",
      message: "Plan requires at least one output.",
      severity: "error",
    })
  }
  if (plan.testContract.examples.length === 0) {
    issues.push({
      code: "V2_TEST_EXAMPLE_REQUIRED",
      message: "Plan requires at least one test example for simulation.",
      severity: "error",
    })
  }

  return issues
}
```

- [ ] **Step 4: Run plan service test to verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/vitest run tests/v2-plan-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/v2/plan-service.ts tests/v2-plan-service.test.ts
git commit -m "feat: add v2 plan service foundation"
```

## Task 6: Add v2 Local Tool Modules

**Files:**
- Create: `src/tools/v2-create-plan.ts`
- Create: `src/tools/v2-review-plan.ts`
- Create: `src/tools/v2-patch-plan.ts`
- Create: `src/tools/v2-validate-simulate.ts`
- Test: `tests/v2-tools.test.ts`

- [ ] **Step 1: Add failing tool orchestration tests**

Create `tests/v2-tools.test.ts` with:

```ts
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createV2Plan } from "../src/tools/v2-create-plan.js"
import { patchV2PlanTool } from "../src/tools/v2-patch-plan.js"
import { reviewV2PlanTool } from "../src/tools/v2-review-plan.js"
import { validateSimulateV2Plan } from "../src/tools/v2-validate-simulate.js"
import { V2PlanStore } from "../src/v2/plan-store.js"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ocn8n-v2-tools-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function store(): V2PlanStore {
  return new V2PlanStore(path.join(dir, ".opencode", "n8n-v2", "plans"))
}

describe("v2 local plan tools", () => {
  it("creates, reviews, patches, and validates plan artifacts", async () => {
    const planStore = store()
    const created = await createV2Plan({
      args: {
        prompt: "Receive an order webhook and return accepted true",
        name: "Order intake",
      },
      planStore,
      now: () => new Date("2026-06-11T00:00:00.000Z"),
    })

    expect(created.planVersion).toBe(1)
    expect(created.confidence).toBe("medium")

    const reviewed = await reviewV2PlanTool({
      args: {
        planId: created.planId,
        planVersion: created.planVersion,
      },
      planStore,
    })
    expect(reviewed.summary).toContain("2 pattern")

    const patched = await patchV2PlanTool({
      args: {
        planId: created.planId,
        planVersion: created.planVersion,
        patch: "Add fallback notification",
      },
      planStore,
      now: () => new Date("2026-06-11T00:05:00.000Z"),
    })
    expect(patched.planVersion).toBe(2)
    expect(patched.parentPlanVersion).toBe(1)

    const simulated = await validateSimulateV2Plan({
      args: {
        planId: created.planId,
        planVersion: patched.planVersion,
      },
      planStore,
      now: () => new Date("2026-06-11T00:06:00.000Z"),
    })
    expect(simulated.status).toBe("passed")
  })

  it("throws typed errors when plan versions are missing", async () => {
    await expect(
      reviewV2PlanTool({
        args: {
          planId: "123e4567-e89b-12d3-a456-426614174000",
          planVersion: 1,
        },
        planStore: store(),
      }),
    ).rejects.toMatchObject({
      code: "V2_PLAN_NOT_FOUND",
    })
  })
})
```

- [ ] **Step 2: Run tool tests to verify failure**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/vitest run tests/v2-tools.test.ts
```

Expected: FAIL because the v2 tool modules do not exist.

- [ ] **Step 3: Implement create plan tool module**

Create `src/tools/v2-create-plan.ts` with:

```ts
import { createInitialV2Plan } from "../v2/plan-service.js"
import type { V2PlanStore } from "../v2/plan-store.js"
import type { V2Confidence, V2RiskLevel, V2Warning } from "../v2/types.js"

export type V2CreatePlanArgs = {
  prompt: string
  name?: string
}

export type V2CreatePlanResult = {
  planId: string
  planVersion: number
  summary: string
  patternCount: number
  confidence: V2Confidence
  riskLevel: V2RiskLevel
  warnings: V2Warning[]
}

export async function createV2Plan(input: {
  args: V2CreatePlanArgs
  planStore: V2PlanStore
  now?: () => Date
}): Promise<V2CreatePlanResult> {
  const now = input.now ?? (() => new Date())
  const plan = createInitialV2Plan(input.args)
  const version = await input.planStore.saveInitial({
    plan,
    createdAt: now().toISOString(),
    summary: `Created v2 plan for: ${input.args.prompt.trim()}`,
  })

  return {
    planId: version.planId,
    planVersion: version.planVersion,
    summary: version.summary,
    patternCount: version.plan.patterns.length,
    confidence: version.plan.confidence,
    riskLevel: version.plan.riskLevel,
    warnings: version.plan.warnings,
  }
}
```

- [ ] **Step 4: Implement review plan tool module**

Create `src/tools/v2-review-plan.ts` with:

```ts
import { N8nBuilderError } from "../errors.js"
import { reviewV2Plan } from "../v2/plan-service.js"
import type { V2PlanStore } from "../v2/plan-store.js"
import type { V2PlanReview } from "../v2/types.js"

export type V2ReviewPlanArgs = {
  planId: string
  planVersion: number
}

export async function reviewV2PlanTool(input: {
  args: V2ReviewPlanArgs
  planStore: V2PlanStore
}): Promise<V2PlanReview> {
  const version = await input.planStore.get(input.args.planId, input.args.planVersion)
  if (!version) {
    throw new N8nBuilderError("V2 plan version was not found.", "V2_PLAN_NOT_FOUND", {
      planId: input.args.planId,
      planVersion: input.args.planVersion,
    })
  }

  return reviewV2Plan(version)
}
```

- [ ] **Step 5: Implement patch plan tool module**

Create `src/tools/v2-patch-plan.ts` with:

```ts
import { N8nBuilderError } from "../errors.js"
import { patchV2Plan } from "../v2/plan-service.js"
import type { V2PlanStore } from "../v2/plan-store.js"
import type { V2Confidence, V2RiskLevel, V2Warning } from "../v2/types.js"

export type V2PatchPlanArgs = {
  planId: string
  planVersion: number
  patch: string
}

export type V2PatchPlanResult = {
  planId: string
  planVersion: number
  parentPlanVersion: number
  summary: string
  confidence: V2Confidence
  riskLevel: V2RiskLevel
  warnings: V2Warning[]
}

export async function patchV2PlanTool(input: {
  args: V2PatchPlanArgs
  planStore: V2PlanStore
  now?: () => Date
}): Promise<V2PatchPlanResult> {
  const now = input.now ?? (() => new Date())
  const version = await input.planStore.get(input.args.planId, input.args.planVersion)
  if (!version) {
    throw new N8nBuilderError("V2 plan version was not found.", "V2_PLAN_NOT_FOUND", {
      planId: input.args.planId,
      planVersion: input.args.planVersion,
    })
  }

  const patchedPlan = patchV2Plan({ plan: version.plan, patch: input.args.patch })
  const saved = await input.planStore.saveNext({
    planId: version.planId,
    parentPlanVersion: version.planVersion,
    plan: patchedPlan,
    createdAt: now().toISOString(),
    summary: `Patched v2 plan: ${input.args.patch.trim()}`,
  })

  return {
    planId: saved.planId,
    planVersion: saved.planVersion,
    parentPlanVersion: version.planVersion,
    summary: saved.summary,
    confidence: saved.plan.confidence,
    riskLevel: saved.plan.riskLevel,
    warnings: saved.plan.warnings,
  }
}
```

- [ ] **Step 6: Implement validate/simulate tool module**

Create `src/tools/v2-validate-simulate.ts` with:

```ts
import { N8nBuilderError } from "../errors.js"
import { validateAndSimulateV2Plan } from "../v2/plan-service.js"
import type { V2PlanStore } from "../v2/plan-store.js"
import type { V2SimulationResult } from "../v2/types.js"

export type V2ValidateSimulateArgs = {
  planId: string
  planVersion: number
}

export async function validateSimulateV2Plan(input: {
  args: V2ValidateSimulateArgs
  planStore: V2PlanStore
  now?: () => Date
}): Promise<V2SimulationResult> {
  const now = input.now ?? (() => new Date())
  const version = await input.planStore.get(input.args.planId, input.args.planVersion)
  if (!version) {
    throw new N8nBuilderError("V2 plan version was not found.", "V2_PLAN_NOT_FOUND", {
      planId: input.args.planId,
      planVersion: input.args.planVersion,
    })
  }

  return validateAndSimulateV2Plan({
    planId: version.planId,
    planVersion: version.planVersion,
    plan: version.plan,
    checkedAt: now().toISOString(),
  })
}
```

- [ ] **Step 7: Run tool tests to verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/vitest run tests/v2-tools.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/tools/v2-create-plan.ts src/tools/v2-review-plan.ts src/tools/v2-patch-plan.ts src/tools/v2-validate-simulate.ts tests/v2-tools.test.ts
git commit -m "feat: add v2 local plan tools"
```

## Task 7: Wire v2 Local Tools Into Plugin

**Files:**
- Modify: `src/plugin.ts`
- Test: `tests/plugin.test.ts`

- [ ] **Step 1: Add failing plugin registration tests**

In `tests/plugin.test.ts`, update `it("registers the six n8n tools", ...)` by renaming it to:

```ts
  it("registers v1 tools and v2 foundation tools", async () => {
```

Replace the `Object.keys(result.tool ?? {})` assertion with:

```ts
    expect(Object.keys(result.tool ?? {})).toEqual([
      "n8n_build_workflow",
      "n8n_update_workflow",
      "n8n_claim_workflow",
      "n8n_check_workflow_readiness",
      "n8n_inspect_workflow",
      "n8n_list_managed_workflows",
      "n8n_v2_create_plan",
      "n8n_v2_review_plan",
      "n8n_v2_patch_plan",
      "n8n_v2_validate_simulate",
    ])
```

Add these argument assertions after the current v1 assertions:

```ts
    expect(Object.keys(result.tool?.n8n_v2_create_plan.args ?? {})).toEqual(["prompt", "name"])
    expect(Object.keys(result.tool?.n8n_v2_review_plan.args ?? {})).toEqual(["planId", "planVersion"])
    expect(Object.keys(result.tool?.n8n_v2_patch_plan.args ?? {})).toEqual(["planId", "planVersion", "patch"])
    expect(Object.keys(result.tool?.n8n_v2_validate_simulate.args ?? {})).toEqual(["planId", "planVersion"])
```

Add this new test after the list-managed-workflows test:

```ts
  it("runs v2 local plan tools without n8n API or MCP configuration", async () => {
    await withoutN8nEnv(async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "ocn8n-plugin-v2-"))
      const plugin = createN8nBuilderPlugin({ version: "2.0.0" })
      const result = await plugin(mockPluginInput({ directory, opencodeConfig: {} }))

      const created = parseToolOutput(
        await result.tool?.n8n_v2_create_plan.execute(
          { prompt: "Receive an order webhook", name: "Order intake" },
          {} as never,
        ),
      ) as { planId: string; planVersion: number }
      expect(created.planVersion).toBe(1)

      const reviewed = parseToolOutput(
        await result.tool?.n8n_v2_review_plan.execute(
          { planId: created.planId, planVersion: created.planVersion },
          {} as never,
        ),
      ) as { summary: string }
      expect(reviewed.summary).toContain("pattern")
    })
  })
```

- [ ] **Step 2: Run plugin tests to verify failure**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/vitest run tests/plugin.test.ts
```

Expected: FAIL because the plugin does not register v2 tools.

- [ ] **Step 3: Add imports and v2 local deps**

In `src/plugin.ts`, add imports:

```ts
import { createV2Plan } from "./tools/v2-create-plan.js"
import { patchV2PlanTool } from "./tools/v2-patch-plan.js"
import { reviewV2PlanTool } from "./tools/v2-review-plan.js"
import { validateSimulateV2Plan } from "./tools/v2-validate-simulate.js"
import { V2PlanStore } from "./v2/plan-store.js"
```

Inside `localDeps`, add `v2PlanStore` to the returned object:

```ts
        v2PlanStore: new V2PlanStore(config.v2.plansDir),
```

- [ ] **Step 4: Register v2 tools**

In the returned `tool` object in `src/plugin.ts`, after `n8n_list_managed_workflows`, add:

```ts

        n8n_v2_create_plan: tool({
          description:
            "Create a v2 business workflow plan artifact without connecting to n8n.",
          args: {
            prompt: tool.schema.string().min(1),
            name: tool.schema.string().optional(),
          },
          async execute(args) {
            const resolved = await localDeps()
            const result = await createV2Plan({
              args,
              planStore: resolved.v2PlanStore,
            })

            return jsonOutput("v2 n8n workflow plan created", result)
          },
        }),

        n8n_v2_review_plan: tool({
          description:
            "Explain and review a stored v2 business workflow plan version.",
          args: {
            planId: tool.schema.string().min(1),
            planVersion: tool.schema.number().int().min(1),
          },
          async execute(args) {
            const resolved = await localDeps()
            const result = await reviewV2PlanTool({
              args,
              planStore: resolved.v2PlanStore,
            })

            return jsonOutput("v2 n8n workflow plan review", result)
          },
        }),

        n8n_v2_patch_plan: tool({
          description:
            "Patch a stored v2 business workflow plan and save a new plan version.",
          args: {
            planId: tool.schema.string().min(1),
            planVersion: tool.schema.number().int().min(1),
            patch: tool.schema.string().min(1),
          },
          async execute(args) {
            const resolved = await localDeps()
            const result = await patchV2PlanTool({
              args,
              planStore: resolved.v2PlanStore,
            })

            return jsonOutput("v2 n8n workflow plan patched", result)
          },
        }),

        n8n_v2_validate_simulate: tool({
          description:
            "Run foundation v2 validation and sample simulation for a stored plan version.",
          args: {
            planId: tool.schema.string().min(1),
            planVersion: tool.schema.number().int().min(1),
          },
          async execute(args) {
            const resolved = await localDeps()
            const result = await validateSimulateV2Plan({
              args,
              planStore: resolved.v2PlanStore,
            })

            return jsonOutput("v2 n8n workflow plan validation and simulation", result)
          },
        }),
```

- [ ] **Step 5: Run plugin tests to verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/vitest run tests/plugin.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/plugin.ts tests/plugin.test.ts
git commit -m "feat: register v2 foundation tools"
```

## Task 8: Export v2 Tool Types And Run Full Verification

**Files:**
- Modify: `src/index.ts`
- Modify: `tests/public-contract.test.ts`

- [ ] **Step 1: Add failing public contract coverage for v2 tool types**

Add these imports to `tests/public-contract.test.ts`:

```ts
  V2CreatePlanArgs,
  V2CreatePlanResult,
  V2PatchPlanArgs,
  V2PatchPlanResult,
  V2ReviewPlanArgs,
  V2ValidateSimulateArgs,
```

Inside the v2 public contract test from Task 2, add:

```ts
    const createArgs: V2CreatePlanArgs = { prompt: "Create a webhook workflow" }
    const createResult: V2CreatePlanResult = {
      planId: version.planId,
      planVersion: version.planVersion,
      summary: "Created v2 plan",
      patternCount: 2,
      confidence: "medium",
      riskLevel: "low",
      warnings: [],
    }
    const reviewArgs: V2ReviewPlanArgs = { planId: version.planId, planVersion: version.planVersion }
    const patchArgs: V2PatchPlanArgs = {
      planId: version.planId,
      planVersion: version.planVersion,
      patch: "Add fallback",
    }
    const patchResult: V2PatchPlanResult = {
      planId: version.planId,
      planVersion: 2,
      parentPlanVersion: 1,
      summary: "Patched v2 plan",
      confidence: "medium",
      riskLevel: "low",
      warnings: [],
    }
    const validateArgs: V2ValidateSimulateArgs = {
      planId: version.planId,
      planVersion: version.planVersion,
    }
```

Add those new constants to the final `expect({ ... }).toBeDefined()` object.

- [ ] **Step 2: Run public contract test to verify failure**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/vitest run tests/public-contract.test.ts
```

Expected: FAIL because v2 tool arg/result types are not exported.

- [ ] **Step 3: Export v2 tool types**

Add this export block to `src/index.ts`:

```ts
export type { V2CreatePlanArgs, V2CreatePlanResult } from "./tools/v2-create-plan.js"
export type { V2PatchPlanArgs, V2PatchPlanResult } from "./tools/v2-patch-plan.js"
export type { V2ReviewPlanArgs } from "./tools/v2-review-plan.js"
export type { V2ValidateSimulateArgs } from "./tools/v2-validate-simulate.js"
```

- [ ] **Step 4: Run public contract test to verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/vitest run tests/public-contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full default verification**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/tsc --noEmit
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/vitest run
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ./node_modules/.bin/tsup
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" /Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/check-package-files.mjs
git diff --check
```

Expected:

- `tsc --noEmit`: exit 0.
- `vitest run`: all tests pass.
- `tsup`: emits `dist/index.js` and `dist/index.d.ts`.
- `check-package-files.mjs`: prints `Package file boundary check passed.`
- `git diff --check`: no output.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts tests/public-contract.test.ts dist/index.js dist/index.js.map dist/index.d.ts
git commit -m "feat: publish v2 foundation contracts"
```

If `dist/` is not tracked or unchanged after build, stage only `src/index.ts` and `tests/public-contract.test.ts`.

## Completion Criteria

This plan is complete when:

- `loadLocalPluginConfig` exposes isolated v2 artifact paths.
- `src/v2/types.ts` defines v2 plan and artifact contracts.
- `V2PlanStore` persists redacted versioned plan artifacts under `.opencode/n8n-v2/plans`.
- `V2WorkflowRegistry` persists v2 records and rejects v1 registry shape.
- Local v2 create/review/patch/validate-simulate tool modules exist and are tested.
- Plugin registers foundation v2 local tools without requiring n8n API or MCP.
- Public package entrypoint exports v2 foundation types.
- Full default verification passes.

## Spec Coverage Notes

Covered by this plan:

- Isolated `.opencode/n8n-v2/` artifact path model.
- v2 business plan type foundation.
- v2 plan version history foundation.
- redacted plan artifact persistence.
- v2 registry isolation from v1 registry shape.
- local create/review/patch/validate-simulate primitives.
- first v2 local tool registrations.

Covered by follow-on plans:

- seven pattern family schemas and medium-depth variants.
- pattern composition validation beyond basic required-shape checks.
- control-flow and field-flow simulation engine.
- mixed compiler and mapping trace.
- workflow preview/apply safety.
- claim/import and reverse planning.
- execution-history sampling.
- opt-in trial runs.
- final removal or replacement of v1 public tools for the v2 breaking contract.
- v2 docs, migration guide, security review, and release gate.

## Follow-On Plans

After this plan lands, write separate implementation plans for:

1. Seven pattern schemas and composition validation.
2. Control-flow and field-flow simulation engine.
3. Mixed compiler and mapping trace.
4. v2 compile preview and apply safety.
5. claim/import and reverse planning.
6. opt-in trial runs.
7. final v2 public contract switch, docs, release gate, and package version bump.
