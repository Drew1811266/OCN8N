import { randomUUID } from "node:crypto"
import path from "node:path"
import { N8nBuilderError } from "../errors.js"
import { redactSecrets } from "../security.js"
import { isStorageAlreadyExistsError, V2FileArtifactStorage, type V2ArtifactStorage } from "./storage.js"
import type { V2SimulationResult, V2ValidationIssue, V2Warning } from "./types.js"

export type V2TrialRunMode = "dry_run"
export type V2TrialExecutionMode = "not_triggered"

export type V2TrialRunArtifact = {
  runId: string
  mode: V2TrialRunMode
  previewId: string
  planId: string
  planVersion: number
  workflowHash: string
  status: V2SimulationResult["status"]
  triggered: boolean
  executionMode: V2TrialExecutionMode
  cleanupRequired: boolean
  simulation: V2SimulationResult
  sampleName?: string
  warnings: V2Warning[]
  provenance: string[]
  startedAt: string
  completedAt: string
  summary: string
}

export type SaveV2TrialRunArtifactInput = Omit<V2TrialRunArtifact, "runId">

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class V2RunStore {
  constructor(
    private readonly runsDir: string,
    private readonly createId: () => string = randomUUID,
    private readonly storage: V2ArtifactStorage = new V2FileArtifactStorage(),
  ) {}

  async save(input: SaveV2TrialRunArtifactInput): Promise<V2TrialRunArtifact> {
    const sanitized = redactSecrets(input) as SaveV2TrialRunArtifactInput
    const run: V2TrialRunArtifact = {
      ...sanitized,
      runId: this.createId(),
    }
    const filePath = this.filePath(run.runId)

    try {
      await this.storage.writeText(filePath, `${JSON.stringify(run, null, 2)}\n`, { exclusive: true })
    } catch (error) {
      if (isStorageAlreadyExistsError(error)) {
        throw new N8nBuilderError("V2 trial run artifact already exists.", "V2_RUN_EXISTS", {
          runId: run.runId,
        })
      }

      throw error
    }

    return run
  }

  async get(runId: string): Promise<V2TrialRunArtifact | undefined> {
    if (!isSafeRunId(runId)) {
      return undefined
    }

    try {
      const raw = await this.storage.readText(this.filePath(runId))
      if (raw === undefined) return undefined
      const parsed: unknown = JSON.parse(raw)

      return isV2TrialRunArtifact(parsed) && parsed.runId === runId ? parsed : undefined
    } catch {
      return undefined
    }
  }

  private filePath(runId: string): string {
    return path.join(this.runsDir, `${runId}.json`)
  }
}

function isSafeRunId(runId: string): boolean {
  return uuidPattern.test(runId)
}

function isV2TrialRunArtifact(value: unknown): value is V2TrialRunArtifact {
  return (
    isRecord(value) &&
    typeof value.runId === "string" &&
    isSafeRunId(value.runId) &&
    value.mode === "dry_run" &&
    typeof value.previewId === "string" &&
    isSafeRunId(value.previewId) &&
    typeof value.planId === "string" &&
    isSafeRunId(value.planId) &&
    typeof value.planVersion === "number" &&
    Number.isInteger(value.planVersion) &&
    value.planVersion > 0 &&
    typeof value.workflowHash === "string" &&
    isSimulationStatus(value.status) &&
    typeof value.triggered === "boolean" &&
    value.executionMode === "not_triggered" &&
    typeof value.cleanupRequired === "boolean" &&
    isV2SimulationResult(value.simulation) &&
    (value.sampleName === undefined || typeof value.sampleName === "string") &&
    isArrayOf(value.warnings, isV2Warning) &&
    isStringArray(value.provenance) &&
    typeof value.startedAt === "string" &&
    typeof value.completedAt === "string" &&
    typeof value.summary === "string"
  )
}

function isV2SimulationResult(value: unknown): value is V2SimulationResult {
  return (
    isRecord(value) &&
    typeof value.planId === "string" &&
    isSafeRunId(value.planId) &&
    typeof value.planVersion === "number" &&
    Number.isInteger(value.planVersion) &&
    value.planVersion > 0 &&
    isSimulationStatus(value.status) &&
    typeof value.checkedAt === "string" &&
    isArrayOf(value.issues, isV2ValidationIssue) &&
    isArrayOf(value.sampleResults, isV2SampleResult) &&
    isArrayOf(value.fieldTraces, isV2FieldTrace)
  )
}

function isV2ValidationIssue(value: unknown): value is V2ValidationIssue {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    (value.severity === "error" || value.severity === "warning") &&
    (value.stepId === undefined || typeof value.stepId === "string") &&
    (value.patternId === undefined || typeof value.patternId === "string")
  )
}

function isV2SampleResult(value: unknown): value is V2SimulationResult["sampleResults"][number] {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    (value.status === "passed" || value.status === "failed") &&
    isStringArray(value.path)
  )
}

function isV2FieldTrace(value: unknown): value is V2SimulationResult["fieldTraces"][number] {
  return (
    isRecord(value) &&
    typeof value.field === "string" &&
    typeof value.source === "string" &&
    typeof value.target === "string"
  )
}

function isV2Warning(value: unknown): value is V2Warning {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    (value.stepId === undefined || typeof value.stepId === "string") &&
    (value.patternId === undefined || typeof value.patternId === "string")
  )
}

function isSimulationStatus(value: unknown): value is V2SimulationResult["status"] {
  return value === "passed" || value === "failed" || value === "warning"
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(guard)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
