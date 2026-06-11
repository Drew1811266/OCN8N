import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { N8nBuilderError } from "../errors.js"
import { stableHash } from "../hash.js"
import { redactSecrets } from "../security.js"
import type { N8nWorkflow } from "../validator.js"
import type { V2SimulationResult, V2Warning } from "./types.js"

export type V2PreviewMappingTrace = {
  stepId: string
  patternIds: string[]
  nodeNames: string[]
  notes: string[]
}

export type V2CompiledPreview = {
  previewId: string
  planId: string
  planVersion: number
  workflow: N8nWorkflow
  workflowHash: string
  mappingTrace: V2PreviewMappingTrace[]
  validationStatus: V2SimulationResult["status"]
  warnings: V2Warning[]
  createdAt: string
}

export type SaveV2CompiledPreviewInput = Omit<V2CompiledPreview, "previewId" | "workflowHash">

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class V2PreviewStore {
  constructor(
    private readonly previewsDir: string,
    private readonly createId: () => string = randomUUID,
  ) {}

  async save(input: SaveV2CompiledPreviewInput): Promise<V2CompiledPreview> {
    const workflow = sanitizeWorkflow(input.workflow)
    const preview: V2CompiledPreview = {
      ...input,
      previewId: this.createId(),
      workflow,
      workflowHash: stableHash(workflow),
    }
    const filePath = this.filePath(preview.previewId)

    await mkdir(this.previewsDir, { recursive: true })
    try {
      await writeFile(filePath, `${JSON.stringify(preview, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") {
        throw new N8nBuilderError("V2 compiled preview already exists.", "V2_PREVIEW_EXISTS", {
          previewId: preview.previewId,
        })
      }

      throw error
    }

    return preview
  }

  async get(previewId: string): Promise<V2CompiledPreview | undefined> {
    if (!isSafePreviewId(previewId)) {
      return undefined
    }

    try {
      const raw = await readFile(this.filePath(previewId), "utf8")
      const parsed: unknown = JSON.parse(raw)

      return isV2CompiledPreview(parsed) &&
        parsed.previewId === previewId &&
        parsed.workflowHash === stableHash(parsed.workflow)
        ? parsed
        : undefined
    } catch {
      return undefined
    }
  }

  private filePath(previewId: string): string {
    return path.join(this.previewsDir, `${previewId}.json`)
  }
}

function sanitizeWorkflow(workflow: N8nWorkflow): N8nWorkflow {
  return redactSecrets(workflow) as N8nWorkflow
}

function isSafePreviewId(previewId: string): boolean {
  return uuidPattern.test(previewId)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

function isV2CompiledPreview(value: unknown): value is V2CompiledPreview {
  return (
    isRecord(value) &&
    typeof value.previewId === "string" &&
    isSafePreviewId(value.previewId) &&
    typeof value.planId === "string" &&
    typeof value.planVersion === "number" &&
    Number.isInteger(value.planVersion) &&
    value.planVersion > 0 &&
    isN8nWorkflowShape(value.workflow) &&
    typeof value.workflowHash === "string" &&
    isArrayOf(value.mappingTrace, isV2PreviewMappingTrace) &&
    (value.validationStatus === "passed" || value.validationStatus === "failed" || value.validationStatus === "warning") &&
    isArrayOf(value.warnings, isV2Warning) &&
    typeof value.createdAt === "string"
  )
}

function isV2PreviewMappingTrace(value: unknown): value is V2PreviewMappingTrace {
  return (
    isRecord(value) &&
    typeof value.stepId === "string" &&
    isStringArray(value.patternIds) &&
    isStringArray(value.nodeNames) &&
    isStringArray(value.notes)
  )
}

function isN8nWorkflowShape(value: unknown): value is N8nWorkflow {
  return (
    isRecord(value) &&
    (value.id === undefined || typeof value.id === "string") &&
    typeof value.name === "string" &&
    typeof value.active === "boolean" &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isN8nWorkflowNodeShape) &&
    isRecord(value.connections) &&
    typeof value.settings === "object" &&
    value.settings !== null &&
    !Array.isArray(value.settings) &&
    (value.tags === undefined || Array.isArray(value.tags)) &&
    (value.meta === undefined || isRecord(value.meta))
  )
}

function isN8nWorkflowNodeShape(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.id === undefined || typeof value.id === "string") &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.typeVersion === "number" &&
    Number.isFinite(value.typeVersion) &&
    Array.isArray(value.position) &&
    value.position.length === 2 &&
    value.position.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)) &&
    isRecord(value.parameters) &&
    (value.credentials === undefined || isRecord(value.credentials))
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(guard)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
