import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

const docs = [
  "docs/installation.md",
  "docs/configuration.md",
  "docs/credential-setup.md",
  "docs/operations.md",
  "docs/troubleshooting.md",
  "docs/release-checklist.md",
  "docs/migration-v1-to-v2.md",
  "docs/pattern-compatibility-matrix.md",
]

const tools = [
  "n8n_v2_auto_preview",
  "n8n_v2_create_plan",
  "n8n_v2_review_plan",
  "n8n_v2_patch_plan",
  "n8n_v2_validate_simulate",
  "n8n_v2_compile_preview",
  "n8n_v2_apply",
  "n8n_v2_claim_workflow",
  "n8n_v2_reverse_plan",
  "n8n_v2_run_trial",
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

  it("documents v2 in README and changelog", async () => {
    const readme = await readFile("README.md", "utf8")
    const changelog = await readFile("CHANGELOG.md", "utf8")

    expect(readme).toContain("当前版本：`2.0.0`")
    expect(readme).toContain("Breaking Reset")
    expect(readme).toContain(".opencode/n8n-v2/")
    expect(readme).toContain("n8n_v2_auto_preview")
    expect(readme).toContain("n8n_v2_claim_workflow")
    expect(readme).toContain("n8n_v2_reverse_plan")
    expect(readme).toContain("n8n_v2_run_trial")
    expect(readme).toContain("v2-claimed inactive workflow")
    expect(readme).toContain("docs/installation.md")
    expect(readme).toContain("docs/release-checklist.md")
    expect(readme).toContain("docs/public-contract.md")
    expect(readme).toContain("docs/compatibility.md")
    expect(readme).toContain("docs/security-review.md")
    expect(readme).toContain("docs/migration-v1-to-v2.md")
    expect(readme).toContain("docs/pattern-compatibility-matrix.md")
    expect(changelog).toContain("## 2.0.0")
    expect(changelog).toContain("Breaking Reset")
    expect(changelog).toContain("opencode-n8n-builder-v2")

    for (const version of [
      "1.0.0",
      "0.9.0",
      "0.8.0",
      "0.7.0",
      "0.6.0",
      "0.5.0",
      "0.4.0",
      "0.3.0",
      "0.2.0",
      "0.1.0",
    ]) {
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

  it("documents the v2 public contract, compatibility, and security review", async () => {
    const publicContract = await readFile("docs/public-contract.md", "utf8")
    const compatibility = await readFile("docs/compatibility.md", "utf8")
    const security = await readFile("docs/security-review.md", "utf8")
    const releaseChecklist = await readFile("docs/release-checklist.md", "utf8")
    const migration = await readFile("docs/migration-v1-to-v2.md", "utf8")
    const patternMatrix = await readFile("docs/pattern-compatibility-matrix.md", "utf8")

    for (const tool of tools) {
      expect(publicContract).toContain(tool)
      expect(releaseChecklist).toContain(tool)
    }

    for (const term of [
      "V2CreatePlanResult",
      "V2AutoPreviewResult",
      "V2CompilePreviewResult",
      "V2ApplyResult",
      "V2ClaimWorkflowResult",
      "V2ReversePlanResult",
      "V2RunTrialResult",
      "V2RegistryRecord",
      "V2CompiledPreview",
      "V2TrialRunArtifact",
      "V2ArtifactPaths",
      "N8nBuilderError",
      "v2-claimed inactive workflow",
      "MCP validation after compile",
      "mcpValidationStatus",
      "diff when updating a claimed inactive workflow",
      "updateTarget",
      "businessIntent",
      "nodeParameters",
      "expressions",
      "sourceFields",
      "outputFields",
    ]) {
      expect(publicContract).toContain(term)
    }

    for (const term of [
      "trigger",
      "transform",
      "branch",
      "loop_batch",
      "error_handling",
      "external_call",
      "output",
      "n8n 2.20.0",
      "n8n 2.23.4",
    ]) {
      expect(compatibility).toContain(term)
      expect(patternMatrix).toContain(term)
    }

    for (const term of [
      "v1 `.opencode/n8n-workflows.json` is not a v2 registry",
      "n8n_v2_claim_workflow",
      "read-only claim",
      "full claim",
      "no silent migration",
    ]) {
      expect(migration).toContain(term)
    }

    for (const term of [
      "Pattern Compatibility Matrix",
      "Required variants",
      "Validation focus",
      "Core node combinations",
      "Medium-depth",
    ]) {
      expect(patternMatrix).toContain(term)
    }

    for (const term of [
      "No silent n8n writes",
      "No active workflow structural apply",
      "No silent migration from v1 artifacts",
      "No execution-history sampling without opt-in",
      "No trial run without opt-in",
      "No plaintext secrets in persisted artifacts",
      "opencode-n8n-builder-v2",
      ".opencode/n8n-v2/",
      "redaction",
      "Residual risks",
    ]) {
      expect(security).toContain(term)
    }
  })
})
