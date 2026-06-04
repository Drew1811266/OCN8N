import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

export type WorkflowRegistryRecord = {
  workflowId: string
  name: string
  url: string
  baseUrl: string
  managedBy: "opencode-n8n-builder"
  managedByVersion: string
  lastPlanHash: string
  lastUpdatedAt: string
}

type RegistryFile = {
  workflows: WorkflowRegistryRecord[]
}

export class WorkflowRegistry {
  constructor(private readonly filePath: string) {}

  async list(): Promise<WorkflowRegistryRecord[]> {
    return (await this.read()).workflows
  }

  async get(workflowId: string): Promise<WorkflowRegistryRecord | undefined> {
    return (await this.list()).find((record) => record.workflowId === workflowId)
  }

  async upsert(record: WorkflowRegistryRecord): Promise<void> {
    const file = await this.read()
    const workflows = file.workflows.filter((item) => item.workflowId !== record.workflowId)
    workflows.push(record)
    workflows.sort((a, b) => a.name.localeCompare(b.name))

    await this.write({ workflows })
  }

  private async read(): Promise<RegistryFile> {
    try {
      const raw = await readFile(this.filePath, "utf8")
      const parsed: unknown = JSON.parse(raw)

      if (!isRegistryFile(parsed)) {
        return { workflows: [] }
      }

      return { workflows: parsed.workflows }
    } catch {
      return { workflows: [] }
    }
  }

  private async write(file: RegistryFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`, "utf8")
  }
}

function isRegistryFile(value: unknown): value is RegistryFile {
  if (!isRecord(value) || !Array.isArray(value.workflows)) {
    return false
  }

  return value.workflows.every(isWorkflowRegistryRecord)
}

function isWorkflowRegistryRecord(value: unknown): value is WorkflowRegistryRecord {
  return (
    isRecord(value) &&
    typeof value.workflowId === "string" &&
    typeof value.name === "string" &&
    typeof value.url === "string" &&
    typeof value.baseUrl === "string" &&
    value.managedBy === "opencode-n8n-builder" &&
    typeof value.managedByVersion === "string" &&
    typeof value.lastPlanHash === "string" &&
    typeof value.lastUpdatedAt === "string"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
