# Changelog

All notable changes for `opencode-n8n-builder` are documented here.

## 1.0.0

- Exported public TypeScript contract types from the package entrypoint.
- Documented stable tool, result, registry, preview, warning, and error contracts.
- Added compatibility documentation for n8n, OpenCode, MCP, node tiers, and credential flows.
- Added v1.0 security review record and residual risk documentation.
- Updated release metadata and docs for the stable release candidate.

## 0.9.0

- Added release-readiness package metadata: repository, bugs, homepage, Node engine, expanded package files, and `package:check`.
- Added installation, configuration, credential setup, operations, troubleshooting, and release checklist docs.
- Added parseable OpenCode config examples for local n8n, n8n Cloud, MCP token, and credential env mapping.
- Added release documentation tests that verify public tool docs, examples, changelog coverage, and CI shape.
- Prepared the package for handoff to users outside the original development thread.

## 0.8.0

- Added `n8n_check_workflow_readiness` for managed workflow readiness preview.
- Added explicit activation and deactivation modes requiring `confirm: true`.
- Added warning policy via `allowWarnings` for activation.
- Added runtime diagnostics using n8n execution listing when available, with structured unsupported fallback.
- Kept `n8n_update_workflow` inactive-only for structural edits.

## 0.7.0

- Added structured workflow diff output for update preview/apply.
- Persisted preview `baseWorkflow`, `proposedWorkflow`, and redacted diff.
- Added rollback preview and rollback apply modes guarded by preview hashes.
- Strengthened patch planning toward minimal full-replacement workflow changes.

## 0.6.0

- Added `n8n_claim_workflow` for explicitly onboarding existing inactive workflows.
- Added claim preview, confirm-gated claim apply, registry repair, and ownership blocking.
- Preserved inactive-only update and inspect safety boundaries after claim.

## 0.5.0

- Added `credentialActions` for credential setup UX.
- Added API-key, manual, and OAuth handoff modes for credential env mappings.
- Added recursive redaction for n8n API and MCP error details.
- Prevented secret values from appearing in ordinary tool output.

## 0.4.0

- Added node compatibility tiers and guidance for planner prompts.
- Added warnings for dynamically discovered node types without committed scenario coverage.
- Expanded low-risk workflow scenarios for compatibility testing.

## 0.3.0

- Added MCP `get_suggested_nodes` guidance.
- Added workflow-to-SDK validation code generation.
- Added MCP `validate_workflow` checks before build and update preview persistence.
- Returned MCP warnings in tool results and blocked MCP validation errors.

## 0.2.0

- Added opt-in Docker n8n E2E infrastructure.
- Added E2E helpers for local n8n readiness, API key bootstrap, environment mapping, and cleanup.
- Added MCP Bearer token support for test and plugin paths.

## 0.1.0

- Added initial OpenCode plugin entrypoint.
- Added managed inactive workflow creation from natural language.
- Added local registry, workflow validation, inspect, list, and two-phase update preview/apply.
- Added credential resolver basics and secret-safety validation.
