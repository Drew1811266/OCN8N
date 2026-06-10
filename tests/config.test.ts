import { describe, expect, it } from "vitest"
import { loadApiPluginConfig, loadLocalPluginConfig, loadPluginConfig } from "../src/config.js"
import { N8nBuilderError } from "../src/errors.js"

const requiredEnv = {
  N8N_BASE_URL: "https://demo.app.n8n.cloud/api/v1",
  N8N_API_KEY: "n8n_api_key",
  N8N_MCP_URL: "https://demo.app.n8n.cloud/mcp",
}

function captureConfigError(opencodeConfig: unknown): N8nBuilderError {
  try {
    loadPluginConfig({
      env: requiredEnv,
      opencodeConfig,
      workspaceDir: "/tmp/project",
    })
  } catch (error) {
    expect(error).toBeInstanceOf(N8nBuilderError)
    return error as N8nBuilderError
  }

  throw new Error("Expected loadPluginConfig to throw")
}

describe("loadPluginConfig", () => {
  it("loads local workspace config without n8n connection settings", () => {
    const config = loadLocalPluginConfig({
      env: {},
      opencodeConfig: {},
      workspaceDir: "/tmp/project",
    })

    expect(config.workspaceDir).toBe("/tmp/project")
    expect(config.registryPath).toBe("/tmp/project/.opencode/n8n-workflows.json")
    expect(config.previewDir).toBe("/tmp/project/.opencode/n8n-update-previews")
    expect(config.credentialEnv).toEqual({})
    expect(config.pluginVersion).toBe("1.0.0")
  })

  it("loads API config without requiring MCP URL", () => {
    const config = loadApiPluginConfig({
      env: {
        N8N_BASE_URL: "https://demo.app.n8n.cloud/api/v1",
        N8N_API_KEY: "n8n_api_key",
      },
      opencodeConfig: {},
      workspaceDir: "/tmp/project",
    })

    expect(config.baseUrl).toBe("https://demo.app.n8n.cloud/api/v1")
    expect(config.apiKey).toBe("n8n_api_key")
    expect(config.registryPath).toBe("/tmp/project/.opencode/n8n-workflows.json")
  })

  it("loads API config while ignoring malformed MCP token config", () => {
    const config = loadApiPluginConfig({
      env: {
        N8N_BASE_URL: "https://demo.app.n8n.cloud/api/v1",
        N8N_API_KEY: "n8n_api_key",
      },
      opencodeConfig: {
        n8n: {
          mcpToken: 123,
        },
      },
      workspaceDir: "/tmp/project",
    })

    expect(config.baseUrl).toBe("https://demo.app.n8n.cloud/api/v1")
    expect(config.apiKey).toBe("n8n_api_key")
  })

  it("loads local config while ignoring malformed MCP token config", () => {
    const config = loadLocalPluginConfig({
      env: {},
      opencodeConfig: {
        n8n: {
          mcpToken: 123,
        },
      },
      workspaceDir: "/tmp/project",
    })

    expect(config.workspaceDir).toBe("/tmp/project")
    expect(config.registryPath).toBe("/tmp/project/.opencode/n8n-workflows.json")
  })

  it("throws a typed API config error when API settings are missing", () => {
    try {
      loadApiPluginConfig({
        env: {},
        opencodeConfig: {},
        workspaceDir: "/tmp/project",
      })
    } catch (error) {
      expect(error).toBeInstanceOf(N8nBuilderError)
      expect((error as N8nBuilderError).code).toBe("CONFIG_MISSING")
      expect((error as N8nBuilderError).details).toEqual({
        missing: ["N8N_BASE_URL", "N8N_API_KEY"],
      })
      return
    }

    throw new Error("Expected loadApiPluginConfig to throw")
  })

  it("loads required n8n settings from environment", () => {
    const config = loadPluginConfig({
      env: requiredEnv,
      opencodeConfig: {},
      workspaceDir: "/tmp/project",
    })

    expect(config.baseUrl).toBe("https://demo.app.n8n.cloud/api/v1")
    expect(config.apiKey).toBe("n8n_api_key")
    expect(config.mcpUrl).toBe("https://demo.app.n8n.cloud/mcp")
    expect(config.workspaceDir).toBe("/tmp/project")
    expect(config.registryPath).toBe("/tmp/project/.opencode/n8n-workflows.json")
  })

  it("loads optional MCP token from environment", () => {
    const config = loadPluginConfig({
      env: {
        N8N_BASE_URL: "https://demo/api/v1",
        N8N_API_KEY: "api_key",
        N8N_MCP_URL: "https://demo/mcp",
        N8N_MCP_TOKEN: "mcp_token",
      },
      opencodeConfig: {},
      workspaceDir: "/tmp/project",
      pluginVersion: "test-version",
    })

    expect(config.mcpToken).toBe("mcp_token")
  })

  it("lets opencode MCP token override environment token", () => {
    const config = loadPluginConfig({
      env: {
        N8N_BASE_URL: "https://demo/api/v1",
        N8N_API_KEY: "api_key",
        N8N_MCP_URL: "https://demo/mcp",
        N8N_MCP_TOKEN: "env_token",
      },
      opencodeConfig: {
        n8n: {
          mcpToken: "config_token",
        },
      },
      workspaceDir: "/tmp/project",
      pluginVersion: "test-version",
    })

    expect(config.mcpToken).toBe("config_token")
  })

  it("rejects non-string MCP token config", () => {
    expect(() =>
      loadPluginConfig({
        env: {
          N8N_BASE_URL: "https://demo/api/v1",
          N8N_API_KEY: "api_key",
          N8N_MCP_URL: "https://demo/mcp",
        },
        opencodeConfig: {
          n8n: {
            mcpToken: 123,
          },
        },
        workspaceDir: "/tmp/project",
      }),
    ).toThrow("Invalid n8n configuration: n8n.mcpToken must be a string.")
  })

  it("loads credential mappings from OpenCode config", () => {
    const config = loadPluginConfig({
      env: requiredEnv,
      workspaceDir: "/tmp/project",
      opencodeConfig: {
        n8n: {
          credentialEnv: {
            slackApi: {
              name: "OpenCode Slack",
              type: "slackApi",
              env: { accessToken: "SLACK_BOT_TOKEN" },
            },
          },
        },
      },
    })

    expect(config.credentialEnv.slackApi.name).toBe("OpenCode Slack")
    expect(config.credentialEnv.slackApi.env.accessToken).toBe("SLACK_BOT_TOKEN")
  })

  it("loads credential setup metadata from OpenCode config", () => {
    const config = loadPluginConfig({
      env: requiredEnv,
      workspaceDir: "/tmp/project",
      opencodeConfig: {
        n8n: {
          credentialEnv: {
            slackApi: {
              name: "OpenCode Slack",
              type: "slackApi",
              env: { accessToken: "SLACK_BOT_TOKEN" },
              authMode: "api_key",
              setupUrl: "https://docs.n8n.io/integrations/builtin/credentials/slack/",
              docs: ["Slack app token with chat:write scope"],
            },
            gmailOAuth2: {
              name: "OpenCode Gmail",
              type: "gmailOAuth2",
              env: {},
              authMode: "oauth2",
              docs: ["Complete OAuth in n8n UI."],
            },
          },
        },
      },
    })

    expect(config.credentialEnv.slackApi).toEqual({
      name: "OpenCode Slack",
      type: "slackApi",
      env: { accessToken: "SLACK_BOT_TOKEN" },
      authMode: "api_key",
      setupUrl: "https://docs.n8n.io/integrations/builtin/credentials/slack/",
      docs: ["Slack app token with chat:write scope"],
    })
    expect(config.credentialEnv.gmailOAuth2).toEqual({
      name: "OpenCode Gmail",
      type: "gmailOAuth2",
      env: {},
      authMode: "oauth2",
      docs: ["Complete OAuth in n8n UI."],
    })
  })

  it("rejects invalid credential authMode values", () => {
    expect(() =>
      loadPluginConfig({
        env: requiredEnv,
        workspaceDir: "/tmp/project",
        opencodeConfig: {
          n8n: {
            credentialEnv: {
              slackApi: {
                name: "OpenCode Slack",
                type: "slackApi",
                env: {},
                authMode: "passwordless",
              },
            },
          },
        },
      }),
    ).toThrow("Invalid n8n configuration: n8n.credentialEnv.slackApi.authMode must be one of api_key, oauth2, manual.")
  })

  it("throws a typed config error when required settings are missing", () => {
    expect(() =>
      loadPluginConfig({
        env: {},
        opencodeConfig: {},
        workspaceDir: "/tmp/project",
      }),
    ).toThrow(N8nBuilderError)

    try {
      loadPluginConfig({
        env: {},
        opencodeConfig: {},
        workspaceDir: "/tmp/project",
      })
    } catch (error) {
      expect(error).toBeInstanceOf(N8nBuilderError)
      expect((error as N8nBuilderError).code).toBe("CONFIG_MISSING")
      expect((error as N8nBuilderError).message).toBe(
        "Missing required n8n configuration: N8N_BASE_URL, N8N_API_KEY, N8N_MCP_URL",
      )
      expect((error as N8nBuilderError).details).toEqual({
        missing: ["N8N_BASE_URL", "N8N_API_KEY", "N8N_MCP_URL"],
      })
    }
  })

  it("throws a typed config error when n8n config is malformed", () => {
    const error = captureConfigError({ n8n: "bad" })

    expect(error.code).toBe("CONFIG_INVALID")
    expect(error.details).toMatchObject({ field: "n8n" })
  })

  it("throws a typed config error when string overrides are malformed", () => {
    const error = captureConfigError({ n8n: { baseUrl: 123 } })

    expect(error.code).toBe("CONFIG_INVALID")
    expect(error.details).toMatchObject({ field: "n8n.baseUrl" })
  })

  it("throws a typed config error when credential mappings are malformed", () => {
    const error = captureConfigError({
      n8n: {
        credentialEnv: {
          slackApi: {
            name: "OpenCode Slack",
            type: "slackApi",
            env: { accessToken: 123 },
          },
        },
      },
    })

    expect(error.code).toBe("CONFIG_INVALID")
    expect(error.details).toMatchObject({ field: "n8n.credentialEnv.slackApi.env.accessToken" })
  })
})
