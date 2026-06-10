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

  it("documents v0.9 in README and changelog", async () => {
    const readme = await readFile("README.md", "utf8")
    const changelog = await readFile("CHANGELOG.md", "utf8")

    expect(readme).toContain("当前版本：`0.9.0`")
    expect(readme).toContain("docs/installation.md")
    expect(readme).toContain("docs/release-checklist.md")
    expect(changelog).toContain("## 0.9.0")

    for (const version of ["0.8.0", "0.7.0", "0.6.0", "0.5.0", "0.4.0", "0.3.0", "0.2.0", "0.1.0"]) {
      expect(changelog).toContain(`## ${version}`)
    }
  })

  it("defines the default GitHub Actions check workflow", async () => {
    const workflow = await readFile(".github/workflows/check.yml", "utf8")

    expect(workflow).toContain("name: check")
    expect(workflow).toContain("actions/checkout")
    expect(workflow).toContain("actions/setup-node")
    expect(workflow).toContain("node-version: 20")
    expect(workflow).toContain("npm ci")
    expect(workflow).toContain("npm run typecheck")
    expect(workflow).toContain("npm run test")
    expect(workflow).toContain("npm run build")
    expect(workflow).toContain("npm run package:check")
  })
})
