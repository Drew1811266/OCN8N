import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { stableHash } from "../src/hash.js"
import { compileV2Preview } from "../src/tools/v2-compile-preview.js"
import { createInitialV2Plan } from "../src/v2/plan-service.js"
import { V2PlanStore } from "../src/v2/plan-store.js"
import { V2PreviewStore } from "../src/v2/preview-store.js"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ocn8n-v2-compile-preview-tool-"))
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

describe("compileV2Preview", () => {
  it("compiles and stores a preview for a valid plan version", async () => {
    const plans = planStore()
    const previews = previewStore()
    const version = await plans.saveInitial({
      plan: createInitialV2Plan({
        name: "Order fulfillment",
        prompt:
          "Create a webhook order workflow that maps fields, branches by status with a default path, calls an external fulfillment API with API key auth and mock response schema, retries failures, sends Slack notification, writes the result, and responds to the webhook.",
      }),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Initial plan",
    })

    const result = await compileV2Preview({
      args: { planId: version.planId, planVersion: version.planVersion },
      planStore: plans,
      previewStore: previews,
      pluginVersion: "2.0.0",
      now: () => new Date("2026-06-11T00:10:00.000Z"),
    })

    expect(result).toEqual(
      expect.objectContaining({
        planId: version.planId,
        planVersion: version.planVersion,
        validationStatus: "passed",
        mcpValidationStatus: "not_configured",
        nodeCount: 6,
        workflowName: "Order fulfillment",
      }),
    )
    expect(result.previewId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(result.mappingTrace).toEqual(
      expect.arrayContaining([expect.objectContaining({ stepId: "step_external_call" })]),
    )

    const stored = await previews.get(result.previewId)
    expect(stored?.workflowHash).toBe(result.workflowHash)
    expect(stored?.workflowHash).toBe(stableHash(stored?.workflow))
  })

  it("validates a compiled preview through MCP when configured", async () => {
    const plans = planStore()
    const previews = previewStore()
    const mcp = {
      validateWorkflowCode: vi.fn().mockResolvedValue({
        valid: true,
        nodeCount: 6,
        warnings: [
          {
            code: "NODE_PARAMETER_OPTIONAL",
            message: "Optional response field is not configured.",
            nodeName: "Respond to Webhook",
          },
        ],
        errors: [],
      }),
    }
    const version = await plans.saveInitial({
      plan: createInitialV2Plan({
        name: "Order fulfillment",
        prompt:
          "Create a webhook order workflow that maps fields, branches by status with a default path, calls an external fulfillment API with API key auth and mock response schema, retries failures, sends Slack notification, writes the result, and responds to the webhook.",
      }),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Initial plan",
    })

    const result = await compileV2Preview({
      args: { planId: version.planId, planVersion: version.planVersion },
      planStore: plans,
      previewStore: previews,
      pluginVersion: "2.0.0",
      mcp,
      now: () => new Date("2026-06-11T00:10:00.000Z"),
    })

    expect(mcp.validateWorkflowCode).toHaveBeenCalledTimes(1)
    expect(mcp.validateWorkflowCode.mock.calls[0]?.[0]).toContain("new Workflow")
    expect(result.mcpValidationStatus).toBe("warning")
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MCP_NODE_PARAMETER_OPTIONAL",
          message: "Optional response field is not configured.",
        }),
      ]),
    )

    const stored = await previews.get(result.previewId)
    expect(stored?.warnings).toEqual(result.warnings)
  })

  it("marks configured MCP validation as passed when it returns no warnings", async () => {
    const plans = planStore()
    const previews = previewStore()
    const mcp = {
      validateWorkflowCode: vi.fn().mockResolvedValue({
        valid: true,
        warnings: [],
        errors: [],
      }),
    }
    const version = await plans.saveInitial({
      plan: createInitialV2Plan({
        prompt:
          "Create a webhook order workflow that maps fields, branches by status, calls an external fulfillment API, retries failures, and responds to the webhook.",
      }),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Initial plan",
    })

    const result = await compileV2Preview({
      args: { planId: version.planId, planVersion: version.planVersion },
      planStore: plans,
      previewStore: previews,
      pluginVersion: "2.0.0",
      mcp,
    })

    expect(mcp.validateWorkflowCode).toHaveBeenCalledTimes(1)
    expect(result.mcpValidationStatus).toBe("passed")
    expect(result.warnings.some((warning) => warning.code.startsWith("MCP_"))).toBe(false)
  })

  it("blocks preview persistence when MCP validation fails", async () => {
    const plans = planStore()
    const previews = previewStore()
    const version = await plans.saveInitial({
      plan: createInitialV2Plan({
        prompt:
          "Create a webhook order workflow that maps fields, branches by status, calls an external fulfillment API, retries failures, and responds to the webhook.",
      }),
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Initial plan",
    })

    await expect(
      compileV2Preview({
        args: { planId: version.planId, planVersion: version.planVersion },
        planStore: plans,
        previewStore: previews,
        pluginVersion: "2.0.0",
        mcp: {
          validateWorkflowCode: vi.fn().mockResolvedValue({
            valid: false,
            nodeCount: 6,
            warnings: [],
            errors: ["Webhook node path is invalid."],
          }),
        },
      }),
    ).rejects.toMatchObject({
      code: "MCP_WORKFLOW_VALIDATION_FAILED",
      details: { errors: ["Webhook node path is invalid."] },
    })
  })

  it("throws typed errors for missing and invalid plan versions", async () => {
    const plans = planStore()
    const previews = previewStore()
    const missingPlan = {
      planId: "123e4567-e89b-12d3-a456-426614174000",
      planVersion: 1,
    }

    await expect(
      compileV2Preview({
        args: missingPlan,
        planStore: plans,
        previewStore: previews,
        pluginVersion: "2.0.0",
      }),
    ).rejects.toMatchObject({ code: "V2_PLAN_NOT_FOUND", details: missingPlan })

    const invalid = await plans.saveInitial({
      plan: {
        ...createInitialV2Plan({ prompt: "Create a webhook workflow" }),
        outputs: [],
      },
      createdAt: "2026-06-11T00:00:00.000Z",
      summary: "Invalid plan",
    })

    await expect(
      compileV2Preview({
        args: { planId: invalid.planId, planVersion: invalid.planVersion },
        planStore: plans,
        previewStore: previews,
        pluginVersion: "2.0.0",
      }),
    ).rejects.toMatchObject({ code: "V2_PLAN_NOT_VALID" })
  })
})
