import { describe, expect, it } from "vitest"
import type {
  BuildWorkflowArgs,
  BuildWorkflowResult,
  CheckWorkflowReadinessArgs,
  CheckWorkflowReadinessResult,
  ClaimWorkflowArgs,
  ClaimWorkflowResult,
  CredentialSetupAction,
  InspectWorkflowArgs,
  InspectWorkflowResult,
  ListManagedWorkflowsResult,
  N8nWorkflow,
  RuntimeDiagnostics,
  UpdatePreview,
  UpdateWorkflowArgs,
  UpdateWorkflowResult,
  V2ArtifactPaths,
  V2Plan,
  V2PlanPattern,
  V2PlanReview,
  V2PlanVersion,
  V2RegistryRecord,
  V2SimulationResult,
  Warning,
  WorkflowDiff,
  WorkflowRegistryRecord,
} from "../src/index.js"
import { createN8nBuilderPlugin, N8nBuilderPlugin } from "../src/index.js"

describe("public package contract exports", () => {
  it("exports the plugin factory and default plugin", () => {
    expect(typeof createN8nBuilderPlugin).toBe("function")
    expect(typeof N8nBuilderPlugin).toBe("function")
  })

  it("exports public tool and artifact types", () => {
    const buildArgs: BuildWorkflowArgs = { prompt: "Create a manual workflow" }
    const buildResult: Pick<BuildWorkflowResult, "workflowId" | "name" | "nodeCount"> = {
      workflowId: "wf_1",
      name: "Manual",
      nodeCount: 1,
    }
    const updateArgs: UpdateWorkflowArgs = { workflowId: "wf_1", mode: "preview", prompt: "Add a field" }
    const updateResult: Pick<UpdateWorkflowResult, "workflowId" | "mode" | "warnings"> = {
      workflowId: "wf_1",
      mode: "preview",
      warnings: [],
    }
    const claimArgs: ClaimWorkflowArgs = { workflowId: "wf_1", mode: "preview" }
    const claimResult: Pick<ClaimWorkflowResult, "workflowId" | "mode" | "eligible"> = {
      workflowId: "wf_1",
      mode: "preview",
      eligible: true,
    }
    const readinessArgs: CheckWorkflowReadinessArgs = { workflowId: "wf_1", mode: "preview" }
    const diagnostics: RuntimeDiagnostics = { supported: false, executions: [] }
    const readinessResult: Pick<CheckWorkflowReadinessResult, "workflowId" | "mode" | "diagnostics"> = {
      workflowId: "wf_1",
      mode: "preview",
      diagnostics,
    }
    const inspectArgs: InspectWorkflowArgs = { workflowId: "wf_1" }
    const inspectResult: Pick<InspectWorkflowResult, "workflowId" | "nodes"> = {
      workflowId: "wf_1",
      nodes: [],
    }
    const listResult: ListManagedWorkflowsResult = { workflows: [] }
    const credentialAction: CredentialSetupAction = {
      nodeName: "Slack",
      credentialType: "slackApi",
      action: "configure_mapping",
      status: "required",
      message: "Configure credential mapping.",
    }
    const warning: Warning = { code: "NODE_COMPATIBILITY_DYNAMIC", message: "Dynamic node." }
    const workflow: N8nWorkflow = {
      name: "Manual",
      active: false,
      nodes: [],
      connections: {},
      settings: {},
    }
    const diff: WorkflowDiff = {
      addedNodes: [],
      removedNodes: [],
      changedNodeParameters: [],
      changedCredentials: [],
      changedConnections: [],
      changedSettings: [],
    }
    const registry: WorkflowRegistryRecord = {
      workflowId: "wf_1",
      name: "Manual",
      url: "https://demo/workflow/wf_1",
      baseUrl: "https://demo/api/v1",
      managedBy: "opencode-n8n-builder",
      managedByVersion: "1.0.0",
      lastPlanHash: "hash",
      lastUpdatedAt: "2026-06-10T00:00:00.000Z",
    }
    const preview: Pick<UpdatePreview, "workflowId" | "baseWorkflow" | "proposedWorkflow" | "diff"> = {
      workflowId: "wf_1",
      baseWorkflow: workflow,
      proposedWorkflow: workflow,
      diff,
    }
    const v2Paths: V2ArtifactPaths = {
      rootDir: "/tmp/project/.opencode/n8n-v2",
      plansDir: "/tmp/project/.opencode/n8n-v2/plans",
      simulationsDir: "/tmp/project/.opencode/n8n-v2/simulations",
      previewsDir: "/tmp/project/.opencode/n8n-v2/previews",
      registryPath: "/tmp/project/.opencode/n8n-v2/registry/workflows.json",
      claimsDir: "/tmp/project/.opencode/n8n-v2/claims",
      runsDir: "/tmp/project/.opencode/n8n-v2/runs",
      exportsDir: "/tmp/project/.opencode/n8n-v2/exports",
    }

    expect({
      buildArgs,
      buildResult,
      updateArgs,
      updateResult,
      claimArgs,
      claimResult,
      readinessArgs,
      readinessResult,
      inspectArgs,
      inspectResult,
      listResult,
      credentialAction,
      warning,
      workflow,
      diff,
      registry,
      preview,
      v2Paths,
    }).toBeDefined()
  })

  it("exports v2 plan artifact contract types", () => {
    const pattern: V2PlanPattern = {
      id: "pattern_trigger_1",
      family: "trigger",
      variant: "webhook",
      summary: "Receive order payloads.",
      confidence: "high",
      riskLevel: "low",
      warnings: [],
    }
    const plan: V2Plan = {
      intent: {
        goal: "Receive order payloads and return an acknowledgement.",
        scope: ["webhook input", "response output"],
        nonGoals: ["production activation"],
      },
      inputs: [
        {
          id: "input_webhook",
          mode: "webhook",
          schema: { orderId: "string" },
          samples: [{ orderId: "ord_1" }],
        },
      ],
      entities: [{ name: "Order", fields: { orderId: "string" } }],
      steps: [
        {
          id: "step_receive",
          name: "Receive order",
          summary: "Accept order input.",
          patternIds: ["pattern_trigger_1"],
          inputRefs: ["input_webhook"],
          outputRefs: ["Order"],
        },
      ],
      patterns: [pattern],
      branches: [],
      loops: [],
      externalCalls: [],
      errorPolicy: { strategy: "fail_fast", notifications: [] },
      outputs: [
        {
          id: "output_response",
          mode: "respond_to_webhook",
          contract: { accepted: "boolean" },
        },
      ],
      testContract: {
        examples: [
          {
            name: "valid order",
            input: { orderId: "ord_1" },
            expectedOutput: { accepted: true },
          },
        ],
        edgeCases: [],
      },
      credentialRequirements: [],
      confidence: "high",
      riskLevel: "low",
      warnings: [],
      trace: ["Mapped webhook request to trigger and response patterns."],
    }
    const version: V2PlanVersion = {
      planId: "123e4567-e89b-12d3-a456-426614174000",
      planVersion: 1,
      plan,
      createdAt: "2026-06-11T00:00:00.000Z",
      source: "create",
      summary: "Initial plan",
      contentHash: "hash",
    }
    const review: V2PlanReview = {
      planId: version.planId,
      planVersion: version.planVersion,
      summary: "Plan is ready for validation.",
      patternReviews: [],
      assumptions: [],
      risks: [],
      openQuestions: [],
      simulationCoverage: [],
      confidence: "high",
      riskLevel: "low",
    }
    const simulation: V2SimulationResult = {
      planId: version.planId,
      planVersion: version.planVersion,
      status: "passed",
      checkedAt: "2026-06-11T00:00:00.000Z",
      issues: [],
      sampleResults: [],
      fieldTraces: [],
    }
    const registry: V2RegistryRecord = {
      workflowId: "wf_1",
      name: "Orders",
      url: "https://demo/workflow/wf_1",
      baseUrl: "https://demo/api/v1",
      claimMode: "full",
      activeAtClaim: false,
      managedBy: "opencode-n8n-builder-v2",
      managedByVersion: "2.0.0",
      latestPlanId: version.planId,
      latestPlanVersion: version.planVersion,
      latestWorkflowHash: "workflow_hash",
      lastUpdatedAt: "2026-06-11T00:00:00.000Z",
    }

    expect({ pattern, plan, version, review, simulation, registry }).toBeDefined()
  })
})
