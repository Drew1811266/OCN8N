import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import type {
  N8nWorkflow,
  V2ArtifactPaths,
  V2ApplyArgs,
  V2ApplyResult,
  V2AutoPreviewArgs,
  V2AutoPreviewResult,
  V2ClaimedWorkflowSummary,
  V2ClaimWorkflowAction,
  V2ClaimWorkflowArgs,
  V2ClaimWorkflowResult,
  V2ClaimWorkflowRisk,
  V2ClaimWorkflowRiskCode,
  V2CompiledPreview,
  V2CompilePreviewArgs,
  V2CompilePreviewResult,
  V2McpValidationStatus,
  V2CreatePlanArgs,
  V2CreatePlanResult,
  V2PatchPlanArgs,
  V2PatchPlanResult,
  V2PatternCatalog,
  V2PatternCatalogEntry,
  V2Plan,
  V2PlanPattern,
  V2PlanReview,
  V2PlanVersion,
  V2PreviewMappingTrace,
  V2RegistryRecord,
  V2ReversePlanArgs,
  V2ReversePlanResult,
  V2ReverseUnmappedNode,
  V2ReviewPlanArgs,
  V2RunTrialArgs,
  V2RunTrialResult,
  V2SimulationResult,
  V2TrialExecutionMode,
  V2TrialRunArtifact,
  V2TrialRunMode,
  V2ValidateSimulateArgs,
  Warning,
} from "../src/index.js"
import { createN8nBuilderPlugin, N8nBuilderPlugin } from "../src/index.js"

describe("public package contract exports", () => {
  it("exports the plugin factory and default plugin", () => {
    expect(typeof createN8nBuilderPlugin).toBe("function")
    expect(typeof N8nBuilderPlugin).toBe("function")
  })

  it("exports v2 public tool and artifact types", () => {
    const warning: Warning = { code: "V2_WARNING", message: "Review required." }
    const workflow: N8nWorkflow = {
      name: "Orders",
      active: false,
      nodes: [],
      connections: {},
      settings: {},
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
    const createArgs: V2CreatePlanArgs = {
      prompt: "Receive order payloads and return an acknowledgement.",
      name: "Orders",
    }
    const autoPreviewArgs: V2AutoPreviewArgs = createArgs
    const createResult: V2CreatePlanResult = {
      planId: "123e4567-e89b-12d3-a456-426614174000",
      planVersion: 1,
      summary: "Created v2 plan for: Receive order payloads and return an acknowledgement.",
      patternCount: 1,
      confidence: "high",
      riskLevel: "low",
      warnings: [],
    }
    const catalogEntry: V2PatternCatalogEntry = {
      family: "trigger",
      label: "Trigger",
      summary: "Starts the workflow.",
      variants: [],
    }
    const catalog: V2PatternCatalog = { trigger: catalogEntry } as V2PatternCatalog
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
    const reviewArgs: V2ReviewPlanArgs = {
      planId: version.planId,
      planVersion: version.planVersion,
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
    const patchArgs: V2PatchPlanArgs = {
      planId: version.planId,
      planVersion: version.planVersion,
      patch: "Add an error notification.",
    }
    const patchResult: V2PatchPlanResult = {
      planId: version.planId,
      planVersion: 2,
      parentPlanVersion: version.planVersion,
      summary: "Patched v2 plan: Add an error notification.",
      confidence: "medium",
      riskLevel: "low",
      warnings: [],
    }
    const validateArgs: V2ValidateSimulateArgs = {
      planId: version.planId,
      planVersion: version.planVersion,
    }
    const compileArgs: V2CompilePreviewArgs = {
      planId: version.planId,
      planVersion: version.planVersion,
    }
    const mcpValidationStatus: V2McpValidationStatus = "not_configured"
    const applyArgs: V2ApplyArgs = {
      previewId: "123e4567-e89b-12d3-a456-426614174000",
      confirm: true,
    }
    const updateApplyArgs: V2ApplyArgs = {
      previewId: "123e4567-e89b-12d3-a456-426614174000",
      workflowId: "wf_1",
      confirm: true,
    }
    const claimArgs: V2ClaimWorkflowArgs = {
      workflowId: "wf_1",
      mode: "apply",
      confirm: true,
    }
    const reverseArgs: V2ReversePlanArgs = { workflowId: "wf_1" }
    const mappingTrace: V2PreviewMappingTrace = {
      stepId: "step_receive",
      patternIds: ["pattern_trigger_1"],
      nodeNames: ["Receive order"],
      notes: ["Compiled trigger pattern."],
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
    const previewArtifact: V2CompiledPreview = {
      previewId: "123e4567-e89b-12d3-a456-426614174000",
      planId: version.planId,
      planVersion: version.planVersion,
      workflow,
      workflowHash: "workflow_hash",
      mappingTrace: [mappingTrace],
      validationStatus: "passed",
      mcpValidationStatus,
      warnings: [],
      createdAt: "2026-06-11T00:00:00.000Z",
    }
    const runTrialArgs: V2RunTrialArgs = {
      previewId: previewArtifact.previewId,
      mode: "dry_run",
      confirm: true,
      sampleName: "valid order",
    }
    const compileResult: V2CompilePreviewResult = {
      previewId: previewArtifact.previewId,
      planId: version.planId,
      planVersion: version.planVersion,
      workflowName: workflow.name,
      nodeCount: workflow.nodes.length,
      workflowHash: previewArtifact.workflowHash,
      validationStatus: "passed",
      mcpValidationStatus,
      mappingTrace: [mappingTrace],
      warnings: [],
    }
    const autoPreviewResult: V2AutoPreviewResult = {
      planId: version.planId,
      planVersion: version.planVersion,
      summary: "Created v2 plan for: Receive order payloads and return an acknowledgement.",
      previewId: previewArtifact.previewId,
      workflowName: workflow.name,
      nodeCount: workflow.nodes.length,
      workflowHash: previewArtifact.workflowHash,
      validationStatus: "passed",
      mcpValidationStatus,
      confidence: "high",
      riskLevel: "low",
      review,
      simulation,
      mappingTrace: [mappingTrace],
      warnings: [],
    }
    const trialMode: V2TrialRunMode = "dry_run"
    const trialExecutionMode: V2TrialExecutionMode = "not_triggered"
    const trialArtifact: V2TrialRunArtifact = {
      runId: "123e4567-e89b-12d3-a456-426614174000",
      mode: trialMode,
      previewId: previewArtifact.previewId,
      planId: version.planId,
      planVersion: version.planVersion,
      workflowHash: previewArtifact.workflowHash,
      status: "passed",
      triggered: false,
      executionMode: trialExecutionMode,
      cleanupRequired: false,
      simulation,
      sampleName: "valid order",
      warnings: [],
      provenance: ["Dry-run trial re-ran local simulation."],
      startedAt: "2026-06-11T00:00:00.000Z",
      completedAt: "2026-06-11T00:00:00.000Z",
      summary: "Dry-run trial passed.",
    }
    const runTrialResult: V2RunTrialResult = {
      runId: trialArtifact.runId,
      mode: trialMode,
      previewId: previewArtifact.previewId,
      planId: version.planId,
      planVersion: version.planVersion,
      status: "passed",
      triggered: false,
      executionMode: trialExecutionMode,
      cleanupRequired: false,
      sampleName: "valid order",
      warnings: [],
      summary: trialArtifact.summary,
    }
    const applyResult: V2ApplyResult = {
      workflowId: "wf_1",
      name: "Orders",
      url: "https://demo/workflow/wf_1",
      mode: "create",
      previewId: previewArtifact.previewId,
      planId: version.planId,
      planVersion: version.planVersion,
      nodeCount: workflow.nodes.length,
      workflowHash: "created_workflow_hash",
      validationStatus: "passed",
      warnings: [],
    }
    const updateApplyResult: V2ApplyResult = {
      workflowId: "wf_1",
      name: "Orders",
      url: "https://demo/workflow/wf_1",
      mode: "update",
      previewId: previewArtifact.previewId,
      planId: version.planId,
      planVersion: version.planVersion,
      nodeCount: workflow.nodes.length,
      workflowHash: "updated_workflow_hash",
      validationStatus: "passed",
      warnings: [],
    }
    const claimAction: V2ClaimWorkflowAction = "claim_full"
    const claimRiskCode: V2ClaimWorkflowRiskCode = "V1_OWNERSHIP_RESET"
    const claimRisk: V2ClaimWorkflowRisk = {
      code: claimRiskCode,
      message: "Workflow has a v1 marker.",
    }
    const claimedSummary: V2ClaimedWorkflowSummary = {
      nodeCount: 1,
      connectionCount: 0,
      triggerNodeTypes: ["n8n-nodes-base.webhook"],
      credentialTypes: [],
    }
    const claimResult: V2ClaimWorkflowResult = {
      workflowId: "wf_1",
      name: "Orders",
      url: "https://demo/workflow/wf_1",
      mode: "apply",
      eligible: true,
      action: claimAction,
      claimMode: "full",
      active: false,
      summary: claimedSummary,
      risks: [claimRisk],
      markerWritten: true,
      registryWritten: true,
      workflowHash: "workflow_hash",
    }
    const unmappedNode: V2ReverseUnmappedNode = {
      name: "Community Node",
      type: "n8n-nodes-base.communityNode",
      reason: "unsupported_node_type",
    }
    const reverseResult: V2ReversePlanResult = {
      workflowId: "wf_1",
      name: "Orders",
      url: "https://demo/workflow/wf_1",
      planId: version.planId,
      planVersion: version.planVersion,
      source: "reverse",
      confidence: "low",
      riskLevel: "medium",
      mappedStepCount: 1,
      unmappedNodes: [unmappedNode],
      warnings: [],
      workflowHash: "workflow_hash",
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

    expect({
      warning,
      workflow,
      v2Paths,
      createArgs,
      autoPreviewArgs,
      createResult,
      catalogEntry,
      catalog,
      pattern,
      plan,
      version,
      reviewArgs,
      review,
      patchArgs,
      patchResult,
      validateArgs,
      compileArgs,
      mcpValidationStatus,
      applyArgs,
      updateApplyArgs,
      claimArgs,
      reverseArgs,
      mappingTrace,
      simulation,
      previewArtifact,
      compileResult,
      autoPreviewResult,
      applyResult,
      updateApplyResult,
      runTrialArgs,
      trialMode,
      trialExecutionMode,
      trialArtifact,
      runTrialResult,
      claimAction,
      claimRiskCode,
      claimRisk,
      claimedSummary,
      claimResult,
      unmappedNode,
      reverseResult,
      registry,
    }).toBeDefined()
  })

  it("does not expose v1 tool types from the package barrel", async () => {
    const indexSource = await readFile("src/index.ts", "utf8")

    for (const removedExport of [
      "./tools/build-workflow.js",
      "./tools/update-workflow.js",
      "./tools/claim-workflow.js",
      "./tools/check-workflow-readiness.js",
      "./tools/inspect-workflow.js",
      "./tools/list-managed-workflows.js",
      "./preview-store.js",
      "./registry.js",
      "./workflow-diff.js",
    ]) {
      expect(indexSource).not.toContain(removedExport)
    }
  })
})
