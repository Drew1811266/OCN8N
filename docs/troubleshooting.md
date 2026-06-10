# Troubleshooting

本页列出常见错误、含义和处理方式。错误详情会尽量 redaction，不应包含 secret value。

## `CONFIG_MISSING`

缺少必需配置。build 和 update preview 需要 `N8N_BASE_URL`、`N8N_API_KEY` 和 `N8N_MCP_URL`。API-only 工具需要 `N8N_BASE_URL` 和 `N8N_API_KEY`。`n8n_list_managed_workflows` 不需要连接配置。

处理：检查环境变量或 OpenCode config，确认 base URL 以 `/api/v1` 结尾。

## `CONFIG_INVALID`

OpenCode config 中的字段类型不对，例如 `n8n.baseUrl` 不是字符串，或 `n8n.credentialEnv` 不是对象。

处理：对照 `docs/configuration.md` 和 `examples/` 中的 JSON 格式。

## `N8N_API_ERROR`

n8n public API 返回非 2xx。常见原因包括 API key 不正确、base URL 错误、workflow ID 不存在、API key scope 不足，或 activation/deactivation endpoint 对当前实例不可用。

处理：先用 `n8n_inspect_workflow` 或 readiness preview 验证读取权限。execution diagnostics 需要 execution read/list scope；activation/deactivation 需要 workflow activate/deactivate scope。

## `N8N_API_PARSE_ERROR`

n8n API 返回结构不符合插件预期。可能是 n8n 版本差异、反向代理返回 HTML、或 endpoint 返回错误格式。

处理：确认请求打到 `/api/v1`，并记录 n8n 版本。不要把完整响应中的 secret 贴到 issue 中。

## `N8N_MCP_TOOL_ERROR`

MCP JSON-RPC 调用失败，通常是 MCP URL、Bearer token、工具名、权限或 n8n MCP 配置问题。

处理：确认 `N8N_MCP_URL` 指向 MCP HTTP endpoint；如果需要 auth，设置 `N8N_MCP_TOKEN` 或 `n8n.mcpToken`。

## `MCP_WORKFLOW_VALIDATION_FAILED`

MCP `validate_workflow` 认为生成的 workflow code 不合法。

处理：把 tool result 中的 validation error 交给 OpenCode 继续迭代，优先修正 node type、typeVersion、parameters 和 connections。

## `WORKFLOW_UPDATE_BLOCKED`

update/rollback 被安全边界阻断。常见原因：workflow active、缺托管 marker、registry 缺记录、registry base URL mismatch、疑似明文 secret、或 preview stale。

处理：不要绕过 preview/apply。先 inspect workflow，必要时对 inactive workflow 使用 `n8n_claim_workflow` 修复 registry。

## `WORKFLOW_READINESS_BLOCKED`

readiness 发现 workflow 不是当前 workspace 管理的托管 workflow，或 registry ownership 不匹配。

处理：确认 workflow 是由插件创建或通过 claim 接管；确认当前 `N8N_BASE_URL` 和 registry 记录一致。

## Docker

运行 `npm run test:e2e` 时，如果看到 `spawn docker ENOENT`，表示 Docker CLI 不在 PATH。安装并启动 Docker Desktop 后重试。默认 `npm run test` 不需要 Docker。

## credentials

如果工具返回 `set_missing_env`，设置对应环境变量后重试。如果返回 `configure_mapping`，在 OpenCode config 增加 `n8n.credentialEnv`。如果返回 `complete_oauth_in_n8n`，到 n8n UI 完成 OAuth consent，再运行 readiness preview。
