# opencode-n8n-builder v2 Complex Planning Design

Date: 2026-06-11

## Goal

`opencode-n8n-builder` v2.0 upgrades the plugin from a safe managed workflow builder into a complex workflow planning framework.

The main goal is not a larger node list. The main goal is to make complex automation requests understandable, reviewable, verifiable, simulatable, and iteratively editable before they become n8n workflow JSON.

v2.0 should support a pattern-first generation model:

1. Interpret user intent into a business workflow plan.
2. Explain the plan and its risks.
3. Validate the plan structure.
4. Simulate control flow and field flow with examples.
5. Compile the plan into an n8n workflow preview.
6. Apply only after explicit user confirmation.

## Product Positioning

v1 is a safe workflow draft and managed inactive workflow lifecycle tool. v2 is a complex planning system for real automation design.

v2 focuses on:

- Complex workflow planning.
- Pattern-level reliability.
- Plan version history.
- Plan explain/review as a first-class workflow.
- Structural validation and sample simulation.
- Mixed compilation from business plan to n8n node graph.
- Reverse planning from existing workflows.

v2 does not focus on:

- Exhaustive support for every community node.
- Full active workflow production editing.
- Fully automated OAuth consent.
- Visual canvas diff as a core requirement.
- Full credential wizard flows.
- Silent migration from v1 artifacts.

## Breaking Reset

v2.0 is a breaking major version.

The v1 public tools are removed and replaced by a v2 tool contract. v2 does not automatically read or migrate v1 registry or preview artifacts.

Implications:

- v1 `.opencode/n8n-workflows.json` is not a v2 registry.
- v1 update preview files are not reused.
- v1-managed workflows are treated as external workflows by v2.
- Users must use v2 claim/import to bring old workflows into v2.
- Documentation must clearly call out the breaking reset and upgrade cost.

This is intentional. The v2 plan, simulation, preview, and registry model is different enough that silent migration would create ambiguous safety semantics.

## Active Workflow Policy

v2 remains conservative about active workflows.

- Inactive workflow claim: full claim is allowed.
- Active workflow claim: read-only claim is allowed.
- Active workflow read-only claim supports inspect, reverse planning, explain, risk review, and simulation.
- Active workflow structural apply is not part of v2.0.

Future production-operator versions may design controlled active workflow editing, but v2.0 does not include it as a product promise.

## User Experience Tracks

v2 uses a dual-track experience.

### Convenience Track

`n8n_v2_auto_preview` provides a one-step user path:

1. Generate a business workflow plan.
2. Review/explain it internally.
3. Validate and simulate it.
4. Compile it into a workflow preview.
5. Stop before writing to n8n.

The convenience track returns a workflow preview and supporting review data. It does not create or update n8n workflows.

### Advanced Track

Advanced users can run each stage explicitly:

1. Create plan.
2. Review plan.
3. Patch plan.
4. Validate and simulate.
5. Compile preview.
6. Apply.
7. Claim/import workflows.

This track is required for complex iteration, debugging, and auditability.

## v2 Public Tools

The initial v2 tool contract should include these tools.

### `n8n_v2_auto_preview`

Creates a workflow preview from a natural-language request without writing to n8n.

Responsibilities:

- Create a plan.
- Review and explain the plan.
- Validate and simulate the plan.
- Compile the plan to n8n workflow preview.
- Return confidence, risk, warnings, mapping trace, and preview metadata.

### `n8n_v2_create_plan`

Creates a business workflow plan from natural language or from supplied context.

Returns:

- `planId`
- `planVersion`
- recognized patterns
- required credentials
- test contract summary
- plan-level confidence and risk
- warnings and open questions

### `n8n_v2_review_plan`

Explains a plan as a first-class tool.

It should explain:

- Why each pattern was selected.
- Which requirements were mapped to which steps.
- Which fields and entities are expected.
- Which external calls need schemas or credentials.
- Which branches, loops, and error paths exist.
- Which paths are covered by samples.
- Which assumptions reduce confidence.

### `n8n_v2_patch_plan`

Creates a new plan version from a patch.

Supported patch styles:

- Natural-language patch, such as "add a fallback Slack notification when the HTTP call fails".
- Structured JSON patch for advanced users.

Every patch produces a new `planVersion` and must trigger revalidation before compile/apply.

### `n8n_v2_validate_simulate`

Runs structural validation and control-flow plus field-flow simulation for a specific plan version.

Input sources:

- User-provided examples.
- Planner-generated boundary examples.
- Optional execution-history sampling from claimed workflows.

Execution-history sampling is opt-in, must minimize data read, and must redact sensitive values.

### `n8n_v2_compile_preview`

Compiles a validated plan version into an n8n workflow preview.

Returns:

- compiled workflow JSON preview
- mapping trace
- diff when updating a claimed inactive workflow
- node compatibility warnings
- credential readiness summary
- MCP validation result
- preview ID and version references

### `n8n_v2_apply`

Writes a compiled preview to n8n.

Allowed writes:

- Create a new inactive workflow.
- Update a v2-claimed inactive workflow.

Requirements:

- Explicit apply call.
- Existing validated plan version.
- Existing compiled preview version.
- Current workflow hash must match the preview base hash for updates.
- Credential readiness must be checked again before write.

### `n8n_v2_claim_workflow`

Claims or imports an existing n8n workflow into v2.

Modes:

- Inactive full claim.
- Active read-only claim.

Responsibilities:

- Check ownership markers.
- Check active/inactive policy.
- Check plaintext secret risks.
- Create a v2 registry record.
- Run reverse planning where requested.
- Record unmapped nodes or uncertain semantics.

## Optional Follow-On Tools

These tools are useful but can be implemented after the initial v2 core if needed.

- `n8n_v2_export_plan`
- `n8n_v2_import_plan`
- `n8n_v2_run_trial`
- `n8n_v2_list_artifacts`

`n8n_v2_run_trial` should still be part of the v2 target capability, but it can be built after the core plan, validate, simulate, compile, apply loop is stable.

## Plan Model

v2 plan is a business workflow plan, not an n8n node graph.

The plan model should include:

- `intent`: user goal, scope, and non-goals.
- `inputs`: trigger types, input schema, sample inputs.
- `entities`: named business objects and field definitions.
- `steps`: business steps, each referencing one or more patterns.
- `patterns`: instances of the seven supported pattern families.
- `branches`: condition paths, default paths, and unresolved paths.
- `loops`: pagination, batch, item iteration, and rate-limit boundaries.
- `externalCalls`: service calls, auth needs, request contract, and response contract.
- `errorPolicy`: retry, fallback, failure notification, and dead-letter behavior.
- `outputs`: response, write, notification, or final side effect contracts.
- `testContract`: examples, expected outputs, edge cases, and mock responses.
- `credentialRequirements`: plan-aware credential needs and setup gaps.
- `confidence`: plan-level and pattern-level scoring.
- `warnings`: ambiguity, dynamic nodes, unverified mappings, and credential gaps.
- `trace`: concise prompt-to-plan decision summary.

The plan should not persist complete prompt history by default.

## Seven Required Pattern Families

v2.0 must cover all seven basic pattern families at medium depth.

Medium depth means common variants are supported directly. Complex or risky variants may be represented with warnings, reduced confidence, or downgrade suggestions.

### Trigger Pattern

Required variants:

- Webhook
- Schedule
- Manual
- Polling

Validation focus:

- Input contract exists.
- Trigger mode is explicit.
- Polling has cadence and duplicate strategy.

### Transform Pattern

Required variants:

- Field mapping
- Format conversion
- Filtering
- Aggregation

Validation focus:

- Required fields are available.
- Output fields are typed.
- Transform expressions do not reference missing data.

### Branch Pattern

Required variants:

- If
- Switch
- Multi-condition routing
- Default branch

Validation focus:

- Every branch condition references known fields.
- Default branch exists for non-exhaustive conditions.
- Samples cover key branch outcomes.

### Loop/Batch Pattern

Required variants:

- Pagination
- Batch processing
- Per-item processing
- Rate limit boundaries

Validation focus:

- Loop termination condition exists.
- Page or batch size is bounded.
- Error behavior inside loop is explicit.
- Simulation can reason about expected iteration counts.

### Error Handling Pattern

Required variants:

- Retry
- Fallback
- Failure notification
- Dead-letter or deferred handling

Validation focus:

- Retry has max attempts.
- Fallback path is explicit.
- Failure notification has recipient or destination.
- Error paths do not silently drop data.

### External Call Pattern

Required variants:

- HTTP/API call
- Auth requirement
- Response parsing
- Mock or response schema

Validation focus:

- Request contract is explicit.
- Credential requirement is explicit.
- Response contract exists.
- Inferred response contracts reduce confidence.

### Output Pattern

Required variants:

- Respond to Webhook
- Write to target service
- Send notification

Validation focus:

- Output contract matches transformed fields.
- Side effects are explicit.
- Production-impacting outputs are surfaced in review.

## Confidence And Risk

v2 uses lightweight scoring.

Scope:

- Plan-level confidence and risk.
- Pattern-level confidence and risk.
- Node-level warnings only when relevant.

Suggested confidence values:

- `high`: verified pattern combination, supported nodes, sufficient samples, simulation passed.
- `medium`: structure is valid, simulation passed, but uses inferred schemas, dynamic nodes, or incomplete samples.
- `low`: ambiguous requirements, unverified pattern combination, missing response contracts, missing credentials, or simulation gaps.

Scores must be explained with reasons. They must not be opaque numbers.

## Validation

Validation is required before compile and apply.

Validation checks:

- Plan schema completeness.
- Pattern schema completeness.
- Pattern composition rules.
- Field closure from inputs to outputs.
- Branch default path.
- Loop termination and bounds.
- External call response contract.
- Credential requirement classification.
- Secret persistence safety.
- Compatibility tier and dynamic node warnings.
- Mapping trace completeness after compile.
- n8n local workflow validation after compile.
- MCP validation after compile when MCP is configured.

Validation should return actionable issues with stable error codes.

## Simulation

v2.0 must support control-flow and field-flow simulation.

Simulation should validate:

- Sample input path selection.
- Branch outcomes.
- Loop and batch boundaries.
- Transform field availability and type compatibility.
- Output contract satisfaction.
- Error path reachability or explicit fallback.

Simulation does not execute real external APIs. External calls use response contracts and mocks.

Simulation input sources:

- User-provided samples.
- Planner-generated edge samples.
- Optional execution-history samples.

Execution-history samples:

- Are opt-in.
- Require API scope awareness.
- Must be redacted.
- Must be tied to a claimed workflow.
- Must not be stored as raw execution history unless the user explicitly exports a debug bundle.

## External Call Response Contracts

External Call Pattern uses a combined approach.

Priority:

1. User-provided response schema or mock.
2. API documentation or user description if available.
3. Planner-inferred response contract.

Inferred contracts must reduce confidence and appear in plan review.

Real external API calls are only allowed in opt-in trial runs against test inputs or test environments.

## Compiler

v2 compiler uses a mixed strategy.

Responsibilities:

- Pattern library creates the stable workflow skeleton.
- LLM assists with complex parameter mapping, expressions, and field transforms.
- MCP node documentation constrains node type, version, and parameter shape.
- Compatibility catalog informs supported node and pattern combinations.
- Compiler emits mapping trace.

Mapping trace should link:

- business intent
- plan step
- pattern instance
- n8n node
- node parameters
- expressions
- source fields
- output fields

Compiled previews must pass validation before apply.

Compiler failure should return fixable diagnostics, such as missing response schema, unsupported nested loop shape, unknown credential type, or unmapped expression.

## Reverse Planning

v2 supports reverse planning from existing n8n workflows.

Inactive workflow:

- Can be fully claimed.
- Can be reverse planned.
- Can be patched, simulated, compiled, previewed, and applied.

Active workflow:

- Can be read-only claimed.
- Can be reverse planned.
- Can be reviewed, simulated, and used for proposed redesigns.
- Cannot be structurally applied by v2.0.

Reverse planning output:

- `planId`
- `planVersion`
- `confidence`
- mapped steps
- `unmappedSteps`
- warnings for unsupported nodes, opaque expressions, missing credential semantics, or unclear business intent.

Reverse planning does not need to be lossless. It must be honest about uncertainty.

## Credential Model

v2 credentials are plan-aware.

The plan should identify:

- service or node family
- credential type
- auth mode
- setup status
- affected plan steps
- whether simulation can proceed with mocks
- whether apply is blocked

Supported auth modes:

- API key
- Header auth
- Basic auth
- Manual setup
- OAuth handoff

v2 does not implement a full credential wizard. OAuth remains a guided handoff to n8n UI.

No secret values should be stored in plan, simulation, preview, registry, logs, or normal tool output.

## Trial Runs

Opt-in trial runs are a v2 target capability.

Required:

- Temporary trial run for newly generated inactive workflows.
- Trial run for a copy of a claimed inactive workflow.

Experimental:

- Shadow trial run for active workflow redesigns by copying to a temporary workflow or isolated test environment.

Rules:

- Must be explicit opt-in.
- Must use test input or redacted sampled input.
- Must avoid production side effects by default.
- Must support cleanup of temporary workflows.
- Must attach results to plan or preview version.
- Must update confidence only with clear provenance.

## Artifact Storage

v2 default storage path is `.opencode/n8n-v2/`.

Suggested layout:

```text
.opencode/n8n-v2/
  plans/
  simulations/
  previews/
  registry/
  claims/
  runs/
  exports/
```

Artifact rules:

- Every plan has `planId` and `planVersion`.
- Every patch creates a new plan version.
- Validation, simulation, compile, preview, and apply reference exact versions.
- Artifacts are redacted before persistence.
- Full conversation history is not persisted by default.
- Storage should be implemented behind an adapter interface to allow future shared storage or database backends.

## v2 Registry

The v2 registry is separate from v1.

It should record:

- workflow ID
- n8n base URL
- claim mode: full or read-only
- active state at claim time
- manager marker version
- latest plan ID and version
- latest workflow hash
- latest preview ID
- last readiness or validation status
- timestamps

v2 should not silently trust v1 markers as v2 ownership.

## Compatibility Model

v2 keeps dynamic official node support but shifts claims from node coverage to pattern coverage.

Rules:

- Official nodes can be attempted through MCP dynamic discovery.
- Seven pattern families have validated core node combinations.
- Dynamic nodes reduce confidence unless covered by committed scenarios.
- Community nodes are not a v2.0 requirement.
- Docs must describe verified pattern and node combinations, not broad marketing claims.

## Release Gate

v2.0 is complete only when the technical implementation passes release gates.

Required release artifacts:

- v2 public contract docs.
- v1 to v2 breaking migration guide.
- v2 artifact and registry docs.
- Pattern compatibility matrix.
- Security review update.
- Operations guide update.
- README update.

Required verification:

- Typecheck.
- Unit tests.
- Build.
- Package boundary check.
- `git diff --check`.
- CI for default verification.
- Opt-in Docker E2E for at least one complex plan, preview, apply, and trial run path when Docker and API key are available.

Required test coverage:

- Plan schema.
- Seven pattern schemas.
- Pattern composition validation.
- Control-flow simulation.
- Field-flow simulation.
- External call response contracts.
- Credential model.
- Compiler mapping trace.
- Reverse planning.
- v2 artifact storage.
- v2 registry.
- Apply safety.
- Redaction.

## Security Requirements

v2 must preserve and extend v1 safety commitments.

Required:

- No plaintext secret persistence.
- No silent n8n writes.
- No active workflow structural apply.
- No apply without validated preview version.
- No update apply without current workflow hash check.
- No execution-history sampling without opt-in.
- No trial run without opt-in.
- Redacted errors and artifacts.
- Clear risk reporting for production side effects.

## Acceptance Criteria

v2.0 is accepted when:

- v1 public tools have been replaced by v2 tools.
- v2 artifact storage is isolated under `.opencode/n8n-v2/`.
- Users can create, review, patch, validate, simulate, compile, and apply a complex workflow through the advanced track.
- Users can run `n8n_v2_auto_preview` and receive a workflow preview without n8n writes.
- All seven pattern families are supported at medium depth.
- Plan review explains pattern choices, assumptions, risks, credential gaps, and simulation coverage.
- Simulation validates control flow and field flow for examples.
- Compiler emits mapping trace.
- Inactive workflows can be fully claimed and reverse planned.
- Active workflows can be read-only claimed and reverse planned.
- v1 artifacts are not treated as v2 ownership.
- Release docs clearly describe the breaking reset.
- Default verification passes.
- Security review has no known critical blocker.

## Deferred Beyond v2.0

The following are intentionally outside v2.0:

- Full active workflow structural editing.
- Full credential setup wizard.
- Automatic OAuth consent.
- Exhaustive community node support.
- Full n8n node execution simulator.
- Visual workflow canvas diff.
- Team shared artifact backend.
- Fully automated production deployment governance.
