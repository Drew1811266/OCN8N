# Compatibility

This document records v1 compatibility expectations. It does not claim exhaustive proof for every possible n8n node configuration.

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

## Node Compatibility Tiers

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
