import { describe, expect, it, vi } from "vitest"
import { N8nBuilderError } from "../src/errors.js"
import { OpencodePlanner } from "../src/opencode-planner.js"
import { simpleWebhookPlan } from "./fixtures/workflows.js"

describe("OpencodePlanner", () => {
  it("creates a session, requests structured workflow plan output, and parses the result", async () => {
    const client = {
      session: {
        create: vi.fn(async () => ({ id: "session_1" })),
        prompt: vi.fn(async () => ({
          data: {
            info: {
              structured_output: simpleWebhookPlan,
            },
          },
        })),
      },
    }
    const planner = new OpencodePlanner({ client })

    const plan = await planner.createPlan({
      prompt: "Build an order webhook",
      sdkReference: "Use n8n workflow rules",
      nodeDocumentation: [{ nodeType: "n8n-nodes-base.webhook", documentation: "Webhook docs" }],
    })

    expect(plan).toEqual(simpleWebhookPlan)
    expect(client.session.create).toHaveBeenCalledWith({ body: { title: "n8n workflow planning" } })
    expect(client.session.prompt).toHaveBeenCalledWith({
      path: { id: "session_1" },
      body: {
        parts: [
          {
            type: "text",
            text: expect.stringContaining("Do not include secret values"),
          },
        ],
        format: {
          type: "json_schema",
          schema: expect.objectContaining({
            type: "object",
            required: ["name", "summary", "nodes", "connections"],
          }),
          retryCount: 2,
        },
      },
    })
  })

  it("throws a typed error when OpenCode returns no structured output", async () => {
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

  it("creates patch plans with current workflow context and validates structured output", async () => {
    const patchPlan = {
      summary: "Add Slack notification",
      changes: ["Add Slack node"],
      replacementPlan: simpleWebhookPlan,
    }
    const client = {
      session: {
        create: vi.fn(async () => ({ id: "session_1" })),
        prompt: vi.fn(async () => ({
          data: {
            info: {
              structured_output: patchPlan,
            },
          },
        })),
      },
    }
    const planner = new OpencodePlanner({ client })

    const plan = await planner.createPatchPlan({
      prompt: "Notify Slack for each order",
      sdkReference: "Use n8n workflow rules",
      nodeDocumentation: [{ nodeType: "n8n-nodes-base.slack", documentation: "Slack docs" }],
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
        format: expect.objectContaining({
          type: "json_schema",
        }),
      },
    })
  })

  it("redacts secret-looking values from current workflow JSON in patch prompts", async () => {
    const patchPlan = {
      summary: "Add Slack notification",
      changes: ["Add Slack node"],
      replacementPlan: simpleWebhookPlan,
    }
    const client = {
      session: {
        create: vi.fn(async () => ({ id: "session_1" })),
        prompt: vi.fn(async (_input: unknown) => ({
          data: {
            info: {
              structured_output: patchPlan,
            },
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

  it("throws a typed error when structured workflow plan output is invalid", async () => {
    const client = {
      session: {
        create: vi.fn(async () => ({ id: "session_1" })),
        prompt: vi.fn(async () => ({
          data: {
            info: {
              structured_output: { name: "bad" },
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
    expect((error as N8nBuilderError).message).toBe("OpenCode structured planning returned an invalid WorkflowPlan.")
  })
})
