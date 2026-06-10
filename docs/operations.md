# Operations Guide

本文档描述每个公开 OpenCode 工具的参数、行为、写操作和安全限制。

## `n8n_build_workflow`

用途：根据自然语言创建新的 inactive n8n workflow 草稿。

参数：

- `prompt`：必填，自然语言需求。
- `name`：可选，覆盖 workflow 名称。

行为：读取 MCP SDK 指南和节点文档，调用 OpenCode planner 生成 workflow draft，编译成 n8n workflow JSON，校验托管 marker、结构和 secret，解析 credential action，运行 MCP validation，然后通过 n8n API 创建 inactive workflow 并写入本地 registry。

写操作：创建 n8n workflow，写 `.opencode/n8n-workflows.json`。

## `n8n_update_workflow`

用途：对托管 inactive workflow 执行两阶段更新或 rollback。

参数：

- `workflowId`：必填。
- `mode`：`preview`、`apply`、`rollback-preview`、`rollback-apply`。
- `prompt`：`preview` 必填。
- `previewId`：`apply` 和 rollback 模式必填。

行为：`preview` 只生成 proposed workflow、credential action 和结构化 diff，不写 n8n。`apply` 要求 preview 未过期、proposed hash 未被篡改、当前 workflow hash 仍匹配 preview base hash。rollback 要求当前 workflow 仍匹配已应用的 proposed hash。

安全限制：`n8n_update_workflow` 仍是 inactive-only，不能结构性修改 active workflow。

## `n8n_claim_workflow`

用途：显式接管已有 inactive workflow。

参数：

- `workflowId`：必填。
- `mode`：`preview` 或 `apply`。
- `confirm`：`apply` 必须为 `true`。

行为：`preview` 只读并返回 eligibility。`apply` 会重新读取 workflow、重新校验，然后写入 `opencode-n8n-builder` marker/tag 和本地 registry。active workflow、其他 owner、疑似明文 secret、registry base URL mismatch 都会被阻断。

## `n8n_check_workflow_readiness`

用途：检查托管 workflow 的生产就绪状态，并在显式确认后 activation/deactivation。

参数：

- `workflowId`：必填。
- `mode`：`preview`、`activate` 或 `deactivate`。
- `confirm`：`activate` 和 `deactivate` 必须为 `true`。
- `allowWarnings`：`activate` 存在 warning 时必须显式为 `true`。

行为：readiness preview 检查托管 marker、本地 registry ownership、结构校验、secret、节点兼容性、webhook/schedule activation 影响、MCP validation 状态和最近 executions。execution API 不可用时返回 `diagnostics.supported: false`。activation 阻断 hard failure，warning 需要用户显式放行。

写操作：`preview` 不写；`activate` 和 `deactivate` 调用 n8n public API 并刷新 registry。

## `n8n_inspect_workflow`

用途：查看托管 inactive workflow 的摘要，包括节点、连接、credential type 和校验问题。

参数：

- `workflowId`：必填。

安全限制：workflow 必须带托管 marker，必须在本地 registry 中，registry base URL 必须匹配当前配置，且 workflow 必须 inactive。

## `n8n_list_managed_workflows`

用途：列出当前 OpenCode workspace 本地 registry 中记录的托管 workflow。

参数：无。

行为：只读取 `.opencode/n8n-workflows.json`，不需要 n8n API key 或 MCP URL。适合首次 smoke test 和排查 registry 状态。
