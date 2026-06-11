# Compatibility

This document records v2.0 compatibility expectations. It does not claim exhaustive proof for every possible n8n node configuration.

## Runtime

- Node.js: `>=20`, as declared in `package.json`.
- OpenCode packages: the project depends on current `@opencode-ai/plugin` and `@opencode-ai/sdk` package versions declared in `package.json`.
- Module format: ESM package with `./dist/index.js` and `./dist/index.d.ts` as the public entrypoint.

## n8n

- The committed Docker E2E stack uses `n8n 2.23.4`.
- The Docker runner documents env-managed MCP settings for `n8n 2.20.0` or newer.
- Older n8n versions that support workflow-builder MCP may require enabling MCP access in the n8n UI instead of relying on environment-managed settings.
- The plugin uses n8n public REST API for workflow persistence, credential lookup/create where configured, activation/deactivation, and execution diagnostics.
- The plugin uses n8n MCP for SDK guidance, node documentation, suggested nodes, and workflow validation.

## v2 Pattern Compatibility

v2.0 describes support primarily by pattern family rather than broad node coverage. The seven supported v2 pattern families are:

| Pattern family | Medium-depth v2 behavior | Core node combinations |
| --- | --- | --- |
| `trigger` | Manual, webhook, schedule, and polling-style entry modeling. | Manual Trigger, Webhook, Schedule Trigger/Cron |
| `transform` | Field mapping and deterministic transformation steps. | Set/Edit Fields, Code |
| `branch` | IF/Switch style control flow with explicit default branch validation. | IF, Switch |
| `loop_batch` | Bounded batch/per-item flow with maximum iteration validation. | Split In Batches |
| `error_handling` | Retry/fail-fast/fallback/dead-letter policy modeling. | Retry policy plus notification/output fallback |
| `external_call` | HTTP/service calls with response contracts and credential requirements. | HTTP Request and service nodes |
| `output` | Webhook response, service write, or notification output contracts. | Respond to Webhook, Slack/email/service write nodes |

Reverse planning maps known n8n node families into these patterns and reports unmapped community or unsupported nodes as uncertainty rather than pretending complete coverage.

## Legacy Node Compatibility Tiers

- `tier_1_verified`: committed low-risk scenarios and default tests cover the node family. Examples include Manual Trigger, Webhook, Schedule Trigger, Set/Edit Fields, IF, Switch, Merge, HTTP Request, and Respond to Webhook.
- `tier_2_modeled`: known nodes that can be generated from MCP docs but often involve credentials or service-specific setup. Examples include Slack, Gmail, Google Sheets, and Code.
- `tier_3_dynamic`: nodes discovered through MCP at runtime without committed scenario coverage. Tool results return `NODE_COMPATIBILITY_DYNAMIC` warning.

## Credentials

- API key and manual credentials can be guided through `n8n.credentialEnv`.
- Environment-created credentials are optional and explicit.
- OAuth is a guided handoff: the plugin returns `complete_oauth_in_n8n` and expects the user to finish browser consent in n8n UI.
- The plugin does not automate OAuth browser consent.

## Non-goals

- No exhaustive proof for every official node and parameter combination.
- No automatic third-party service E2E for OAuth-heavy services.
- No active workflow structural editing through `n8n_update_workflow`.
- No npm publish or release tag without owner approval.
