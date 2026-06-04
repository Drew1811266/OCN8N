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
})
