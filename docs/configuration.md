# 配置指南

本插件同时使用 n8n public REST API 和 n8n MCP。REST API 负责 workflow、credential、activation 和 execution diagnostics；MCP 负责动态读取节点文档、SDK 指南和 workflow validation。

## 环境变量

- `N8N_BASE_URL`：n8n REST API base URL，例如 `https://your-instance.app.n8n.cloud/api/v1` 或 `http://127.0.0.1:5678/api/v1`。
- `N8N_API_KEY`：n8n public API key。readiness diagnostics 需要 execution read/list scope；activation/deactivation 需要 workflow activate/deactivate scope。
- `N8N_MCP_URL`：n8n MCP endpoint。build 和 update preview 需要它。
- `N8N_MCP_TOKEN`：可选。如果 MCP endpoint 要求 Bearer token，配置这个值。

API-only 工具包括 `n8n_claim_workflow`、`n8n_check_workflow_readiness`、`n8n_inspect_workflow` 和 update apply/rollback apply。build 和 update preview 还需要 MCP，因为它们要检索节点文档和运行 MCP validation。

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
