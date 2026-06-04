import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { N8nWorkflow, N8nWorkflowConnection, N8nWorkflowNode } from "./validator.js"

export type UpdatePreview = {
  previewId: string
  workflowId: string
  baseWorkflowHash: string
  proposedWorkflowHash: string
  summary: string
  changes: string[]
  proposedWorkflow: N8nWorkflow
  createdAt: string
  expiresAt: string
}

export type SaveUpdatePreviewInput = Omit<UpdatePreview, "previewId">

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class PreviewStore {
  constructor(private readonly directory: string) {}

  async save(input: SaveUpdatePreviewInput): Promise<UpdatePreview> {
    const preview: UpdatePreview = { ...input, previewId: randomUUID() }

    await mkdir(this.directory, { recursive: true })
    await writeFile(this.filePath(preview.previewId), `${JSON.stringify(preview, null, 2)}\n`, "utf8")

    return preview
  }

  async get(previewId: string, now = new Date()): Promise<UpdatePreview | undefined> {
    if (!uuidPattern.test(previewId)) {
      return undefined
    }

    try {
      const raw = await readFile(this.filePath(previewId), "utf8")
      const parsed: unknown = JSON.parse(raw)

      if (!isUpdatePreview(parsed)) {
        return undefined
      }

      const expiresAt = Date.parse(parsed.expiresAt)
      if (Number.isNaN(expiresAt) || expiresAt <= now.getTime()) {
        return undefined
      }

      return parsed
    } catch {
      return undefined
    }
  }

  private filePath(previewId: string): string {
    return path.join(this.directory, `${previewId}.json`)
  }
}

function isUpdatePreview(value: unknown): value is UpdatePreview {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.previewId === "string" &&
    typeof value.workflowId === "string" &&
    typeof value.baseWorkflowHash === "string" &&
    typeof value.proposedWorkflowHash === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.changes) &&
    value.changes.every((change) => typeof change === "string") &&
    isN8nWorkflowShape(value.proposedWorkflow) &&
    typeof value.createdAt === "string" &&
    typeof value.expiresAt === "string"
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
    isN8nWorkflowConnectionsShape(value.connections) &&
    isRecord(value.settings) &&
    (value.tags === undefined || isWorkflowTagsShape(value.tags)) &&
    (value.meta === undefined || isRecord(value.meta))
  )
}

function isN8nWorkflowNodeShape(value: unknown): value is N8nWorkflowNode {
  return (
    isRecord(value) &&
    (value.id === undefined || typeof value.id === "string") &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.typeVersion === "number" &&
    Number.isFinite(value.typeVersion) &&
    isPositionTuple(value.position) &&
    isRecord(value.parameters) &&
    (value.credentials === undefined || isCredentialsShape(value.credentials))
  )
}

function isWorkflowTagsShape(value: unknown): value is N8nWorkflow["tags"] {
  return (
    Array.isArray(value) &&
    value.every((tag) => typeof tag === "string" || (isRecord(tag) && typeof tag.name === "string"))
  )
}

function isCredentialsShape(value: unknown): value is N8nWorkflowNode["credentials"] {
  return isRecord(value) && Object.values(value).every(isCredentialEntryShape)
}

function isCredentialEntryShape(value: unknown): value is { id?: string; name?: string } {
  return (
    isRecord(value) &&
    (value.id === undefined || typeof value.id === "string") &&
    (value.name === undefined || typeof value.name === "string")
  )
}

function isPositionTuple(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
  )
}

function isN8nWorkflowConnectionsShape(value: unknown): value is N8nWorkflow["connections"] {
  return isRecord(value) && Object.values(value).every(isOutputMap)
}

function isOutputMap(value: unknown): value is Record<string, N8nWorkflowConnection[][]> {
  return isRecord(value) && Object.values(value).every(isConnectionGroups)
}

function isConnectionGroups(value: unknown): value is N8nWorkflowConnection[][] {
  return (
    Array.isArray(value) &&
    value.every((group) => Array.isArray(group) && group.every(isN8nWorkflowConnectionShape))
  )
}

function isN8nWorkflowConnectionShape(value: unknown): value is N8nWorkflowConnection {
  return (
    isRecord(value) &&
    typeof value.node === "string" &&
    typeof value.type === "string" &&
    typeof value.index === "number" &&
    Number.isFinite(value.index)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
