# v2 Compile MCP Validation

**Goal:** When MCP is configured, v2 compile preview and auto preview must validate the compiled workflow through the existing n8n MCP workflow validator before saving a preview artifact.

## Scope

- Keep local v2 tools usable without n8n API or MCP configuration.
- Add optional local MCP config support for `mcpUrl` and `mcpToken`.
- Reuse `validateWorkflowWithMcp`; do not introduce a parallel validation protocol.
- Return an explicit compile result status for MCP validation.
- Block preview creation on MCP validation failure.
- Document the public contract and release gate expectation.

## TDD Checklist

- [x] Add compile preview tests for `not_configured`, `passed`, `warning`, and failure-blocking MCP validation.
- [x] Add auto preview coverage that propagates MCP validation result.
- [x] Add config tests for optional local MCP URL/token loading and malformed token rejection when MCP is used locally.
- [x] Add plugin wiring test proving configured MCP calls `validate_workflow` during local v2 compile.
- [x] Update public contract/docs tests for MCP validation after compile.
- [x] Implement compile, config, and plugin wiring.
- [x] Run targeted tests red, then green.
- [x] Run full verification before merge.
