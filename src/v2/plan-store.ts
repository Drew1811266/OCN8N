import { randomUUID } from "node:crypto"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { N8nBuilderError } from "../errors.js"
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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class V2PlanStore {
  constructor(private readonly plansDir: string) {}

  async saveInitial(input: SaveInitialV2PlanInput): Promise<V2PlanVersion> {
    const plan = sanitizePlan(input.plan)

    return this.writeVersion({
      planId: randomUUID(),
      planVersion: 1,
      plan,
      createdAt: input.createdAt,
      source: "create",
      summary: input.summary,
      contentHash: stableHash(plan),
    })
  }

  async saveReverse(input: SaveInitialV2PlanInput): Promise<V2PlanVersion> {
    const plan = sanitizePlan(input.plan)

    return this.writeVersion({
      planId: randomUUID(),
      planVersion: 1,
      plan,
      createdAt: input.createdAt,
      source: "reverse",
      summary: input.summary,
      contentHash: stableHash(plan),
    })
  }

  async saveNext(input: SaveNextV2PlanInput): Promise<V2PlanVersion> {
    if (!isSafePlanId(input.planId) || !isSafeVersion(input.parentPlanVersion)) {
      throw new N8nBuilderError("Invalid v2 plan reference.", "V2_PLAN_INVALID", {
        planId: input.planId,
        parentPlanVersion: input.parentPlanVersion,
      })
    }

    const latest = await this.latest(input.planId)
    if (!latest || latest.planVersion !== input.parentPlanVersion) {
      throw new N8nBuilderError("Invalid v2 plan parent version.", "V2_PLAN_INVALID", {
        planId: input.planId,
        parentPlanVersion: input.parentPlanVersion,
        latestPlanVersion: latest?.planVersion,
      })
    }

    const plan = sanitizePlan(input.plan)
    const nextVersion = input.parentPlanVersion + 1

    return this.writeVersion({
      planId: input.planId,
      planVersion: nextVersion,
      plan,
      createdAt: input.createdAt,
      source: "patch",
      summary: input.summary,
      contentHash: stableHash(plan),
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

      return isV2PlanVersion(parsed) &&
        parsed.planId === planId &&
        parsed.planVersion === planVersion &&
        parsed.contentHash === stableHash(parsed.plan)
        ? parsed
        : undefined
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
    const plan = sanitizePlan(version.plan)
    const persistedVersion: V2PlanVersion = {
      ...version,
      plan,
      summary: sanitizeSummary(version.summary),
      contentHash: stableHash(plan),
    }
    const filePath = this.versionPath(version.planId, version.planVersion)

    await mkdir(path.dirname(filePath), { recursive: true })
    try {
      await writeFile(filePath, `${JSON.stringify(persistedVersion, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      })
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") {
        throw new N8nBuilderError("V2 plan version already exists.", "V2_PLAN_VERSION_EXISTS", {
          planId: version.planId,
          planVersion: version.planVersion,
        })
      }

      throw error
    }

    return persistedVersion
  }

  private versionPath(planId: string, planVersion: number): string {
    return path.join(this.plansDir, planId, `v${planVersion}.json`)
  }
}

function sanitizePlan(plan: V2Plan): V2Plan {
  return redactSecrets(plan) as V2Plan
}

function sanitizeSummary(summary: string): string {
  const redacted = redactSecrets(summary)
  return typeof redacted === "string" ? redacted : "[REDACTED]"
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
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
    isV2PlanIntent(value.intent) &&
    isArrayOf(value.inputs, isV2PlanInput) &&
    isArrayOf(value.entities, isV2PlanEntity) &&
    isArrayOf(value.steps, isV2PlanStep) &&
    isArrayOf(value.patterns, isV2PlanPattern) &&
    isArrayOf(value.branches, isV2PlanBranch) &&
    isArrayOf(value.loops, isV2PlanLoop) &&
    isArrayOf(value.externalCalls, isV2ExternalCall) &&
    isV2ErrorPolicy(value.errorPolicy) &&
    isArrayOf(value.outputs, isV2PlanOutput) &&
    isV2TestContract(value.testContract) &&
    isArrayOf(value.credentialRequirements, isV2CredentialRequirement) &&
    isConfidence(value.confidence) &&
    isRiskLevel(value.riskLevel) &&
    isArrayOf(value.warnings, isV2Warning) &&
    isStringArray(value.trace)
  )
}

function isV2PlanIntent(value: unknown): boolean {
  return isRecord(value) && typeof value.goal === "string" && isStringArray(value.scope) && isStringArray(value.nonGoals)
}

function isV2PlanInput(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isOneOf(value.mode, ["webhook", "schedule", "manual", "polling"]) &&
    isRecordOfString(value.schema) &&
    isArrayOf(value.samples, isRecord)
  )
}

function isV2PlanEntity(value: unknown): boolean {
  return isRecord(value) && typeof value.name === "string" && isRecordOfString(value.fields)
}

function isV2PlanStep(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.summary === "string" &&
    isStringArray(value.patternIds) &&
    isStringArray(value.inputRefs) &&
    isStringArray(value.outputRefs)
  )
}

function isV2PlanPattern(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isOneOf(value.family, ["trigger", "transform", "branch", "loop_batch", "error_handling", "external_call", "output"]) &&
    typeof value.variant === "string" &&
    typeof value.summary === "string" &&
    isConfidence(value.confidence) &&
    isRiskLevel(value.riskLevel) &&
    isArrayOf(value.warnings, isV2Warning)
  )
}

function isV2PlanBranch(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.sourceStepId === "string" &&
    typeof value.condition === "string" &&
    typeof value.targetStepId === "string" &&
    (value.isDefault === undefined || typeof value.isDefault === "boolean")
  )
}

function isV2PlanLoop(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.sourceStepId === "string" &&
    isOneOf(value.mode, ["pagination", "batch", "per_item"]) &&
    typeof value.maxIterations === "number" &&
    Number.isFinite(value.maxIterations) &&
    typeof value.termination === "string"
  )
}

function isV2ExternalCall(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.stepId === "string" &&
    typeof value.service === "string" &&
    typeof value.operation === "string" &&
    (value.credentialRequirementId === undefined || typeof value.credentialRequirementId === "string") &&
    isRecordOfString(value.requestContract) &&
    (value.responseContract === undefined || isRecordOfString(value.responseContract)) &&
    isOneOf(value.responseContractSource, ["user", "docs", "inferred", "missing"])
  )
}

function isV2ErrorPolicy(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOneOf(value.strategy, ["fail_fast", "retry_then_fail", "fallback", "dead_letter"]) &&
    (value.maxAttempts === undefined || (typeof value.maxAttempts === "number" && Number.isFinite(value.maxAttempts))) &&
    isStringArray(value.notifications)
  )
}

function isV2PlanOutput(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isOneOf(value.mode, ["respond_to_webhook", "write_service", "send_notification"]) &&
    isRecordOfString(value.contract)
  )
}

function isV2TestContract(value: unknown): boolean {
  return (
    isRecord(value) && isArrayOf(value.examples, isV2TestExample) && isArrayOf(value.edgeCases, isV2TestExample)
  )
}

function isV2TestExample(value: unknown): boolean {
  return (
    isRecord(value) && typeof value.name === "string" && isRecord(value.input) && isRecord(value.expectedOutput)
  )
}

function isV2CredentialRequirement(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.service === "string" &&
    typeof value.credentialType === "string" &&
    isOneOf(value.authMode, ["api_key", "header_auth", "basic", "manual", "oauth2"]) &&
    isOneOf(value.status, ["available", "missing_env", "manual_setup", "oauth_handoff", "unknown"]) &&
    isStringArray(value.affectedStepIds) &&
    typeof value.blocksApply === "boolean"
  )
}

function isV2Warning(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    (value.stepId === undefined || typeof value.stepId === "string") &&
    (value.patternId === undefined || typeof value.patternId === "string")
  )
}

function isConfidence(value: unknown): boolean {
  return isOneOf(value, ["high", "medium", "low"])
}

function isRiskLevel(value: unknown): boolean {
  return isOneOf(value, ["low", "medium", "high"])
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString)
}

function isRecordOfString(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((child) => typeof child === "string")
}

function isArrayOf(value: unknown, guard: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(guard)
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
