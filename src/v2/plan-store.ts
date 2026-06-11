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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
