# Pattern Compatibility Matrix

This matrix records the v2.0 pattern-level compatibility claim. v2.0 makes medium-depth claims for seven pattern families; it does not claim exhaustive support for every official or community n8n node configuration.

Medium-depth means the common variants are modeled directly, validation returns actionable issues, and the compiler can emit a reasonable n8n workflow skeleton. Complex variants may be represented with warnings, reduced confidence, inferred response contracts, or explicit follow-up requirements.

| Pattern family | Required variants | Validation focus | Core node combinations | Medium-depth notes |
| --- | --- | --- | --- | --- |
| `trigger` | Webhook, schedule, manual, polling | Input contract exists; trigger mode is explicit; polling describes cadence and duplicate strategy. | Webhook, Schedule Trigger/Cron, Manual Trigger | Polling is modeled as a plan pattern and may compile to schedule plus service read depending on available API details. |
| `transform` | Field mapping, format conversion, filtering, aggregation | Required fields are available; output fields are typed; expressions do not reference missing data. | Set/Edit Fields, Code | Complex aggregation may need Code-node or inferred transform warnings. |
| `branch` | If, switch, multi-condition routing, default branch | Branch conditions reference known fields; non-exhaustive branches include a default; samples cover key outcomes. | IF, Switch | Default branch absence is blocking for branch pattern validation. |
| `loop_batch` | Pagination, batch processing, per-item processing, rate-limit boundaries | Loop termination exists; page or batch size is bounded; error behavior inside loop is explicit. | Split In Batches, schedule/API polling skeletons | Nested loops and unbounded pagination should lower confidence or be split into simpler plans. |
| `error_handling` | Retry, fallback, failure notification, dead-letter or deferred handling | Retry has max attempts; fallback path is explicit; notifications have recipients or destinations. | Retry settings, fallback output, Slack/email/service write nodes | v2.0 models policy and common notification paths; production-grade incident routing remains user-reviewed. |
| `external_call` | HTTP/API call, auth requirement, response parsing, mock or response schema | Request contract is explicit; credential requirement is explicit; response contract exists. | HTTP Request and service nodes | Inferred response contracts reduce confidence and can block apply when credentials are missing. |
| `output` | Respond to Webhook, write to target service, send notification | Output contract matches transformed fields; side effects are explicit; production impact is surfaced in review. | Respond to Webhook, Slack/email/service write nodes | Production-impacting outputs require review and credential readiness before apply. |

## Relationship To Node Tiers

Pattern compatibility is separate from broad node support.

- `tier_1_verified` nodes have committed low-risk scenarios and default tests.
- `tier_2_modeled` nodes can be modeled from known docs but often require credentials or manual setup.
- `tier_3_dynamic` nodes are discovered at runtime through MCP and should reduce confidence until covered by committed scenarios.

## Runtime Baseline

The committed Docker E2E stack uses n8n 2.23.4. The documented MCP environment-managed setup expects n8n 2.20.0 or newer; older n8n builds that expose workflow-builder MCP may require manual MCP setup in the n8n UI.

## Review Expectations

Plan review should explain selected pattern families, assumptions, risks, credential gaps, and simulation coverage. Validation and simulation should make unresolved branches, missing response contracts, missing credentials, unbounded loops, and unsupported node mappings visible before compile or apply.

## Non-Claims

This matrix does not promise full active workflow structural editing, full credential setup automation, OAuth consent automation, every community node, or a complete execution simulator.
