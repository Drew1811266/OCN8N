export { N8nBuilderPlugin, createN8nBuilderPlugin } from "./plugin.js"
export { N8nBuilderPlugin as default } from "./plugin.js"
export { N8nBuilderError } from "./errors.js"
export type { N8nBuilderPluginOptions } from "./plugin.js"

export type { BuildWorkflowArgs, BuildWorkflowResult } from "./tools/build-workflow.js"
export type { UpdateWorkflowArgs, UpdateWorkflowResult } from "./tools/update-workflow.js"
export type {
  ClaimWorkflowArgs,
  ClaimWorkflowResult,
  ClaimWorkflowRisk,
  ClaimWorkflowRiskCode,
} from "./tools/claim-workflow.js"
export type {
  CheckWorkflowReadinessArgs,
  CheckWorkflowReadinessResult,
  ReadinessCheck,
  ReadinessCheckStatus,
  RuntimeDiagnostics,
} from "./tools/check-workflow-readiness.js"
export type {
  InspectWorkflowArgs,
  InspectWorkflowResult,
  WorkflowConnectionSummary,
  WorkflowNodeSummary,
} from "./tools/inspect-workflow.js"
export type { ListManagedWorkflowsResult } from "./tools/list-managed-workflows.js"
export type { V2AutoPreviewArgs, V2AutoPreviewResult } from "./tools/v2-auto-preview.js"
export type { V2CompilePreviewArgs, V2CompilePreviewResult } from "./tools/v2-compile-preview.js"
export type { V2CreatePlanArgs, V2CreatePlanResult } from "./tools/v2-create-plan.js"
export type { V2PatchPlanArgs, V2PatchPlanResult } from "./tools/v2-patch-plan.js"
export type { V2ReviewPlanArgs } from "./tools/v2-review-plan.js"
export type { V2ValidateSimulateArgs } from "./tools/v2-validate-simulate.js"
export { V2_PATTERN_CATALOG, getV2PatternFamily, listV2PatternFamilies } from "./v2/pattern-catalog.js"
export type {
  V2PatternCatalog,
  V2PatternCatalogEntry,
  V2PatternVariantCatalogEntry,
} from "./v2/pattern-catalog.js"
export type { V2CompiledPreview, V2PreviewMappingTrace } from "./v2/preview-store.js"

export type {
  CredentialActionStatus,
  CredentialActionType,
  CredentialAuthMode,
  CredentialEnvMapping,
  CredentialGap,
  CredentialSetupAction,
  ManagedMarker,
  PluginConfig,
  V2ArtifactPaths,
  Warning,
} from "./types.js"
export type {
  V2Confidence,
  V2CredentialRequirement,
  V2ExternalCall,
  V2PatternFamily,
  V2Plan,
  V2PlanBranch,
  V2PlanEntity,
  V2PlanInput,
  V2PlanLoop,
  V2PlanOutput,
  V2PlanPattern,
  V2PlanReview,
  V2PlanStep,
  V2PlanVersion,
  V2RegistryRecord,
  V2RiskLevel,
  V2SimulationResult,
  V2TestContract,
  V2ValidationIssue,
  V2Warning,
} from "./v2/types.js"
export type { WorkflowRegistryRecord } from "./registry.js"
export type { UpdatePreview } from "./preview-store.js"
export type {
  N8nWorkflow,
  N8nWorkflowConnection,
  N8nWorkflowNode,
  ValidationResult,
  WorkflowIssue,
  WorkflowIssueCode,
  WorkflowOwnershipState,
} from "./validator.js"
export type {
  ConnectionDiff,
  NodeCredentialDiff,
  NodeParameterDiff,
  SettingDiff,
  WorkflowDiff,
  WorkflowNodeDiff,
} from "./workflow-diff.js"
export type { N8nExecutionSummary } from "./n8n-api-client.js"
