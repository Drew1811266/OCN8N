# v2 Complex Path E2E

**Goal:** Keep opt-in Docker E2E aligned with the v2 default plugin surface and cover one complex v2 plan, preview, apply, and dry-run trial path.

## Scope

- Update plugin smoke E2E from v1 default tools to v2 default tools.
- Exercise `n8n_v2_auto_preview`, `n8n_v2_run_trial`, and `n8n_v2_apply`.
- Use a complex but credential-free v2 prompt so apply can create an inactive n8n workflow.
- Track created workflow IDs for cleanup through existing E2E helpers.
- Keep default unit tests Docker-free.

## TDD Checklist

- [x] Update E2E plugin smoke to assert the v2 default tool surface.
- [x] Cover complex v2 auto preview, dry-run trial, inactive apply, and cleanup tracking.
- [x] Update docs/release notes for opt-in v2 E2E coverage.
- [x] Run default verification locally.
- [x] Document Docker/API-key E2E status.

## E2E Run Status

Default verification passed locally. The real Docker E2E path was not executed in this stage because no `N8N_E2E_API_KEY` or related E2E environment variables were present in the shell. The opt-in coverage is implemented in `tests/e2e/plugin-smoke.e2e.test.ts` and runs via `N8N_E2E_API_KEY=<key> npm run test:e2e`.
