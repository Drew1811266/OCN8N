# 配置指南

v2 默认工具分为 local-only、API write 和可选 MCP validation 三类。plan、review、patch、validate/simulate、compile preview、auto preview 和 dry-run trial 可以在没有 n8n API key 的本地 workspace 中运行。`apply`、`claim_workflow` 和 `reverse_plan` 需要 n8n public REST API。compile preview 和 auto preview 可以额外使用 n8n MCP 进行保存前 workflow validation。

## 环境变量

- `N8N_BASE_URL`：n8n REST API base URL，例如 `https://your-instance.app.n8n.cloud/api/v1` 或 `http://127.0.0.1:5678/api/v1`。`n8n_v2_apply`、`n8n_v2_claim_workflow` 和 `n8n_v2_reverse_plan` 需要它。
- `N8N_API_KEY`：n8n public API key。`apply` 需要 workflow create/update scope；`claim_workflow` 和 `reverse_plan` 需要 workflow read scope。
- `N8N_MCP_URL`：可选 n8n MCP endpoint。配置后，`n8n_v2_compile_preview` 和 `n8n_v2_auto_preview` 会在保存 preview 前调用 MCP `validate_workflow`。
- `N8N_MCP_TOKEN`：可选。如果 MCP endpoint 要求 Bearer token，配置这个值。

未配置 MCP 时，compile preview 的 `mcpValidationStatus` 为 `not_configured`；配置 MCP 且 validation 通过时为 `passed`；MCP 只返回 warning 时为 `warning`，warning 会并入工具结果和 preview artifact。MCP validation failure 会返回 typed error 并阻止保存 preview。

## OpenCode Config

可以在 OpenCode config 中写：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-n8n-builder"],
  "n8n": {
    "baseUrl": "https://your-instance.app.n8n.cloud/api/v1",
    "apiKey": "${N8N_API_KEY}",
    "mcpUrl": "https://your-instance.app.n8n.cloud/mcp-server/http",
    "mcpToken": "${N8N_MCP_TOKEN}"
  }
}
```

更推荐把真实 key 放在环境变量中。示例文件里使用 `${N8N_API_KEY}` 这样的占位符，只表达配置位置，不是插件内部的模板展开语法。

## 本地 Registry

插件会在当前 workspace 写入 `.opencode/n8n-workflows.json`，记录 workflow ID、名称、n8n base URL、托管版本和 hash。这个 registry 是安全边界的一部分：同一个 workflow ID 如果属于不同 `N8N_BASE_URL`，插件会拒绝 inspect、update、readiness activation 等写操作。

## Credential Mapping

`n8n.credentialEnv` 用于声明如何从环境变量创建或复用 n8n credential。key 要匹配 workflow node 使用的 credential type，例如 `slackApi`、`httpHeaderAuth`、`smtp` 或 `gmailOAuth2`。OAuth credential 推荐设置 `authMode: "oauth2"`，插件会返回手动去 n8n UI 完成授权的 action。

## 示例

- `examples/opencode.local-n8n.json`：本地 n8n。
- `examples/opencode.n8n-cloud.json`：n8n Cloud。
- `examples/opencode.mcp-token.json`：带 MCP Bearer token。
- `examples/opencode.credentials.json`：credential env mapping。
