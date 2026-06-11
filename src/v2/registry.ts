import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { N8nBuilderError } from "../errors.js"
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
    if (!isV2RegistryRecord(record)) {
      throw new N8nBuilderError("Invalid v2 registry record.", "V2_REGISTRY_INVALID", {
        reason: "invalid_record",
      })
    }

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
    (value.latestPlanVersion === undefined ||
      (typeof value.latestPlanVersion === "number" &&
        Number.isSafeInteger(value.latestPlanVersion) &&
        value.latestPlanVersion > 0)) &&
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
