import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { autoPreviewV2Workflow } from "../src/tools/v2-auto-preview.js"
import { V2PlanStore } from "../src/v2/plan-store.js"
import { V2PreviewStore } from "../src/v2/preview-store.js"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ocn8n-v2-auto-preview-tool-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function planStore(): V2PlanStore {
  return new V2PlanStore(path.join(dir, ".opencode", "n8n-v2", "plans"))
}

function previewStore(): V2PreviewStore {
  return new V2PreviewStore(path.join(dir, ".opencode", "n8n-v2", "previews"))
}

describe("autoPreviewV2Workflow", () => {
  it("creates, reviews, simulates, compiles, and stores a local preview", async () => {
    const plans = planStore()
    const previews = previewStore()

    const result = await autoPreviewV2Workflow({
      args: {
        name: "Order fulfillment",
        prompt:
          "Create a webhook order workflow that maps fields, filters invalid orders, branches by status with a default path, processes each item in batches, calls an external fulfillment API with API key auth and mock response schema, retries failures, sends Slack notification, writes the result, and responds to the webhook.",
      },
      planStore: plans,
      previewStore: previews,
      pluginVersion: "2.0.0",
      now: () => new Date("2026-06-11T01:00:00.000Z"),
    })

    expect(result).toEqual(
      expect.objectContaining({
        planVersion: 1,
        workflowName: "Order fulfillment",
        nodeCount: 7,
        validationStatus: "passed",
        mcpValidationStatus: "not_configured",
        confidence: "medium",
        riskLevel: "medium",
      }),
    )
    expect(result.previewId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(result.review.summary).toContain("pattern")
    expect(result.simulation.status).toBe("passed")
    expect(result.mappingTrace).toEqual(
      expect.arrayContaining([expect.objectContaining({ stepId: "step_external_call" })]),
    )

    const storedPlan = await plans.get(result.planId, result.planVersion)
    const storedPreview = await previews.get(result.previewId)
    expect(storedPlan?.plan.intent.scope).toEqual(["Order fulfillment"])
    expect(storedPreview?.planId).toBe(result.planId)
    expect(storedPreview?.workflowHash).toBe(result.workflowHash)
  })

  it("passes configured MCP validation through compile during auto preview", async () => {
    const plans = planStore()
    const previews = previewStore()
    const mcp = {
      validateWorkflowCode: vi.fn().mockResolvedValue({
        valid: true,
        warnings: [
          {
            code: "NODE_PARAMETER_OPTIONAL",
            message: "Optional field should be reviewed.",
          },
        ],
        errors: [],
      }),
    }

    const result = await autoPreviewV2Workflow({
      args: {
        name: "Order fulfillment",
        prompt:
          "Create a webhook order workflow that maps fields, filters invalid orders, branches by status with a default path, processes each item in batches, calls an external fulfillment API with API key auth and mock response schema, retries failures, sends Slack notification, writes the result, and responds to the webhook.",
      },
      planStore: plans,
      previewStore: previews,
      pluginVersion: "2.0.0",
      mcp,
      now: () => new Date("2026-06-11T01:00:00.000Z"),
    })

    expect(mcp.validateWorkflowCode).toHaveBeenCalledTimes(1)
    expect(result.mcpValidationStatus).toBe("warning")
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MCP_NODE_PARAMETER_OPTIONAL",
          message: "Optional field should be reviewed.",
        }),
      ]),
    )
  })

  it("rejects blank prompts before creating artifacts", async () => {
    const plans = planStore()
    const previews = previewStore()

    await expect(
      autoPreviewV2Workflow({
        args: { prompt: "   " },
        planStore: plans,
        previewStore: previews,
        pluginVersion: "2.0.0",
      }),
    ).rejects.toMatchObject({
      code: "TOOL_ARGS_INVALID",
      details: { field: "prompt" },
    })
  })
})
