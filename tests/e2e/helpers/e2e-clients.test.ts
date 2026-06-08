import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { N8nBuilderError } from "../../../src/errors.js"
import type { PluginConfig } from "../../../src/types.js"
import {
  cleanupE2eContext,
  cleanupE2eWorkflows,
  createE2eContext,
  trackWorkflow,
  type E2eContext,
} from "./e2e-clients.js"

const baseConfig: PluginConfig = {
  baseUrl: "http://127.0.0.1:5678/api/v1",
  apiKey: "api-secret",
  mcpUrl: "http://127.0.0.1:5678/mcp",
  mcpToken: "mcp-secret",
  workspaceDir: "/tmp/ocn8n-e2e-test",
  registryPath: "/tmp/ocn8n-e2e-test/.opencode/n8n-workflows.json",
  previewDir: "/tmp/ocn8n-e2e-test/.opencode/n8n-update-previews",
  credentialEnv: {},
  pluginVersion: "0.2.0-e2e",
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("e2e client helpers", () => {
  it("removes a temp workspace when context creation fails after mkdtemp", async () => {
    const timestamp = 1_893_456_000_000
    const runId = `ocn8n-e2e-${timestamp}-`
    const tempPrefix = `${runId}-`
    const originalBaseUrl = process.env.N8N_E2E_BASE_URL
    vi.spyOn(Date, "now").mockReturnValue(timestamp)
    vi.spyOn(Math, "random").mockReturnValue(0)
    delete process.env.N8N_E2E_BASE_URL
    await removeTempDirs(tempPrefix)

    try {
      await expect(createE2eContext()).rejects.toThrow(
        "Missing required E2E environment variable: N8N_E2E_BASE_URL",
      )

      expect(await findTempDirs(tempPrefix)).toEqual([])
    } finally {
      if (originalBaseUrl === undefined) {
        delete process.env.N8N_E2E_BASE_URL
      } else {
        process.env.N8N_E2E_BASE_URL = originalBaseUrl
      }
      await removeTempDirs(tempPrefix)
    }
  })

  it("deletes each tracked workflow once in reverse order and reports sanitized failures", async () => {
    const attemptedWorkflowIds: string[] = []
    const context = createTestContext({
      createdWorkflowIds: ["first", "bad", "first", "missing"],
      deleteWorkflow: async (workflowId) => {
        attemptedWorkflowIds.push(workflowId)
        if (workflowId === "missing") {
          throw new N8nBuilderError("not found api-secret", "N8N_API_ERROR", { status: 404 })
        }
        if (workflowId === "bad") {
          throw new Error("delete failed api-secret mcp-secret token=visible_secret")
        }
      },
    })

    let thrown: unknown
    try {
      await cleanupE2eWorkflows(context)
    } catch (error) {
      thrown = error
    }

    expect(attemptedWorkflowIds).toEqual(["missing", "first", "bad"])
    expect(thrown).toBeInstanceOf(Error)
    const message = (thrown as Error).message
    expect(message).toContain("Failed to delete 1 E2E workflow")
    expect(message).toContain("bad")
    expect(message).toContain("[REDACTED]")
    expect(message).not.toContain("api-secret")
    expect(message).not.toContain("mcp-secret")
    expect(message).not.toContain("visible_secret")
    expect(message).not.toContain("missing")
  })

  it("removes the workspace even when workflow cleanup fails", async () => {
    const workspaceDir = path.join(tmpdir(), `ocn8n-e2e-context-cleanup-${Date.now()}`)
    await mkdir(workspaceDir, { recursive: true })
    await writeFile(path.join(workspaceDir, "marker.txt"), "cleanup me", "utf8")
    const context = createTestContext({
      workspaceDir,
      createdWorkflowIds: ["leaky-workflow"],
      deleteWorkflow: async () => {
        throw new Error("delete failed api-secret")
      },
    })

    let thrown: unknown
    try {
      await cleanupE2eContext(context)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toContain("Failed to delete 1 E2E workflow")
    await expect(stat(workspaceDir)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("rethrows workflow cleanup errors when workspace removal also fails", async () => {
    const context = createTestContext({
      workspaceDir: "\0",
      createdWorkflowIds: ["leaky-workflow"],
      deleteWorkflow: async () => {
        throw new Error("delete failed api-secret")
      },
    })

    await expect(cleanupE2eContext(context)).rejects.toThrow("Failed to delete 1 E2E workflow")
  })

  it("tracks each workflow ID once", () => {
    const context = createTestContext()

    expect(trackWorkflow(context, "workflow-1")).toBe("workflow-1")
    trackWorkflow(context, "workflow-1")

    expect(context.createdWorkflowIds).toEqual(["workflow-1"])
  })
})

function createTestContext(input: {
  workspaceDir?: string
  createdWorkflowIds?: string[]
  deleteWorkflow?: (workflowId: string) => Promise<void>
} = {}): E2eContext {
  const workspaceDir = input.workspaceDir ?? baseConfig.workspaceDir

  return {
    runId: "ocn8n-e2e-test",
    workspaceDir,
    config: {
      ...baseConfig,
      workspaceDir,
    },
    api: {
      deleteWorkflow: input.deleteWorkflow ?? (async () => {}),
    } as E2eContext["api"],
    mcp: {} as E2eContext["mcp"],
    registry: {} as E2eContext["registry"],
    previewStore: {} as E2eContext["previewStore"],
    createdWorkflowIds: input.createdWorkflowIds ?? [],
  }
}

async function findTempDirs(prefix: string): Promise<string[]> {
  const entries = await readdir(tmpdir(), { withFileTypes: true })

  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => path.join(tmpdir(), entry.name))
    .sort()
}

async function removeTempDirs(prefix: string): Promise<void> {
  for (const directory of await findTempDirs(prefix)) {
    await rm(directory, { recursive: true, force: true })
  }
}
