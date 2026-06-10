import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

const docs = [
  "docs/installation.md",
  "docs/configuration.md",
  "docs/credential-setup.md",
  "docs/operations.md",
  "docs/troubleshooting.md",
  "docs/release-checklist.md",
]

const tools = [
  "n8n_build_workflow",
  "n8n_update_workflow",
  "n8n_claim_workflow",
  "n8n_check_workflow_readiness",
  "n8n_inspect_workflow",
  "n8n_list_managed_workflows",
]

describe("release documentation", () => {
  it("contains the expected handoff docs", async () => {
    for (const doc of docs) {
      const body = await readFile(doc, "utf8")
      expect(body.trim().length, `${doc} should not be empty`).toBeGreaterThan(400)
    }
  })

  it("documents every public tool in operations docs", async () => {
    const operations = await readFile("docs/operations.md", "utf8")

    for (const tool of tools) {
      expect(operations).toContain(tool)
    }
  })

  it("documents common troubleshooting categories", async () => {
    const troubleshooting = await readFile("docs/troubleshooting.md", "utf8")

    for (const section of [
      "CONFIG_MISSING",
      "N8N_API_ERROR",
      "MCP_WORKFLOW_VALIDATION_FAILED",
      "Docker",
      "credentials",
    ]) {
      expect(troubleshooting).toContain(section)
    }
  })

  it("keeps example OpenCode configs parseable and non-secret", async () => {
    const examples = [
      "examples/opencode.local-n8n.json",
      "examples/opencode.n8n-cloud.json",
      "examples/opencode.mcp-token.json",
      "examples/opencode.credentials.json",
    ]

    for (const example of examples) {
      const raw = await readFile(example, "utf8")
      const parsed = JSON.parse(raw) as { n8n?: Record<string, unknown> }

      expect(parsed.n8n).toEqual(expect.any(Object))
      expect(raw).not.toMatch(/n8n_api_[A-Za-z0-9]/)
      expect(raw).not.toMatch(/xox[baprs]-/)
      expect(raw).not.toMatch(/Bearer\s+[A-Za-z0-9]/)
    }
  })
})
