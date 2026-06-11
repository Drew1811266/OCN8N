export type V2Confidence = "high" | "medium" | "low"
export type V2RiskLevel = "low" | "medium" | "high"

export type V2PatternFamily =
  | "trigger"
  | "transform"
  | "branch"
  | "loop_batch"
  | "error_handling"
  | "external_call"
  | "output"

export type V2Warning = {
  code: string
  message: string
  stepId?: string
  patternId?: string
}

export type V2PlanIntent = {
  goal: string
  scope: string[]
  nonGoals: string[]
}

export type V2PlanInput = {
  id: string
  mode: "webhook" | "schedule" | "manual" | "polling"
  schema: Record<string, string>
  samples: Array<Record<string, unknown>>
}

export type V2PlanEntity = {
  name: string
  fields: Record<string, string>
}

export type V2PlanStep = {
  id: string
  name: string
  summary: string
  patternIds: string[]
  inputRefs: string[]
  outputRefs: string[]
}

export type V2PlanPattern = {
  id: string
  family: V2PatternFamily
  variant: string
  summary: string
  confidence: V2Confidence
  riskLevel: V2RiskLevel
  warnings: V2Warning[]
}

export type V2PlanBranch = {
  id: string
  sourceStepId: string
  condition: string
  targetStepId: string
  isDefault?: boolean
}

export type V2PlanLoop = {
  id: string
  sourceStepId: string
  mode: "pagination" | "batch" | "per_item"
  maxIterations: number
  termination: string
}

export type V2ExternalCall = {
  id: string
  stepId: string
  service: string
  operation: string
  credentialRequirementId?: string
  requestContract: Record<string, string>
  responseContract?: Record<string, string>
  responseContractSource: "user" | "docs" | "inferred" | "missing"
}

export type V2ErrorPolicy = {
  strategy: "fail_fast" | "retry_then_fail" | "fallback" | "dead_letter"
  maxAttempts?: number
  notifications: string[]
}

export type V2PlanOutput = {
  id: string
  mode: "respond_to_webhook" | "write_service" | "send_notification"
  contract: Record<string, string>
}

export type V2TestExample = {
  name: string
  input: Record<string, unknown>
  expectedOutput: Record<string, unknown>
}

export type V2TestContract = {
  examples: V2TestExample[]
  edgeCases: V2TestExample[]
}

export type V2CredentialRequirement = {
  id: string
  service: string
  credentialType: string
  authMode: "api_key" | "header_auth" | "basic" | "manual" | "oauth2"
  status: "available" | "missing_env" | "manual_setup" | "oauth_handoff" | "unknown"
  affectedStepIds: string[]
  blocksApply: boolean
}

export type V2Plan = {
  intent: V2PlanIntent
  inputs: V2PlanInput[]
  entities: V2PlanEntity[]
  steps: V2PlanStep[]
  patterns: V2PlanPattern[]
  branches: V2PlanBranch[]
  loops: V2PlanLoop[]
  externalCalls: V2ExternalCall[]
  errorPolicy: V2ErrorPolicy
  outputs: V2PlanOutput[]
  testContract: V2TestContract
  credentialRequirements: V2CredentialRequirement[]
  confidence: V2Confidence
  riskLevel: V2RiskLevel
  warnings: V2Warning[]
  trace: string[]
}

export type V2PlanVersionSource = "create" | "patch" | "reverse"

export type V2PlanVersion = {
  planId: string
  planVersion: number
  plan: V2Plan
  createdAt: string
  source: V2PlanVersionSource
  summary: string
  contentHash: string
  parentPlanVersion?: number
}

export type V2PlanReview = {
  planId: string
  planVersion: number
  summary: string
  patternReviews: Array<{
    patternId: string
    family: V2PatternFamily
    decision: string
    confidence: V2Confidence
    riskLevel: V2RiskLevel
  }>
  assumptions: string[]
  risks: string[]
  openQuestions: string[]
  simulationCoverage: string[]
  confidence: V2Confidence
  riskLevel: V2RiskLevel
}

export type V2ValidationIssue = {
  code: string
  message: string
  severity: "error" | "warning"
  stepId?: string
  patternId?: string
}

export type V2SimulationResult = {
  planId: string
  planVersion: number
  status: "passed" | "failed" | "warning"
  checkedAt: string
  issues: V2ValidationIssue[]
  sampleResults: Array<{
    name: string
    status: "passed" | "failed"
    path: string[]
  }>
  fieldTraces: Array<{
    field: string
    source: string
    target: string
  }>
}

export type V2RegistryRecord = {
  workflowId: string
  name: string
  url: string
  baseUrl: string
  claimMode: "full" | "read_only"
  activeAtClaim: boolean
  managedBy: "opencode-n8n-builder-v2"
  managedByVersion: string
  latestPlanId?: string
  latestPlanVersion?: number
  latestWorkflowHash?: string
  latestPreviewId?: string
  lastValidationStatus?: "passed" | "failed" | "warning"
  lastUpdatedAt: string
}
