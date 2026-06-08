import { describe, expect, it, vi } from "vitest"
import { N8nBuilderError } from "../src/errors.js"
import { OpencodePlanner } from "../src/opencode-planner.js"
import { workflowDraftSchema, workflowPatchDraftSchema } from "../src/workflow-plan.js"
import { simpleWebhookPlan } from "./fixtures/workflows.js"

describe("workflow draft schemas", () => {
  it("parses workflow drafts with SDK validation code and node selection rationale", () => {
    const draft = workflowDraftSchema.parse({
      plan: simpleWebhookPlan,
      sdkCode: "await validateWorkflow(workflow)",
      nodeSelection: [
        {
          nodeType: "n8n-nodes-base.webhook",
          reason: "Receives incoming order events.",
        },
      ],
    })

    expect(draft.plan).toEqual(simpleWebhookPlan)
    expect(draft.sdkCode).toBe("await validateWorkflow(workflow)")
    expect(draft.nodeSelection).toEqual([
      {
        nodeType: "n8n-nodes-base.webhook",
        reason: "Receives incoming order events.",
      },
    ])
  })

  it("parses workflow patch drafts with replacement plan, SDK validation code, and node selection", () => {
    const patchDraft = workflowPatchDraftSchema.parse({
      summary: "Add Slack notification",
      changes: ["Add Slack node"],
      replacementPlan: simpleWebhookPlan,
      sdkCode: "await validateWorkflow(workflow)",
      nodeSelection: [
        {
          nodeType: "n8n-nodes-base.slack",
          reason: "Sends order notifications to the fulfillment channel.",
        },
      ],
    })

    expect(patchDraft.summary).toBe("Add Slack notification")
    expect(patchDraft.changes).toEqual(["Add Slack node"])
    expect(patchDraft.replacementPlan).toEqual(simpleWebhookPlan)
    expect(patchDraft.sdkCode).toBe("await validateWorkflow(workflow)")
    expect(patchDraft.nodeSelection).toEqual([
      {
        nodeType: "n8n-nodes-base.slack",
        reason: "Sends order notifications to the fulfillment channel.",
      },
    ])
  })
})

describe("OpencodePlanner", () => {
  it("creates workflow drafts with SDK validation code, node selection, and draft JSON schema", async () => {
    const workflowDraft = {
      plan: simpleWebhookPlan,
      sdkCode: "await validateWorkflow(workflow)",
      nodeSelection: [
        {
          nodeType: "n8n-nodes-base.webhook",
          reason: "Receives incoming order events.",
        },
      ],
    }
    const client = {
      session: {
        create: vi.fn(async () => ({ id: "session_1" })),
        prompt: vi.fn(async () => ({
          data: {
            info: {},
            parts: [{ type: "text", text: JSON.stringify(workflowDraft) }],
          },
        })),
      },
    }
    const planner = new OpencodePlanner({ client })

    const draft = await planner.createDraft({
      prompt: "Build an order webhook",
      sdkReference: "Use n8n workflow rules",
      nodeDocumentation: [{ nodeType: "n8n-nodes-base.webhook", documentation: "Webhook docs" }],
      suggestedNodes: "Use Webhook for inbound events.",
    })

    expect(draft).toEqual(workflowDraft)
    expect(client.session.create).toHaveBeenCalledWith({ body: { title: "n8n workflow draft planning" } })

    const promptCalls = client.session.prompt.mock.calls as unknown as Array<[
      { body: { parts: Array<{ text: string }>; format?: unknown } },
    ]>
    const promptInput = promptCalls[0]?.[0]
    const promptText = promptInput?.body.parts[0]?.text ?? ""

    expect(promptInput?.body).not.toHaveProperty("format")
    expect(promptText).toContain('"plan"')
    expect(promptText).toContain('"sdkCode"')
    expect(promptText).toContain('"nodeSelection"')
    expect(promptText).toContain('"required": [')
    expect(promptText).toContain("Suggested node guidance:")
    expect(promptText).toContain("Use Webhook for inbound events.")
    expect(promptText).toContain("Explain why each selected node type is needed in nodeSelection.")
  })

  it("creates workflow patch drafts with SDK validation code, node selection, and patch draft JSON schema", async () => {
    const workflowPatchDraft = {
      summary: "Add Slack notification",
      changes: ["Add Slack node"],
      replacementPlan: simpleWebhookPlan,
      sdkCode: "await validateWorkflow(workflow)",
      nodeSelection: [
        {
          nodeType: "n8n-nodes-base.slack",
          reason: "Sends order notifications to the fulfillment channel.",
        },
      ],
    }
    const client = {
      session: {
        create: vi.fn(async () => ({ id: "session_1" })),
        prompt: vi.fn(async () => ({
          data: {
            info: {},
            parts: [{ type: "text", text: JSON.stringify(workflowPatchDraft) }],
          },
        })),
      },
    }
    const planner = new OpencodePlanner({ client })

    const patchDraft = await planner.createPatchDraft({
      prompt: "Notify Slack for each order",
      sdkReference: "Use n8n workflow rules",
      nodeDocumentation: [{ nodeType: "n8n-nodes-base.slack", documentation: "Slack docs" }],
      suggestedNodes: "Use Slack for notifications.",
      currentWorkflowJson: JSON.stringify({ name: "Order webhook" }),
    })

    expect(patchDraft).toEqual(workflowPatchDraft)
    expect(client.session.create).toHaveBeenCalledWith({ body: { title: "n8n workflow update draft planning" } })

    const promptCalls = client.session.prompt.mock.calls as unknown as Array<[
      { body: { parts: Array<{ text: string }>; format?: unknown } },
    ]>
    const promptInput = promptCalls[0]?.[0]
    const promptText = promptInput?.body.parts[0]?.text ?? ""

    expect(promptInput?.body).not.toHaveProperty("format")
    expect(promptText).toContain('"summary"')
    expect(promptText).toContain('"changes"')
    expect(promptText).toContain('"replacementPlan"')
    expect(promptText).toContain('"sdkCode"')
    expect(promptText).toContain('"nodeSelection"')
    expect(promptText).toContain("Suggested node guidance:")
    expect(promptText).toContain("Use Slack for notifications.")
    expect(promptText).toContain("Explain why each selected node type is needed in nodeSelection.")
  })

  it("creates a session, requests JSON workflow plan output, and parses the result", async () => {
    const workflowDraft = {
      plan: simpleWebhookPlan,
      sdkCode: "await validateWorkflow(workflow)",
      nodeSelection: [
        {
          nodeType: "n8n-nodes-base.webhook",
          reason: "Receives incoming order events.",
        },
      ],
    }
    const client = {
      session: {
        create: vi.fn(async () => ({ id: "session_1" })),
        prompt: vi.fn(async () => ({
          data: {
            info: {},
            parts: [{ type: "text", text: JSON.stringify(workflowDraft) }],
          },
        })),
      },
    }
    const planner = new OpencodePlanner({ client })

    const plan = await planner.createPlan({
      prompt: "Build an order webhook",
      sdkReference: "Use n8n workflow rules",
      nodeDocumentation: [{ nodeType: "n8n-nodes-base.webhook", documentation: "Webhook docs" }],
      suggestedNodes: "Use Schedule Trigger for recurring execution.",
    })

    expect(plan).toEqual(simpleWebhookPlan)
    expect(client.session.create).toHaveBeenCalledWith({ body: { title: "n8n workflow draft planning" } })
    expect(client.session.prompt).toHaveBeenCalledWith({
      path: { id: "session_1" },
      body: {
        parts: [
          {
            type: "text",
            text: expect.stringContaining("Do not include secret values"),
          },
        ],
      },
    })
    const promptCalls = client.session.prompt.mock.calls as unknown as Array<[
      { body: { parts: Array<{ text: string }>; format?: unknown } },
    ]>
    const promptInput = promptCalls[0]?.[0]
    expect(promptInput?.body).not.toHaveProperty("format")
    expect(promptInput?.body.parts[0]?.text).toContain('"required": [')
    expect(promptInput?.body.parts[0]?.text).toContain("Suggested node guidance:")
    expect(promptInput?.body.parts[0]?.text).toContain("Use Schedule Trigger for recurring execution.")
    expect(promptInput?.body.parts[0]?.text).toContain("Explain why each selected node type is needed in nodeSelection.")
  })

  it("parses JSON from fenced assistant text", async () => {
    const workflowDraft = {
      plan: simpleWebhookPlan,
      sdkCode: "await validateWorkflow(workflow)",
    }
    const client = {
      session: {
        create: vi.fn(async () => ({ id: "session_1" })),
        prompt: vi.fn(async () => ({
          data: {
            info: {},
            parts: [{ type: "text", text: `\`\`\`json\n${JSON.stringify(workflowDraft)}\n\`\`\`` }],
          },
        })),
      },
    }
    const planner = new OpencodePlanner({ client })

    await expect(
      planner.createPlan({
        prompt: "Build an order webhook",
        sdkReference: "Use n8n workflow rules",
        nodeDocumentation: [],
      }),
    ).resolves.toEqual(simpleWebhookPlan)
  })

  it("throws a typed error when OpenCode returns no assistant text", async () => {
    const client = {
      session: {
        create: vi.fn(async () => ({ id: "session_1" })),
        prompt: vi.fn(async () => ({ data: { info: {} } })),
      },
    }
    const planner = new OpencodePlanner({ client })

    let error: unknown
    try {
      await planner.createPlan({
        prompt: "Build an order webhook",
        sdkReference: "Use n8n workflow rules",
        nodeDocumentation: [],
      })
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(N8nBuilderError)
    expect((error as N8nBuilderError).code).toBe("OPENCODE_PLANNER_EMPTY")
  })

  it("creates patch plans with current workflow context and validates JSON output", async () => {
    const patchDraft = {
      summary: "Add Slack notification",
      changes: ["Add Slack node"],
      replacementPlan: simpleWebhookPlan,
      sdkCode: "await validateWorkflow(workflow)",
    }
    const client = {
      session: {
        create: vi.fn(async () => ({ id: "session_1" })),
        prompt: vi.fn(async () => ({
          data: {
            info: {},
            parts: [{ type: "text", text: JSON.stringify(patchDraft) }],
          },
        })),
      },
    }
    const planner = new OpencodePlanner({ client })

    const plan = await planner.createPatchPlan({
      prompt: "Notify Slack for each order",
      sdkReference: "Use n8n workflow rules",
      nodeDocumentation: [{ nodeType: "n8n-nodes-base.slack", documentation: "Slack docs" }],
      suggestedNodes: "Use Schedule Trigger for recurring execution.",
      currentWorkflowJson: JSON.stringify({ name: "Order webhook" }),
    })

    expect(plan.summary).toBe("Add Slack notification")
    expect(plan.changes).toEqual(["Add Slack node"])
    expect(plan.replacementPlan).toEqual(simpleWebhookPlan)
    expect(client.session.prompt).toHaveBeenCalledWith({
      path: { id: "session_1" },
      body: {
        parts: [
          {
            type: "text",
            text: expect.stringContaining("Current workflow JSON"),
          },
        ],
      },
    })
    const promptCalls = client.session.prompt.mock.calls as unknown as Array<[
      { body: { parts: Array<{ text: string }>; format?: unknown } },
    ]>
    const promptInput = promptCalls[0]?.[0]
    expect(promptInput?.body).not.toHaveProperty("format")
    expect(promptInput?.body.parts[0]?.text).toContain("Suggested node guidance:")
    expect(promptInput?.body.parts[0]?.text).toContain("Use Schedule Trigger for recurring execution.")
    expect(promptInput?.body.parts[0]?.text).toContain("Explain why each selected node type is needed in nodeSelection.")
  })

  it("redacts secret-looking values from current workflow JSON in patch prompts", async () => {
    const patchDraft = {
      summary: "Add Slack notification",
      changes: ["Add Slack node"],
      replacementPlan: simpleWebhookPlan,
      sdkCode: "await validateWorkflow(workflow)",
    }
    const client = {
      session: {
        create: vi.fn(async () => ({ id: "session_1" })),
        prompt: vi.fn(async (_input: unknown) => ({
          data: {
            info: {},
            parts: [{ type: "text", text: JSON.stringify(patchDraft) }],
          },
        })),
      },
    }
    const planner = new OpencodePlanner({ client })

    await planner.createPatchPlan({
      prompt: "Notify Slack for each order",
      sdkReference: "Use n8n workflow rules",
      nodeDocumentation: [],
      currentWorkflowJson: JSON.stringify({
        name: "Order webhook",
        nodes: [
          {
            parameters: {
              token: "token-secret-value",
              password: "password-secret-value",
              nested: {
                accessToken: "access-secret-value",
              },
            },
          },
        ],
      }),
    })

    const promptInput = client.session.prompt.mock.calls[0]?.[0] as
      | { body: { parts: Array<{ text: string }> } }
      | undefined
    const promptText = promptInput?.body.parts[0]?.text ?? ""

    expect(promptText).toContain("[REDACTED]")
    expect(promptText).not.toContain("token-secret-value")
    expect(promptText).not.toContain("password-secret-value")
    expect(promptText).not.toContain("access-secret-value")
  })

  it("redacts authorization bearer values stored under generic header name/value pairs", async () => {
    const patchDraft = {
      summary: "Add Slack notification",
      changes: ["Add Slack node"],
      replacementPlan: simpleWebhookPlan,
      sdkCode: "await validateWorkflow(workflow)",
    }
    const client = {
      session: {
        create: vi.fn(async () => ({ id: "session_1" })),
        prompt: vi.fn(async (_input: unknown) => ({
          data: {
            info: {},
            parts: [{ type: "text", text: JSON.stringify(patchDraft) }],
          },
        })),
      },
    }
    const planner = new OpencodePlanner({ client })

    await planner.createPatchPlan({
      prompt: "Notify Slack for each order",
      sdkReference: "Use n8n workflow rules",
      nodeDocumentation: [],
      currentWorkflowJson: JSON.stringify({
        nodes: [
          {
            parameters: {
              headers: [{ name: "Authorization", value: "Bearer real-token" }],
            },
          },
        ],
      }),
    })

    const promptInput = client.session.prompt.mock.calls[0]?.[0] as
      | { body: { parts: Array<{ text: string }> } }
      | undefined
    const promptText = promptInput?.body.parts[0]?.text ?? ""

    expect(promptText).toContain("[REDACTED]")
    expect(promptText).not.toContain("real-token")
    expect(promptText).not.toContain("Bearer real-token")
  })

  it("redacts API key header values paired with generic headerName/headerValue fields", async () => {
    const patchDraft = {
      summary: "Add Slack notification",
      changes: ["Add Slack node"],
      replacementPlan: simpleWebhookPlan,
      sdkCode: "await validateWorkflow(workflow)",
    }
    const client = {
      session: {
        create: vi.fn(async () => ({ id: "session_1" })),
        prompt: vi.fn(async (_input: unknown) => ({
          data: {
            info: {},
            parts: [{ type: "text", text: JSON.stringify(patchDraft) }],
          },
        })),
      },
    }
    const planner = new OpencodePlanner({ client })

    await planner.createPatchPlan({
      prompt: "Notify Slack for each order",
      sdkReference: "Use n8n workflow rules",
      nodeDocumentation: [],
      currentWorkflowJson: JSON.stringify({
        nodes: [
          {
            parameters: {
              headerName: "X-API-Key",
              headerValue: "plain-api-key",
            },
          },
        ],
      }),
    })

    const promptInput = client.session.prompt.mock.calls[0]?.[0] as
      | { body: { parts: Array<{ text: string }> } }
      | undefined
    const promptText = promptInput?.body.parts[0]?.text ?? ""

    expect(promptText).toContain("[REDACTED]")
    expect(promptText).not.toContain("plain-api-key")
  })

  it("throws a typed error when OpenCode reports structured planning failure", async () => {
    const client = {
      session: {
        create: vi.fn(async () => ({ id: "session_1" })),
        prompt: vi.fn(async () => ({
          data: {
            info: {
              error: { message: "planning failed" },
            },
          },
        })),
      },
    }
    const planner = new OpencodePlanner({ client })

    let error: unknown
    try {
      await planner.createPlan({
        prompt: "Build an order webhook",
        sdkReference: "Use n8n workflow rules",
        nodeDocumentation: [],
      })
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(N8nBuilderError)
    expect((error as N8nBuilderError).code).toBe("OPENCODE_PLANNER_ERROR")
    expect((error as N8nBuilderError).message).toBe("planning failed")
  })

  it("throws a typed error when structured workflow draft output is invalid", async () => {
    const client = {
      session: {
        create: vi.fn(async () => ({ id: "session_1" })),
        prompt: vi.fn(async () => ({
          data: {
            info: {},
            parts: [{ type: "text", text: JSON.stringify({ name: "bad" }) }],
          },
        })),
      },
    }
    const planner = new OpencodePlanner({ client })

    let error: unknown
    try {
      await planner.createPlan({
        prompt: "Build an order webhook",
        sdkReference: "Use n8n workflow rules",
        nodeDocumentation: [],
      })
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(N8nBuilderError)
    expect((error as N8nBuilderError).code).toBe("OPENCODE_PLANNER_ERROR")
    expect((error as N8nBuilderError).message).toBe("OpenCode structured planning returned an invalid WorkflowDraft.")
  })

  it("throws a typed error when structured workflow patch draft output is invalid", async () => {
    const client = {
      session: {
        create: vi.fn(async () => ({ id: "session_1" })),
        prompt: vi.fn(async () => ({
          data: {
            info: {},
            parts: [{ type: "text", text: JSON.stringify({ summary: "bad" }) }],
          },
        })),
      },
    }
    const planner = new OpencodePlanner({ client })

    let error: unknown
    try {
      await planner.createPatchDraft({
        prompt: "Notify Slack for each order",
        sdkReference: "Use n8n workflow rules",
        nodeDocumentation: [],
        currentWorkflowJson: JSON.stringify({ name: "Order webhook" }),
      })
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(N8nBuilderError)
    expect((error as N8nBuilderError).code).toBe("OPENCODE_PLANNER_ERROR")
    expect((error as N8nBuilderError).message).toBe(
      "OpenCode structured planning returned an invalid WorkflowPatchDraft.",
    )
  })
})
