import { describe, expect, it } from "vitest"
import {
  buildConfigureMappingAction,
  buildCreatedFromEnvAction,
  buildMissingEnvAction,
  buildOAuthSetupAction,
  buildReuseExistingAction,
  credentialSetupUrl,
} from "../src/credential-actions.js"

describe("credential setup actions", () => {
  it("derives a credential setup URL from n8n API base URL", () => {
    expect(credentialSetupUrl("https://demo.app.n8n.cloud/api/v1")).toBe("https://demo.app.n8n.cloud/credentials")
    expect(credentialSetupUrl("https://demo.app.n8n.cloud/api/v1/")).toBe("https://demo.app.n8n.cloud/credentials")
  })

  it("builds a configure mapping action without leaking values", () => {
    expect(
      buildConfigureMappingAction({
        baseUrl: "https://demo/api/v1",
        nodeName: "Slack",
        credentialType: "slackApi",
      }),
    ).toEqual({
      nodeName: "Slack",
      credentialType: "slackApi",
      action: "configure_mapping",
      status: "required",
      message: "Configure n8n.credentialEnv.slackApi so the plugin can reuse or create this credential.",
      manualSetupUrl: "https://demo/credentials",
    })
  })

  it("builds a missing env action with variable names only", () => {
    const action = buildMissingEnvAction({
      baseUrl: "https://demo/api/v1",
      nodeName: "Slack",
      credentialType: "slackApi",
      credentialName: "OpenCode Slack",
      requiredEnv: ["SLACK_BOT_TOKEN"],
      docs: ["Create a Slack bot token with chat:write scope."],
    })

    expect(action).toEqual({
      nodeName: "Slack",
      credentialType: "slackApi",
      credentialName: "OpenCode Slack",
      action: "set_missing_env",
      status: "required",
      message: "Set missing environment variables for OpenCode Slack: SLACK_BOT_TOKEN.",
      requiredEnv: ["SLACK_BOT_TOKEN"],
      manualSetupUrl: "https://demo/credentials",
      docs: ["Create a Slack bot token with chat:write scope."],
    })
    expect(JSON.stringify(action)).not.toContain("xoxb-secret")
  })

  it("builds OAuth handoff actions for n8n UI", () => {
    expect(
      buildOAuthSetupAction({
        baseUrl: "https://demo/api/v1",
        nodeName: "Gmail",
        credentialType: "gmailOAuth2",
        credentialName: "OpenCode Gmail",
        setupUrl: "https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/",
      }),
    ).toEqual({
      nodeName: "Gmail",
      credentialType: "gmailOAuth2",
      credentialName: "OpenCode Gmail",
      action: "complete_oauth_in_n8n",
      status: "required",
      message: "Complete OAuth setup for OpenCode Gmail in n8n, then rerun the workflow update or activation check.",
      manualSetupUrl: "https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/",
    })
  })

  it("builds resolved actions for reused and created credentials", () => {
    expect(
      buildReuseExistingAction({
        nodeName: "Slack",
        credentialType: "slackApi",
        credentialName: "OpenCode Slack",
      }),
    ).toMatchObject({
      action: "reuse_existing",
      status: "resolved",
    })
    expect(
      buildCreatedFromEnvAction({
        nodeName: "Slack",
        credentialType: "slackApi",
        credentialName: "OpenCode Slack",
      }),
    ).toMatchObject({
      action: "create_from_env",
      status: "resolved",
    })
  })
})
