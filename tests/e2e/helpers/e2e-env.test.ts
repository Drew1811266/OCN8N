import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { createE2eRuntimeConfig, redactSecrets, requiredEnv } from "./e2e-env.js"

describe("e2e env helpers", () => {
  it("builds plugin config from E2E environment variables", async () => {
    const workspaceDir = await mkdtemp(path.join(tmpdir(), "ocn8n-e2e-"))
    const config = createE2eRuntimeConfig({
      env: {
        N8N_E2E_BASE_URL: "http://127.0.0.1:5678/api/v1",
        N8N_E2E_API_KEY: "api_key",
        N8N_E2E_MCP_URL: "http://127.0.0.1:5678/mcp",
        N8N_E2E_MCP_TOKEN: "mcp_token",
      },
      workspaceDir,
      pluginVersion: "0.2.0-e2e",
    })

    expect(config).toEqual(
      expect.objectContaining({
        baseUrl: "http://127.0.0.1:5678/api/v1",
        apiKey: "api_key",
        mcpUrl: "http://127.0.0.1:5678/mcp",
        mcpToken: "mcp_token",
        workspaceDir,
        registryPath: path.join(workspaceDir, ".opencode", "n8n-workflows.json"),
        previewDir: path.join(workspaceDir, ".opencode", "n8n-update-previews"),
        pluginVersion: "0.2.0-e2e",
      }),
    )
  })

  it("throws with a clear message when a required E2E env var is missing", () => {
    expect(() => requiredEnv({}, "N8N_E2E_API_KEY")).toThrow("Missing required E2E environment variable: N8N_E2E_API_KEY")
  })

  it("redacts secret values from diagnostics", () => {
    const output = redactSecrets("apiKey=abc N8N_E2E_API_KEY=secret Authorization: Bearer token")

    expect(output).toContain("apiKey=[REDACTED]")
    expect(output).toContain("N8N_E2E_API_KEY=[REDACTED]")
    expect(output).toContain("Authorization: Bearer [REDACTED]")
    expect(output).not.toContain("secret")
    expect(output).not.toContain("token")
  })
})
