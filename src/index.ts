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

export type {
  CredentialActionStatus,
  CredentialActionType,
  CredentialAuthMode,
  CredentialEnvMapping,
  CredentialGap,
  CredentialSetupAction,
  ManagedMarker,
  PluginConfig,
  Warning,
} from "./types.js"
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
