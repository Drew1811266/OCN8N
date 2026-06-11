# v2 Public Contract Reset Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the default package and plugin public surface from the v1 workflow tools to the v2 pattern-first tool contract.

**Architecture:** Keep v1 implementation modules in the repository for legacy/internal test coverage, but remove v1 tool registration from the default OpenCode plugin entrypoint and remove v1 tool types from the public package barrel. Update package metadata and release-facing docs so v2.0 is clearly a breaking reset with isolated `.opencode/n8n-v2/` artifacts and explicit v2 claim/import for old workflows.

**Tech Stack:** TypeScript, Vitest, tsup, OpenCode plugin API, existing v2 tool modules, existing docs/package release tests.

---

## Scope Check

This plan implements only the v2 public contract reset foundation. It does not delete v1 implementation modules, migrate v1 artifacts, publish to npm, create a Git tag, implement opt-in trial runs, or remove the existing direct v1 unit tests.

## File Structure

- Modify `src/plugin.ts`: remove default registration of v1 public tools and set default plugin version to `2.0.0`.
- Modify `src/index.ts`: remove v1 tool type exports from the package barrel while keeping common workflow/error types and v2 types.
- Modify `package.json` and `package-lock.json`: set package version and description to v2.0.
- Modify `tests/plugin.test.ts`: assert default plugin exposes v2-only tools and still supports v2 local/API flows.
- Modify `tests/public-contract.test.ts`: assert package public type contract is v2-only.
- Modify `tests/package-metadata.test.ts`: assert 2.0 package metadata.
- Modify `tests/docs-release.test.ts`: assert README, CHANGELOG, operations, public contract, compatibility, and security docs describe the v2 reset and v2 tools.
- Modify `README.md`, `CHANGELOG.md`, `docs/public-contract.md`, `docs/operations.md`, `docs/compatibility.md`, `docs/security-review.md`, and `docs/release-checklist.md`: document the v2 public surface and breaking reset.

## Task 1: Reset Code Public Surface

**Files:**
- Modify: `src/plugin.ts`
- Modify: `src/index.ts`
- Test: `tests/plugin.test.ts`
- Test: `tests/public-contract.test.ts`

- [ ] **Step 1: Write failing plugin and public-contract tests**

Create tests requiring:

- default `createN8nBuilderPlugin()` logs version `2.0.0`;
- plugin tool keys are exactly `n8n_v2_auto_preview`, `n8n_v2_create_plan`, `n8n_v2_review_plan`, `n8n_v2_patch_plan`, `n8n_v2_validate_simulate`, `n8n_v2_compile_preview`, `n8n_v2_apply`, `n8n_v2_claim_workflow`, and `n8n_v2_reverse_plan`;
- v1 tool keys are absent from the plugin surface;
- v2 local plan/review/patch/validate/compile flow still works without n8n API or MCP;
- v2 apply, claim, and reverse plan still work through API config without MCP;
- public package type imports compile for v2 args/results/artifacts and no longer import v1 tool args/results.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/plugin.test.ts tests/public-contract.test.ts
```

Expected: FAIL because `src/plugin.ts` still registers v1 tools, defaults to `1.0.0`, and `src/index.ts` still exports v1 tool types.

- [ ] **Step 3: Implement plugin and barrel reset**

In `src/plugin.ts`:

- remove imports used only by v1 tool registration;
- keep `localDeps()` and `apiDeps()`;
- remove `fullDeps()` and v1 tool registration;
- set default version to `2.0.0`;
- keep the v2 tool order stable.

In `src/index.ts`:

- remove public exports for v1 tool args/results and v1 artifact types;
- keep `N8nBuilderPlugin`, `createN8nBuilderPlugin`, `N8nBuilderError`, common config/workflow/warning types, and v2 type exports.

- [ ] **Step 4: Verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/plugin.test.ts tests/public-contract.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/plugin.ts src/index.ts tests/plugin.test.ts tests/public-contract.test.ts docs/superpowers/plans/2026-06-11-v2-public-contract-reset-foundation.md
git commit -m "feat: switch plugin public surface to v2"
```

## Task 2: Reset Package Metadata And Release Docs

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/public-contract.md`
- Modify: `docs/operations.md`
- Modify: `docs/compatibility.md`
- Modify: `docs/security-review.md`
- Modify: `docs/release-checklist.md`
- Test: `tests/package-metadata.test.ts`
- Test: `tests/docs-release.test.ts`

- [ ] **Step 1: Write failing metadata and docs tests**

Create tests requiring:

- package and lockfile versions are `2.0.0`;
- README says current version is `2.0.0`;
- CHANGELOG has a `## 2.0.0` section;
- docs mention `Breaking Reset`, `.opencode/n8n-v2/`, and `opencode-n8n-builder-v2`;
- operations docs document every default v2 tool and do not present v1 tools as the public surface;
- public contract docs list v2 result types and v2 artifact paths;
- compatibility docs describe the seven v2 pattern families;
- security review documents no silent n8n writes, no active structural apply, no v1 artifact migration, and no execution-history/trial-run behavior without opt-in.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/package-metadata.test.ts tests/docs-release.test.ts
```

Expected: FAIL because metadata and docs still describe v1.0.

- [ ] **Step 3: Update metadata and docs**

Update metadata:

- `package.json` version `2.0.0`;
- `package-lock.json` root version fields `2.0.0`;
- package description describes v2 pattern-first planning, simulation, preview, and safe apply.

Update docs:

- README current version/status to v2.0;
- add CHANGELOG `2.0.0` section;
- rewrite public contract around v2 tools;
- rewrite operations public tool list around v2 tools;
- add pattern compatibility matrix references for the seven v2 pattern families;
- update security review and release checklist with v2 reset evidence.

- [ ] **Step 4: Verify pass**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run tests/package-metadata.test.ts tests/docs-release.test.ts tests/plugin.test.ts tests/public-contract.test.ts
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json README.md CHANGELOG.md docs/public-contract.md docs/operations.md docs/compatibility.md docs/security-review.md docs/release-checklist.md tests/package-metadata.test.ts tests/docs-release.test.ts
git commit -m "docs: document v2 public contract reset"
```

## Task 3: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run full verification**

Run:

```bash
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsc --noEmit
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/vitest run
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" ../../node_modules/.bin/tsup
PATH="/Users/patpat/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH" node scripts/check-package-files.mjs
git diff --check
```

Expected: all pass.

- [ ] **Step 2: Scope review**

Confirm this stage switched the public package/plugin surface to v2 only and did not delete v1 implementation modules, migrate artifacts, publish, tag, or implement opt-in trial runs.

- [ ] **Step 3: Commit final fixes if needed**

Only commit if verification or scope review required changes.
