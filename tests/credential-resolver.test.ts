import { describe, expect, it, vi } from "vitest"
import { CredentialResolver } from "../src/credential-resolver.js"
import { N8nBuilderError } from "../src/errors.js"
import type { N8nCredentialSummary } from "../src/n8n-api-client.js"

describe("CredentialResolver", () => {
  it("reuses an existing named credential by type and configured name", async () => {
    const api = {
      listCredentials: vi.fn(async () => [
        { id: "cred_other", name: "Other Slack", type: "slackApi" },
        { id: "cred_1", name: "OpenCode Slack", type: "slackApi" },
      ]),
      createCredential: vi.fn(),
    }
    const resolver = new CredentialResolver({
      api,
      env: {},
      baseUrl: "https://demo/api/v1",
      credentialEnv: {
        slackApi: {
          name: "OpenCode Slack",
          type: "slackApi",
          env: { accessToken: "SLACK_BOT_TOKEN" },
        },
      },
    })

    const result = await resolver.resolve({ nodeName: "Slack", credentialType: "slackApi" })

    expect(result.reference).toEqual({ id: "cred_1", name: "OpenCode Slack" })
    expect(result.action).toEqual({
      nodeName: "Slack",
      credentialType: "slackApi",
      credentialName: "OpenCode Slack",
      action: "reuse_existing",
      status: "resolved",
      message: "Reusing existing n8n credential OpenCode Slack for Slack.",
    })
    expect(result.gap).toBeUndefined()
    expect(api.createCredential).not.toHaveBeenCalled()
  })

  it("reports a credential gap when required environment variables are missing", async () => {
    const api = {
      listCredentials: vi.fn(async () => []),
      createCredential: vi.fn(),
    }
    const resolver = new CredentialResolver({
      api,
      env: {},
      baseUrl: "https://demo/api/v1",
      credentialEnv: {
        slackApi: {
          name: "OpenCode Slack",
          type: "slackApi",
          env: { accessToken: "SLACK_BOT_TOKEN", teamId: "SLACK_TEAM_ID" },
        },
      },
    })

    const result = await resolver.resolve({ nodeName: "Slack", credentialType: "slackApi" })

    expect(result).toEqual({
      gap: {
        nodeName: "Slack",
        credentialType: "slackApi",
        credentialName: "OpenCode Slack",
        reason: "Missing environment variables: SLACK_BOT_TOKEN, SLACK_TEAM_ID",
      },
      action: {
        nodeName: "Slack",
        credentialType: "slackApi",
        credentialName: "OpenCode Slack",
        action: "set_missing_env",
        status: "required",
        message: "Set missing environment variables for OpenCode Slack: SLACK_BOT_TOKEN, SLACK_TEAM_ID.",
        requiredEnv: ["SLACK_BOT_TOKEN", "SLACK_TEAM_ID"],
        manualSetupUrl: "https://demo/credentials",
      },
    })
    expect(api.createCredential).not.toHaveBeenCalled()
  })

  it("reports a credential gap without listing credentials when no mapping is configured", async () => {
    const api = {
      listCredentials: vi.fn(async () => []),
      createCredential: vi.fn(),
    }
    const resolver = new CredentialResolver({
      api,
      env: {},
      baseUrl: "https://demo/api/v1",
      credentialEnv: {},
    })

    const result = await resolver.resolve({ nodeName: "Slack", credentialType: "slackApi" })

    expect(result).toEqual({
      gap: {
        nodeName: "Slack",
        credentialType: "slackApi",
        reason: "No credential mapping configured for this credential type.",
      },
      action: {
        nodeName: "Slack",
        credentialType: "slackApi",
        action: "configure_mapping",
        status: "required",
        message: "Configure n8n.credentialEnv.slackApi so the plugin can reuse or create this credential.",
        manualSetupUrl: "https://demo/credentials",
      },
    })
    expect(api.listCredentials).not.toHaveBeenCalled()
    expect(api.createCredential).not.toHaveBeenCalled()
  })

  it("creates a credential from complete environment data without returning secret values", async () => {
    const api = {
      listCredentials: vi.fn(async () => []),
      createCredential: vi.fn(async () => ({ id: "cred_1", name: "OpenCode Slack", type: "slackApi" })),
    }
    const resolver = new CredentialResolver({
      api,
      env: {
        SLACK_BOT_TOKEN: "xoxb-secret",
        SLACK_TEAM_ID: "T123",
      },
      baseUrl: "https://demo/api/v1",
      credentialEnv: {
        slackApi: {
          name: "OpenCode Slack",
          type: "slackApi",
          env: { accessToken: "SLACK_BOT_TOKEN", teamId: "SLACK_TEAM_ID" },
        },
      },
    })

    const result = await resolver.resolve({ nodeName: "Slack", credentialType: "slackApi" })

    expect(api.createCredential).toHaveBeenCalledWith({
      name: "OpenCode Slack",
      type: "slackApi",
      data: { accessToken: "xoxb-secret", teamId: "T123" },
    })
    expect(result).toEqual({
      reference: { id: "cred_1", name: "OpenCode Slack" },
      action: {
        nodeName: "Slack",
        credentialType: "slackApi",
        credentialName: "OpenCode Slack",
        action: "create_from_env",
        status: "resolved",
        message: "Created n8n credential OpenCode Slack from configured environment variables for Slack.",
      },
    })
    expect(JSON.stringify(result)).not.toContain("xoxb-secret")
  })

  it("returns OAuth handoff action instead of creating OAuth credentials", async () => {
    const api = {
      listCredentials: vi.fn(async () => []),
      createCredential: vi.fn(),
    }
    const resolver = new CredentialResolver({
      api,
      env: {},
      baseUrl: "https://demo/api/v1",
      credentialEnv: {
        gmailOAuth2: {
          name: "OpenCode Gmail",
          type: "gmailOAuth2",
          env: {},
          authMode: "oauth2",
        },
      },
    })

    const result = await resolver.resolve({ nodeName: "Gmail", credentialType: "gmailOAuth2" })

    expect(result.reference).toBeUndefined()
    expect(result.gap).toEqual({
      nodeName: "Gmail",
      credentialType: "gmailOAuth2",
      credentialName: "OpenCode Gmail",
      reason: "OAuth credentials must be completed manually in n8n UI.",
    })
    expect(result.action).toMatchObject({
      action: "complete_oauth_in_n8n",
      status: "required",
      manualSetupUrl: "https://demo/credentials",
    })
    expect(api.createCredential).not.toHaveBeenCalled()
  })

  it("throws a redacted error when credential creation returns malformed data", async () => {
    const api = {
      listCredentials: vi.fn(async () => []),
      createCredential: vi.fn(async () => {
        return { id: "cred_1", name: "OpenCode Slack", token: "xoxb-secret" } as unknown as N8nCredentialSummary
      }),
    }
    const resolver = new CredentialResolver({
      api,
      env: { SLACK_BOT_TOKEN: "xoxb-secret" },
      baseUrl: "https://demo/api/v1",
      credentialEnv: {
        slackApi: {
          name: "OpenCode Slack",
          type: "slackApi",
          env: { accessToken: "SLACK_BOT_TOKEN" },
        },
      },
    })

    let error: unknown
    try {
      await resolver.resolve({ nodeName: "Slack", credentialType: "slackApi" })
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(N8nBuilderError)
    expect((error as N8nBuilderError).code).toBe("CREDENTIAL_CREATE_INVALID")
    expect((error as N8nBuilderError).details).toEqual({
      credentialType: "slackApi",
      credentialName: "OpenCode Slack",
    })
    expect(JSON.stringify(error)).not.toContain("xoxb-secret")
  })
})
