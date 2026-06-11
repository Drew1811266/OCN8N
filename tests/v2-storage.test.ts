import path from "node:path"
import { describe, expect, it } from "vitest"
import type { V2ArtifactStorage, V2WriteTextOptions } from "../src/index.js"
import { createInitialV2Plan } from "../src/v2/plan-service.js"
import { V2PlanStore } from "../src/v2/plan-store.js"
import { V2WorkflowRegistry } from "../src/v2/registry.js"

class MemoryArtifactStorage implements V2ArtifactStorage {
  readonly files = new Map<string, string>()

  async readText(filePath: string): Promise<string | undefined> {
    return this.files.get(filePath)
  }

  async writeText(filePath: string, content: string, options: V2WriteTextOptions = {}): Promise<void> {
    if (options.exclusive && this.files.has(filePath)) {
      throw Object.assign(new Error("File exists."), { code: "EEXIST" })
    }

    this.files.set(filePath, content)
  }

  async listNames(dirPath: string): Promise<string[]> {
    const prefix = dirPath.endsWith(path.sep) ? dirPath : `${dirPath}${path.sep}`

    return [...this.files.keys()]
      .filter((filePath) => filePath.startsWith(prefix))
      .map((filePath) => filePath.slice(prefix.length))
      .filter((name) => name.length > 0 && !name.includes(path.sep))
      .sort((left, right) => left.localeCompare(right))
  }
}

describe("v2 artifact storage adapter", () => {
  it("lets v2 plan and registry stores run on an injected storage adapter", async () => {
    const storage = new MemoryArtifactStorage()
    const plans = new V2PlanStore("/virtual/.opencode/n8n-v2/plans", storage)
    const registry = new V2WorkflowRegistry("/virtual/.opencode/n8n-v2/registry/workflows.json", storage)

    const version = await plans.saveInitial({
      plan: createInitialV2Plan({
        prompt: "Receive an order webhook and respond to the webhook.",
        name: "Storage adapter orders",
      }),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Initial plan",
    })

    await registry.upsert({
      workflowId: "wf_storage",
      name: "Storage adapter orders",
      url: "https://demo/workflow/wf_storage",
      baseUrl: "https://demo/api/v1",
      claimMode: "full",
      activeAtClaim: false,
      managedBy: "opencode-n8n-builder-v2",
      managedByVersion: "2.0.0",
      latestPlanId: version.planId,
      latestPlanVersion: version.planVersion,
      latestWorkflowHash: "workflow_hash",
      lastUpdatedAt: "2026-06-11T00:00:00.000Z",
    })

    await expect(plans.get(version.planId, version.planVersion)).resolves.toEqual(version)
    await expect(plans.latest(version.planId)).resolves.toEqual(version)
    await expect(registry.get("wf_storage")).resolves.toEqual(
      expect.objectContaining({
        workflowId: "wf_storage",
        latestPlanId: version.planId,
      }),
    )
    expect(storage.files.size).toBe(2)
  })
})
