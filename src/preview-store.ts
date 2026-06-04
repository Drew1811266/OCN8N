import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { N8nWorkflow } from "./validator.js"

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

export class PreviewStore {
  constructor(private readonly directory: string) {}

  async save(input: SaveUpdatePreviewInput): Promise<UpdatePreview> {
    const preview: UpdatePreview = { ...input, previewId: randomUUID() }

    await mkdir(this.directory, { recursive: true })
    await writeFile(this.filePath(preview.previewId), `${JSON.stringify(preview, null, 2)}\n`, "utf8")

    return preview
  }

  async get(previewId: string, now = new Date()): Promise<UpdatePreview | undefined> {
    try {
      const raw = await readFile(this.filePath(previewId), "utf8")
      const preview = JSON.parse(raw) as UpdatePreview

      if (new Date(preview.expiresAt).getTime() <= now.getTime()) {
        return undefined
      }

      return preview
    } catch {
      return undefined
    }
  }

  private filePath(previewId: string): string {
    return path.join(this.directory, `${previewId}.json`)
  }
}
