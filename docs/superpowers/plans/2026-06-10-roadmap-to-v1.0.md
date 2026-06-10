# Roadmap To v1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each version plan task-by-task. Steps use checkbox (`- [ ]`) syntax for version tracking. Do not implement the next version until the current version has passed the review gate in this document.

**Goal:** Bring `opencode-n8n-builder` from v0.3.0 to a v1.0.0 release that is installable, documented, safe, and practically usable for creating, iterating, validating, and operating n8n workflows from OpenCode.

**Architecture:** Keep the current managed-workflow safety model as the default: generated workflows are tracked in the local registry, update flows use preview/apply, and production-impacting actions require explicit confirmation. Expand capability in controlled layers: broader node compatibility, stronger credentials, workflow onboarding, better update previews, test/activation workflows, packaging, and final release hardening.

**Tech Stack:** TypeScript, Vitest, tsup, zod, OpenCode plugin API, n8n REST API, n8n MCP workflow-builder JSON-RPC, Docker-based opt-in n8n E2E tests.

---

## Current Baseline

Current release: `v0.3.0`.

Already implemented:

- OpenCode plugin registration and four tools:
  - `n8n_build_workflow`
  - `n8n_update_workflow`
  - `n8n_inspect_workflow`
  - `n8n_list_managed_workflows`
- Managed workflow registry in `.opencode/n8n-workflows.json`.
- Inactive-only managed workflow update and inspect policy.
- Preview/apply update flow with stale-preview protection.
- Credential mapping from environment variables.
- Secret redaction and plaintext secret checks.
- n8n MCP usage for SDK reference, node search, node type lookup, suggested nodes, and workflow validation.
- Opt-in Docker n8n E2E harness.
- Chinese README aligned with v0.3 behavior.

Known gaps:

- Docker E2E has not been run successfully on the current machine because Docker CLI is unavailable.
- Node compatibility is still based on limited scenarios, not a broad compatibility matrix.
- Credential UX is functional but too low-level for ordinary users.
- Existing workflow onboarding is not supported.
- Update previews do not provide a rich diff.
- Activation, production readiness checks, rollback guidance, and release packaging are not complete.
- There is no published v1-level installation, troubleshooting, and operations guide.

## v1.0 Product Definition

`v1.0.0` means the plugin is fully usable for a serious early adopter, not that it can perfectly automate every possible n8n workflow.

The v1.0 default product should support:

1. Install the plugin from documented package/source instructions.
2. Connect to a self-hosted or cloud n8n instance with API and MCP configuration.
3. Create inactive managed workflow drafts from natural language.
4. Iterate on managed workflows through multi-turn preview/apply updates.
5. Inspect managed workflows and surface actionable validation issues.
6. Onboard an existing inactive workflow through an explicit claim/import flow.
7. Resolve common credential cases with clear setup guidance and no secret leakage.
8. Validate generated workflows through local checks, MCP validation, and opt-in real n8n E2E coverage.
9. Show meaningful diffs before update apply.
10. Provide a production-readiness checklist and explicit activation path.
11. Ship with documentation, examples, troubleshooting, release notes, and compatibility expectations.

The v1.0 product should not promise:

- Perfect support for every community node.
- Fully automated OAuth consent flows.
- Silent modification of active production workflows.
- Guaranteed first-pass correctness for every official node and every parameter combination.
- Running user workflows automatically without explicit user intent.

## Product Decisions To Confirm

Unless changed by the project owner, use these defaults:

- **Recommended default:** v1.0 supports all n8n official nodes through dynamic MCP discovery, but the tested compatibility claim is tiered by scenarios and node families. The docs must not claim exhaustive proof for every official node.
- **Recommended default:** Active workflow modification is allowed only through an explicit production mode with preview, diff, validation, and user confirmation. The safe default remains inactive workflow editing.
- **Recommended default:** OAuth is handled by a guided handoff to n8n UI. The plugin can detect missing OAuth credentials and return setup instructions, but it does not automate consent screens.
- **Recommended default:** Existing workflow onboarding supports inactive workflows first. Active workflow claiming can be added only if it does not update or deactivate the workflow implicitly.
- **Recommended default:** Persistence remains through n8n REST API until MCP create/update offers equivalent ownership, preview, and stale-change controls.

## Version Gate Rules

Every version from v0.4 to v1.0 must follow this sequence:

1. Create or update a version-specific implementation plan under `docs/superpowers/plans/`.
2. Implement only the scope listed for that version.
3. Run the required verification commands.
4. Run a review against the version acceptance checklist.
5. Fix all blocking findings.
6. Update README and any user-facing docs for the new behavior.
7. Bump package version and default plugin version.
8. Merge to `main`, push, and tag only after explicit user approval.
9. Do not start the next version until the previous version is reviewed as accepted.

Blocking review finding definition:

- Any regression in v0.3 managed workflow safety.
- Any path that can leak plaintext secrets to workflow JSON, registry, preview files, logs, or ordinary tool output.
- Any create/update path that bypasses local validation and MCP validation when MCP is configured.
- Any active workflow write without explicit user confirmation.
- Any undocumented user-facing behavior change.
- Any failing default test, typecheck, or build.

Required verification for each version:

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
./node_modules/.bin/tsup
git diff --check
```

Required opt-in E2E verification when Docker is available:

```bash
N8N_E2E_API_KEY=<test-api-key> npm run test:e2e
```

If Docker is unavailable, the release notes must explicitly say Docker E2E was not run in the current environment and include the exact diagnostic.

## Version Roadmap

### v0.4.0: Node Compatibility Matrix And Scenario Harness

**Goal:** Move from limited node examples to a structured compatibility matrix that can guide planner behavior, tests, and documentation.

**User value:** Users get more reliable workflow drafts across common official n8n node families, and maintainers get a repeatable way to measure support.

**Primary outcomes:**

- Add a compatibility catalog for official node families used by the plugin.
- Add deterministic workflow scenarios for common automation patterns.
- Extend E2E fixtures to cover more real n8n nodes without requiring sensitive credentials.
- Make planner prompts and validation warnings reference compatibility tiers.
- Document which node families are verified, partially verified, or dynamically supported but not yet scenario-tested.

**In scope:**

- Compatibility tiers:
  - `tier_1_verified`: covered by unit tests and Docker E2E scenario.
  - `tier_2_modeled`: schema/docs parsed and covered by unit tests, but no real credential E2E.
  - `tier_3_dynamic`: discovered through MCP at runtime with no committed scenario.
- Scenario catalog for low-risk nodes:
  - Manual Trigger
  - Webhook
  - Schedule Trigger
  - Edit Fields or Set
  - IF
  - Switch
  - Merge
  - HTTP Request
  - Respond to Webhook
  - Code node in restricted, documented scenarios only
- New test fixtures for representative workflow shapes:
  - trigger -> transform -> response
  - schedule -> HTTP request -> filter -> transform
  - webhook -> branch -> merge
  - API polling -> error notification placeholder
- README compatibility table.

**Out of scope:**

- Credential-heavy E2E with real Slack, Gmail, Google Sheets, Notion, or OAuth.
- Claiming existing workflows.
- Active workflow updates.

**Likely files:**

- Create: `src/node-compatibility.ts`
- Create: `tests/node-compatibility.test.ts`
- Modify: `src/opencode-planner.ts`
- Modify: `src/tools/build-workflow.ts`
- Modify: `tests/e2e/helpers/test-workflows.ts`
- Modify: `tests/e2e/workflow-lifecycle.e2e.test.ts`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Acceptance checklist:**

- [ ] Compatibility catalog exists and is covered by unit tests.
- [ ] Planner receives compatibility context without hardcoding every node parameter.
- [ ] At least four deterministic multi-node scenarios are covered by tests.
- [ ] Docker E2E can exercise the low-risk scenario set when Docker and API key are available.
- [ ] Tool results can warn when a workflow uses dynamic but unverified node families.
- [ ] README clearly distinguishes verified coverage from dynamic support.
- [ ] v0.3 create/update safety rules remain unchanged.

**Review gate:** v0.4 is accepted only when compatibility claims are precise and test-backed. Marketing-style claims such as "supports all nodes" are not acceptable unless the wording explains dynamic support and tested coverage separately.

### v0.5.0: Credential Setup And Secret-Safe User Experience

**Goal:** Make credential requirements understandable and actionable without storing or exposing secrets.

**User value:** Users can create workflows involving credentialed services and know exactly what to configure in n8n or environment variables.

**Primary outcomes:**

- Add a credential capability model.
- Return structured credential setup instructions.
- Add credential health checks.
- Improve missing credential messages and README examples.
- Preserve strict no-secret persistence.

**In scope:**

- Credential metadata model:
  - credential type
  - display name
  - required fields
  - source: existing n8n credential, environment-created credential, manual n8n setup required
  - OAuth handoff flag
- New or expanded tool output:
  - `missingCredentials`
  - `credentialActions`
  - `manualSetupUrl` where derivable from n8n base URL
- Configuration validation for `n8n.credentialEnv`.
- More complete redaction tests for nested errors and validation details.
- Documentation for Slack, HTTP Header Auth, generic API key, SMTP, and OAuth handoff patterns.

**Out of scope:**

- Automating OAuth browser consent.
- Storing credential secrets in local config.
- Rotating credentials.

**Likely files:**

- Modify: `src/credential-resolver.ts`
- Modify: `src/types.ts`
- Modify: `src/tools/build-workflow.ts`
- Modify: `src/tools/update-workflow.ts`
- Modify: `src/security.ts`
- Modify: `tests/credential-resolver.test.ts`
- Modify: `tests/hash-security-validator.test.ts`
- Modify: `tests/build-workflow.test.ts`
- Modify: `tests/update-workflow.test.ts`
- Modify: `README.md`

**Acceptance checklist:**

- [ ] Missing credential output is structured enough for OpenCode to explain next steps.
- [ ] OAuth credentials produce manual handoff guidance instead of fake automation.
- [ ] Existing credential reuse and environment-created credentials are both tested.
- [ ] Redaction covers nested objects, arrays, thrown errors, and MCP/API failure details.
- [ ] No test fixture introduces real secrets.
- [ ] README includes practical credential setup examples.

**Review gate:** v0.5 is accepted only if a user can understand credential setup without reading source code, and no secret leakage paths are introduced.

### v0.6.0: Existing Workflow Claim And Import

**Goal:** Let users explicitly bring existing inactive n8n workflows under plugin management.

**User value:** Users are not forced to recreate workflows from scratch before using OpenCode-assisted iteration.

**Primary outcomes:**

- Add an explicit claim/import flow for inactive workflows.
- Generate a local registry entry only after validation and user intent.
- Reconstruct a planner-readable summary from existing workflow JSON.
- Prevent accidental takeover of unrelated or active production workflows.

**In scope:**

- New tool:
  - `n8n_claim_workflow`
- Claim modes:
  - `preview`: inspect workflow and return claim eligibility, risks, and summary.
  - `apply`: write marker and registry entry only when eligibility checks pass.
- Eligibility checks:
  - workflow exists on current base URL
  - workflow is inactive
  - workflow is not already managed by another incompatible marker
  - workflow contains no obvious plaintext secret values
  - node and connection structure passes validator
- Registry migration support for claimed workflows.
- README section for onboarding existing workflows.

**Out of scope:**

- Active workflow claim with write operations.
- Importing workflow history.
- Automatically fixing unsupported nodes during claim.

**Likely files:**

- Create: `src/tools/claim-workflow.ts`
- Modify: `src/plugin.ts`
- Modify: `src/registry.ts`
- Modify: `src/validator.ts`
- Modify: `src/types.ts`
- Create: `tests/claim-workflow.test.ts`
- Modify: `tests/plugin.test.ts`
- Modify: `tests/e2e/workflow-lifecycle.e2e.test.ts`
- Modify: `README.md`

**Acceptance checklist:**

- [ ] Claim preview never modifies n8n.
- [ ] Claim apply writes registry and management marker only for eligible inactive workflows.
- [ ] Active workflows are rejected with a clear reason.
- [ ] Base URL mismatch and existing incompatible ownership are rejected.
- [ ] Claimed workflows can subsequently use inspect and update preview/apply.
- [ ] E2E covers create external inactive workflow -> claim -> update preview -> apply.

**Review gate:** v0.6 is accepted only if existing workflow onboarding is explicit, reversible by user action, and cannot silently take over active workflows.

### v0.7.0: Rich Update Diff, Safer Patch Planning, And Rollback Data

**Goal:** Make multi-turn workflow updates understandable before apply and safer after apply.

**User value:** Users can see what OpenCode intends to change, apply updates with confidence, and recover if a change is wrong.

**Primary outcomes:**

- Add a structured workflow diff model.
- Improve update preview output beyond a plain change summary.
- Store rollback metadata for managed workflows.
- Bias planner toward minimal changes instead of full replacement when possible.

**In scope:**

- Workflow diff categories:
  - added nodes
  - removed nodes
  - changed node parameters
  - changed credentials references
  - changed connections
  - changed settings
- Preview result includes `diff`.
- Preview store includes enough previous workflow data to support rollback preview.
- New tool or update mode:
  - `n8n_update_workflow` mode `rollback-preview`
  - `n8n_update_workflow` mode `rollback-apply`
- Planner prompt changes to preserve unchanged nodes and names unless requested.
- Tests for stale rollback prevention.

**Out of scope:**

- Visual canvas rendering.
- Arbitrary history browser.
- Rollback for workflows not managed or claimed by the plugin.

**Likely files:**

- Create: `src/workflow-diff.ts`
- Create: `tests/workflow-diff.test.ts`
- Modify: `src/preview-store.ts`
- Modify: `src/tools/update-workflow.ts`
- Modify: `src/opencode-planner.ts`
- Modify: `tests/update-workflow.test.ts`
- Modify: `tests/registry-preview-store.test.ts`
- Modify: `README.md`

**Acceptance checklist:**

- [ ] Update preview returns structured diff with stable ordering.
- [ ] Diff does not expose secret values.
- [ ] Apply still checks stale base hash.
- [ ] Rollback preview explains exactly what would be restored.
- [ ] Rollback apply is blocked if current workflow no longer matches rollback base.
- [ ] Tests cover node, connection, parameter, credential reference, and settings diffs.

**Review gate:** v0.7 is accepted only if update intent is inspectable before apply and rollback data cannot overwrite unrelated user changes.

### v0.8.0: Production Readiness, Activation Flow, And Runtime Diagnostics

**Goal:** Add the operational layer needed before a generated workflow can be safely activated.

**User value:** Users can move from draft creation to production use through explicit checks instead of guessing in n8n UI.

**Primary outcomes:**

- Add production readiness checks.
- Add explicit activation/deactivation flow where n8n API support is available.
- Add runtime diagnostics for recent execution status where n8n API support is available.
- Provide manual fallback instructions when an API capability is unavailable.

**In scope:**

- New readiness model:
  - active status
  - missing credentials
  - MCP validation result
  - unsupported or dynamic-only nodes
  - webhook URL readiness
  - schedule trigger readiness
  - manual OAuth handoff requirements
  - known warnings
- New tool:
  - `n8n_check_workflow_readiness`
- Activation modes:
  - `preview`: returns readiness report and activation risks.
  - `apply`: activates only when checks pass or when user explicitly allows documented warnings.
- Deactivation mode for managed workflows.
- Runtime diagnostics:
  - fetch recent execution summaries if supported by configured n8n API.
  - return a clear unsupported message if unavailable.
- README production checklist.

**Out of scope:**

- Automatically fixing production incidents.
- Triggering arbitrary workflow executions without user intent.
- Modifying active workflows without a preview/apply gate.

**Likely files:**

- Create: `src/tools/check-workflow-readiness.ts`
- Modify: `src/n8n-api-client.ts`
- Modify: `src/plugin.ts`
- Modify: `src/types.ts`
- Modify: `src/validator.ts`
- Create: `tests/check-workflow-readiness.test.ts`
- Modify: `tests/n8n-api-client.test.ts`
- Modify: `tests/e2e/workflow-lifecycle.e2e.test.ts`
- Modify: `README.md`

**Acceptance checklist:**

- [ ] Readiness report is available for managed and claimed workflows.
- [ ] Activation apply requires explicit user intent and rejects missing required credentials.
- [ ] Deactivation works for managed workflows and records registry state.
- [ ] Active workflow update remains guarded by explicit production mode.
- [ ] Runtime diagnostics handle supported and unsupported API cases clearly.
- [ ] README explains when to use n8n UI manually.

**Review gate:** v0.8 is accepted only if the plugin can guide production activation without weakening inactive-by-default safety.

### v0.9.0: Packaging, Installation, Documentation, And CI Release Readiness

**Goal:** Make the project installable and maintainable outside the original development workspace.

**User value:** A new user can install, configure, test, and troubleshoot the plugin from documentation alone.

**Primary outcomes:**

- Polish npm package metadata and exported types.
- Add installation and quickstart documentation.
- Add example OpenCode configs.
- Add CI workflow for typecheck, tests, build, and optional E2E instructions.
- Add release checklist and changelog.

**In scope:**

- Docs:
  - installation
  - configuration
  - first workflow
  - credential setup
  - claim existing workflow
  - update preview/apply
  - readiness/activation
  - troubleshooting
- Examples:
  - local n8n
  - n8n Cloud
  - MCP token
  - credential env mapping
- Package checks:
  - `npm pack --dry-run`
  - verify `files` includes required docs and dist files
  - verify exported entrypoint
- CI:
  - typecheck
  - unit tests
  - build
  - diff/check formatting command where applicable
- Changelog from v0.1.0 to v0.9.0.

**Out of scope:**

- Publishing to npm without explicit owner approval.
- Hosted documentation site.

**Likely files:**

- Create: `docs/installation.md`
- Create: `docs/configuration.md`
- Create: `docs/credential-setup.md`
- Create: `docs/operations.md`
- Create: `docs/troubleshooting.md`
- Create: `docs/release-checklist.md`
- Create: `CHANGELOG.md`
- Create: `.github/workflows/check.yml`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Acceptance checklist:**

- [ ] A new user can follow docs to configure local n8n or n8n Cloud.
- [ ] All plugin tools are documented with arguments, behavior, and safety limits.
- [ ] Troubleshooting includes config, API auth, MCP auth, Docker E2E, credentials, and validation errors.
- [ ] CI passes on default checks.
- [ ] `npm pack --dry-run` output is reviewed and contains expected files only.
- [ ] Release checklist exists and matches the actual project process.

**Review gate:** v0.9 is accepted only if the project can be handed to a new technical user without relying on private conversation history.

### v1.0.0: Release Candidate Hardening And Stable Contract

**Goal:** Freeze the public behavior for a stable v1.0.0 release.

**User value:** Users get a stable plugin with documented guarantees, clear limitations, and no known critical safety gaps.

**Primary outcomes:**

- Stabilize tool contracts and result schemas.
- Run full review of safety, docs, tests, packaging, and release process.
- Remove stale roadmap claims from README.
- Publish final v1.0 release notes.
- Tag `v1.0.0` only after owner approval.

**In scope:**

- Public contract review:
  - tool names
  - input schemas
  - result schemas
  - error codes
  - warning codes
  - registry format
  - preview format
- Compatibility review:
  - supported n8n versions
  - supported OpenCode plugin version
  - MCP capability expectations
  - known unsupported nodes or credential flows
- Security review:
  - secret handling
  - registry and preview contents
  - active workflow writes
  - error redaction
  - stale preview and rollback checks
- Test review:
  - unit coverage for every tool
  - E2E coverage for core lifecycle
  - Docker E2E executed in an environment with Docker
  - documented exception if a third-party service scenario cannot run automatically
- Release review:
  - package version `1.0.0`
  - README says current version `1.0.0`
  - changelog includes v1.0.0
  - release checklist completed

**Out of scope:**

- Large new features.
- Breaking API changes after release candidate without resetting the RC review.
- Claims of exhaustive support for every possible n8n node configuration.

**Likely files:**

- Modify: `src/types.ts`
- Modify: `src/errors.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/release-checklist.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: tests as needed for contract freeze

**Acceptance checklist:**

- [ ] All v0.4-v0.9 acceptance criteria remain true.
- [ ] Public schemas are documented and covered by tests.
- [ ] README and docs describe actual behavior, not future goals.
- [ ] Full default verification passes.
- [ ] Docker E2E passes in a Docker-capable environment.
- [ ] Security review has no blocking finding.
- [ ] `npm pack --dry-run` has been reviewed.
- [ ] Project owner approves `v1.0.0` tag and optional npm publish.

**Review gate:** v1.0 is accepted only when there are no known critical safety, install, or core workflow lifecycle blockers.

## Cross-Version Workstreams

These workstreams span multiple releases, but each version must still ship a coherent user-visible increment.

### Safety

- No silent active workflow writes.
- No plaintext secrets in persisted artifacts.
- No update apply without stale-change checks.
- No claim/import without explicit user intent.
- Clear error codes and redacted details.

### Node Quality

- Continue using n8n MCP as the source of current node documentation.
- Avoid hardcoding full node schemas in the plugin.
- Maintain a compatibility matrix that distinguishes verified coverage from dynamic discovery.
- Prefer scenario tests over broad but shallow snapshots.

### Credentials

- Treat OAuth as a guided handoff unless a future version deliberately scopes OAuth automation.
- Keep environment-created credentials optional and explicit.
- Return actionable credential setup instructions in tool results.

### Testing

- Default tests must stay Docker-free.
- Docker E2E remains opt-in.
- Version releases must document whether Docker E2E actually ran.
- Add regression tests for every blocker found in review.

### Documentation

- README should be accurate for the current release.
- Detailed docs can live under `docs/`.
- Release notes should avoid claiming future roadmap items as shipped.

## Execution Protocol

For each version:

1. Create branch `codex/vX.Y-<short-scope>`.
2. Write version-specific implementation plan from this roadmap.
3. Implement with TDD where practical.
4. Use subagent-driven development for independent tasks when available.
5. Run spec compliance review.
6. Run code quality review.
7. Run verification commands.
8. Ask the project owner whether to merge, push, and tag.
9. After release, update this roadmap if the actual result changes future scope.

Version branches should not combine multiple roadmap versions unless the project owner explicitly approves it.

## Open Questions For Project Owner

Recommended answers are included so execution can proceed if the owner agrees.

1. **Should v1.0 claim support for every official n8n node?**  
   Recommended answer: claim dynamic support for official nodes through MCP, but only claim verified support for nodes and scenarios in the compatibility matrix.

2. **Should v1.0 allow active workflow modification?**  
   Recommended answer: yes, but only behind explicit production mode, readiness checks, structured diff, validation, and user confirmation.

3. **Should v1.0 include OAuth automation?**  
   Recommended answer: no. Provide guided setup and clear missing credential actions; leave browser consent to n8n UI.

4. **Should publishing to npm be part of v1.0?**  
   Recommended answer: prepare the package and docs by v0.9, publish only after explicit owner approval during v1.0.

5. **Should MCP persistence replace REST API persistence by v1.0?**  
   Recommended answer: no, unless MCP create/update can preserve the same ownership, preview, stale-change, and registry guarantees.

## Immediate Next Step

After this roadmap is approved, start v0.4.0 by creating a version-specific implementation plan for:

```text
v0.4.0: Node Compatibility Matrix And Scenario Harness
```

Do not implement v0.4 code until that v0.4 implementation plan has been written and reviewed.
