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
      credentialEnv: {},
    })

    const result = await resolver.resolve({ nodeName: "Slack", credentialType: "slackApi" })

    expect(result).toEqual({
      gap: {
        nodeName: "Slack",
        credentialType: "slackApi",
        reason: "No credential mapping configured for this credential type.",
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
    expect(result).toEqual({ reference: { id: "cred_1", name: "OpenCode Slack" } })
    expect(JSON.stringify(result)).not.toContain("xoxb-secret")
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
