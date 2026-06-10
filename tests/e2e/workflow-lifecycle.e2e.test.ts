import { afterEach, describe, expect, it } from "vitest"
import type { N8nBuilderError } from "../../src/errors.js"
import { buildWorkflow } from "../../src/tools/build-workflow.js"
import { inspectWorkflow } from "../../src/tools/inspect-workflow.js"
import { listManagedWorkflows } from "../../src/tools/list-managed-workflows.js"
import { updateWorkflow } from "../../src/tools/update-workflow.js"
import type { N8nWorkflow } from "../../src/validator.js"
import { cleanupE2eContext, createE2eContext, trackWorkflow, type E2eContext } from "./helpers/e2e-clients.js"
import {
  e2eApiPollingNoticePlan,
  e2eManualSetPlan,
  e2eManualSetSdkCode,
  e2eScheduleHttpIfSetPlan,
  e2eUpdatedManualIfPlan,
  e2eUpdatedManualIfSdkCode,
  e2eWebhookBranchMergePlan,
  e2eWebhookTransformResponsePlan,
} from "./helpers/test-workflows.js"

let context: E2eContext | undefined

afterEach(async () => {
  if (!context) {
    return
  }

  const currentContext = context
  context = undefined
  await cleanupE2eContext(currentContext)
})

function deterministicPlanner() {
  return {
    createDraft: async () => ({
      plan: e2eManualSetPlan,
      sdkCode: e2eManualSetSdkCode,
      nodeSelection: [
        {
          nodeType: "n8n-nodes-base.manualTrigger",
          reason: "Starts the workflow manually.",
        },
        {
          nodeType: "n8n-nodes-base.set",
          reason: "Creates deterministic test data.",
        },
      ],
    }),
    createPatchDraft: async () => ({
      ...e2eUpdatedManualIfPlan,
      sdkCode: e2eUpdatedManualIfSdkCode,
      nodeSelection: [
        {
          nodeType: "n8n-nodes-base.manualTrigger",
          reason: "Preserves the manual workflow entry point.",
        },
        {
          nodeType: "n8n-nodes-base.set",
          reason: "Preserves deterministic test data creation.",
        },
        {
          nodeType: "n8n-nodes-base.if",
          reason: "Branches on the generated message.",
        },
      ],
    }),
  }
}

function deterministicNow(isoDate: string): () => Date {
  return () => new Date(isoDate)
}

function trackingBuildApi(currentContext: E2eContext): {
  createWorkflow(workflow: N8nWorkflow): Promise<N8nWorkflow & { id: string }>
} {
  return {
    createWorkflow: async (workflow) => {
      const created = await currentContext.api.createWorkflow(workflow)
      trackWorkflow(currentContext, created.id)
      return created
    },
  }
}

function workflowWithoutApiFields(workflow: N8nWorkflow & { id: string }): N8nWorkflow {
  return {
    name: workflow.name,
    active: workflow.active,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings,
    meta: workflow.meta,
  }
}

describe("managed workflow lifecycle E2E", () => {
  it("creates, inspects, previews, applies, lists, and cleans up a managed workflow", async () => {
    context = await createE2eContext()

    const buildResult = await buildWorkflow({
      args: {
        prompt: "Create a manual trigger workflow that sets a message field",
        name: `${context.runId} manual set`,
      },
      config: context.config,
      api: trackingBuildApi(context),
      registry: context.registry,
      planner: deterministicPlanner(),
      mcp: context.mcp,
      now: deterministicNow("2026-06-08T00:00:00.000Z"),
    })

    expect(buildResult.workflowId).toEqual(expect.any(String))
    expect(buildResult.nodeCount).toBe(2)

    const createdWorkflow = await context.api.getWorkflow(buildResult.workflowId)
    expect(createdWorkflow.active).toBe(false)
    expect(createdWorkflow.tags).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "opencode-n8n-builder" })]),
    )

    const inspectResult = await inspectWorkflow({
      args: { workflowId: buildResult.workflowId },
      baseUrl: context.config.baseUrl,
      api: context.api,
      registry: context.registry,
    })
    expect(inspectResult.nodes.map((node) => node.type)).toEqual([
      "n8n-nodes-base.manualTrigger",
      "n8n-nodes-base.set",
    ])

    const previewResult = await updateWorkflow({
      args: {
        workflowId: buildResult.workflowId,
        mode: "preview",
        prompt: "Add an IF check after the Set node",
      },
      config: context.config,
      api: context.api,
      registry: context.registry,
      previewStore: context.previewStore,
      planner: deterministicPlanner(),
      mcp: context.mcp,
      now: deterministicNow("2026-06-08T00:05:00.000Z"),
    })
    expect(previewResult.mode).toBe("preview")
    expect(previewResult.previewId).toEqual(expect.any(String))

    const beforeApply = await context.api.getWorkflow(buildResult.workflowId)
    expect(beforeApply.nodes.map((node) => node.name)).not.toContain("IF Message")

    const applyResult = await updateWorkflow({
      args: {
        workflowId: buildResult.workflowId,
        mode: "apply",
        previewId: previewResult.previewId as string,
      },
      config: context.config,
      api: context.api,
      registry: context.registry,
      previewStore: context.previewStore,
      now: deterministicNow("2026-06-08T00:06:00.000Z"),
    })
    expect(applyResult.mode).toBe("apply")

    const afterApply = await context.api.getWorkflow(buildResult.workflowId)
    expect(afterApply.nodes.map((node) => node.name)).toContain("IF Message")
    expect(afterApply.active).toBe(false)

    const listResult = await listManagedWorkflows({
      registry: context.registry,
    })
    expect(listResult.workflows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workflowId: buildResult.workflowId,
        }),
      ]),
    )
  })

  it("creates the v0.4 low-risk compatibility scenario workflows", async () => {
    context = await createE2eContext()
    const scenarios = [
      e2eWebhookTransformResponsePlan,
      e2eScheduleHttpIfSetPlan,
      e2eWebhookBranchMergePlan,
      e2eApiPollingNoticePlan,
    ]

    for (const [index, plan] of scenarios.entries()) {
      const buildResult = await buildWorkflow({
        args: {
          prompt: `Create v0.4 compatibility scenario ${index + 1}`,
          name: `${context.runId} ${plan.name}`,
        },
        config: context.config,
        api: trackingBuildApi(context),
        registry: context.registry,
        planner: {
          createDraft: async () => ({
            plan,
            sdkCode: "generated from compiled workflow by plugin",
            nodeSelection: plan.nodes.map((node) => ({
              nodeType: node.type,
              reason: `Scenario fixture uses ${node.name}.`,
            })),
          }),
        },
        mcp: context.mcp,
        now: deterministicNow(`2026-06-08T00:${String(index).padStart(2, "0")}:00.000Z`),
      })

      expect(buildResult.workflowId).toEqual(expect.any(String))
      expect(buildResult.nodeCount).toBe(plan.nodes.length)
      expect(buildResult.warnings.filter((warning) => warning.code === "NODE_COMPATIBILITY_DYNAMIC")).toEqual([])

      const createdWorkflow = await context.api.getWorkflow(buildResult.workflowId)
      expect(createdWorkflow.active).toBe(false)
      expect(createdWorkflow.nodes.map((node) => node.type)).toEqual(plan.nodes.map((node) => node.type))
    }
  })

  it("blocks inspect and preview when registry ownership is missing", async () => {
    context = await createE2eContext()
    const workflow = await context.api.createWorkflow({
      name: `${context.runId} unmanaged registry`,
      active: false,
      nodes: [
        {
          name: "Manual Trigger",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
      ],
      connections: {},
      settings: {},
      meta: {
        managedBy: "opencode-n8n-builder",
        managedByVersion: "0.3.0-e2e",
        createdAt: "2026-06-08T00:00:00.000Z",
      },
    })
    trackWorkflow(context, workflow.id)

    await expect(
      inspectWorkflow({
        args: { workflowId: workflow.id },
        baseUrl: context.config.baseUrl,
        api: context.api,
        registry: context.registry,
      }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_INSPECT_BLOCKED",
    } satisfies Partial<N8nBuilderError>)

    await expect(
      updateWorkflow({
        args: { workflowId: workflow.id, mode: "preview", prompt: "Add IF" },
        config: context.config,
        api: context.api,
        registry: context.registry,
        previewStore: context.previewStore,
        planner: deterministicPlanner(),
        mcp: context.mcp,
        now: deterministicNow("2026-06-08T00:05:00.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "WORKFLOW_UPDATE_BLOCKED",
    } satisfies Partial<N8nBuilderError>)
  })

  it("rejects stale preview apply when workflow changed after preview", async () => {
    context = await createE2eContext()
    const buildResult = await buildWorkflow({
      args: {
        prompt: "Create a manual trigger workflow that sets a message field",
        name: `${context.runId} stale preview`,
      },
      config: context.config,
      api: trackingBuildApi(context),
      registry: context.registry,
      planner: deterministicPlanner(),
      mcp: context.mcp,
      now: deterministicNow("2026-06-08T00:00:00.000Z"),
    })

    const previewResult = await updateWorkflow({
      args: { workflowId: buildResult.workflowId, mode: "preview", prompt: "Add IF" },
      config: context.config,
      api: context.api,
      registry: context.registry,
      previewStore: context.previewStore,
      planner: deterministicPlanner(),
      mcp: context.mcp,
      now: deterministicNow("2026-06-08T00:05:00.000Z"),
    })

    const current = await context.api.getWorkflow(buildResult.workflowId)
    await context.api.updateWorkflow(buildResult.workflowId, {
      ...workflowWithoutApiFields(current),
      name: `${current.name} external change`,
    })

    await expect(
      updateWorkflow({
        args: {
          workflowId: buildResult.workflowId,
          mode: "apply",
          previewId: previewResult.previewId as string,
        },
        config: context.config,
        api: context.api,
        registry: context.registry,
        previewStore: context.previewStore,
        now: deterministicNow("2026-06-08T00:06:00.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "UPDATE_PREVIEW_STALE",
    } satisfies Partial<N8nBuilderError>)
  })
})
