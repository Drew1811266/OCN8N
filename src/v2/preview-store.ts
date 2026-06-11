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

export type V2McpValidationStatus = "not_configured" | "passed" | "warning"

export type V2WorkflowNodeDiff = {
  nodeName: string
  nodeType: string
}

export type V2NodeParameterDiff = {
  nodeName: string
  path: string
  before: unknown
  after: unknown
}

export type V2NodeCredentialDiff = {
  nodeName: string
  credentialType: string
  beforeName?: string
  afterName?: string
}

export type V2ConnectionDiff = {
  source: string
  before: unknown
  after: unknown
}

export type V2SettingDiff = {
  path: string
  before: unknown
  after: unknown
}

export type V2WorkflowDiff = {
  addedNodes: V2WorkflowNodeDiff[]
  removedNodes: V2WorkflowNodeDiff[]
  changedNodeParameters: V2NodeParameterDiff[]
  changedCredentials: V2NodeCredentialDiff[]
  changedConnections: V2ConnectionDiff[]
  changedSettings: V2SettingDiff[]
}

export type V2PreviewUpdateTarget = {
  workflowId: string
  name: string
  url: string
  currentWorkflowHash: string
  registryWorkflowHash?: string
  hasChanges: boolean
  diff: V2WorkflowDiff
}

export type V2CompiledPreview = {
  previewId: string
  planId: string
  planVersion: number
  workflow: N8nWorkflow
  workflowHash: string
  mappingTrace: V2PreviewMappingTrace[]
  validationStatus: V2SimulationResult["status"]
  mcpValidationStatus: V2McpValidationStatus
  updateTarget?: V2PreviewUpdateTarget
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
    isV2McpValidationStatus(value.mcpValidationStatus) &&
    (value.updateTarget === undefined || isV2PreviewUpdateTarget(value.updateTarget)) &&
    isArrayOf(value.warnings, isV2Warning) &&
    typeof value.createdAt === "string"
  )
}

function isV2McpValidationStatus(value: unknown): value is V2McpValidationStatus {
  return value === "not_configured" || value === "passed" || value === "warning"
}

function isV2PreviewUpdateTarget(value: unknown): value is V2PreviewUpdateTarget {
  return (
    isRecord(value) &&
    typeof value.workflowId === "string" &&
    typeof value.name === "string" &&
    typeof value.url === "string" &&
    typeof value.currentWorkflowHash === "string" &&
    (value.registryWorkflowHash === undefined || typeof value.registryWorkflowHash === "string") &&
    typeof value.hasChanges === "boolean" &&
    isV2WorkflowDiff(value.diff)
  )
}

function isV2WorkflowDiff(value: unknown): value is V2WorkflowDiff {
  return (
    isRecord(value) &&
    isArrayOf(value.addedNodes, isV2WorkflowNodeDiff) &&
    isArrayOf(value.removedNodes, isV2WorkflowNodeDiff) &&
    isArrayOf(value.changedNodeParameters, isV2NodeParameterDiff) &&
    isArrayOf(value.changedCredentials, isV2NodeCredentialDiff) &&
    isArrayOf(value.changedConnections, isV2ConnectionDiff) &&
    isArrayOf(value.changedSettings, isV2SettingDiff)
  )
}

function isV2WorkflowNodeDiff(value: unknown): value is V2WorkflowNodeDiff {
  return isRecord(value) && typeof value.nodeName === "string" && typeof value.nodeType === "string"
}

function isV2NodeParameterDiff(value: unknown): value is V2NodeParameterDiff {
  return (
    isRecord(value) &&
    typeof value.nodeName === "string" &&
    typeof value.path === "string" &&
    Object.hasOwn(value, "before") &&
    Object.hasOwn(value, "after")
  )
}

function isV2NodeCredentialDiff(value: unknown): value is V2NodeCredentialDiff {
  return (
    isRecord(value) &&
    typeof value.nodeName === "string" &&
    typeof value.credentialType === "string" &&
    (value.beforeName === undefined || typeof value.beforeName === "string") &&
    (value.afterName === undefined || typeof value.afterName === "string")
  )
}

function isV2ConnectionDiff(value: unknown): value is V2ConnectionDiff {
  return (
    isRecord(value) &&
    typeof value.source === "string" &&
    Object.hasOwn(value, "before") &&
    Object.hasOwn(value, "after")
  )
}

function isV2SettingDiff(value: unknown): value is V2SettingDiff {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    Object.hasOwn(value, "before") &&
    Object.hasOwn(value, "after")
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
