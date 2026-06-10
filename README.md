# opencode-n8n-builder

`opencode-n8n-builder` 是一个用于连接 OpenCode 和 n8n 的插件。它允许用户用自然语言描述自动化需求，由 OpenCode 结合 n8n 官方 MCP 节点文档生成、检查并安全更新 n8n workflow 草稿。

当前版本：`0.7.0`

当前状态：`v0.7` 版本。核心的“托管 workflow”生命周期保持 v0.1-v0.6 的保守安全边界，并新增结构化 update diff、preview base/proposed workflow 持久化和 rollback preview/apply 流程。用户可以在多轮修改后看到更明确的差异摘要，并在已应用 preview 后通过受 hash 保护的 rollback 恢复到 preview 前状态。

## 项目目标

这个项目的目标是让用户可以在 OpenCode 中用自然语言描述自动化流程，例如：

- “当收到 webhook 后，把订单信息整理后发送到 Slack。”
- “每天早上拉取某个接口的数据，过滤异常记录，然后发邮件提醒。”
- “给已有的托管 workflow 增加一个错误通知步骤。”

插件会负责：

1. 读取 n8n 官方 MCP 提供的 SDK 指南和节点文档。
2. 让 OpenCode 生成结构化 workflow 计划。
3. 将计划编译成 n8n workflow JSON。
4. 校验 workflow 的安全性和结构合法性。
5. 通过 n8n REST API 创建或更新 workflow。
6. 在本地 registry 中记录哪些 workflow 是由本插件托管的。

第一版重点不是“接管所有 n8n workflow”，而是建立一个安全、可控、可多轮对话迭代的托管 workflow 工作流。

## 为什么要这样设计

n8n 的节点生态很大，而且节点参数、凭据类型、版本和最佳实践会不断变化。如果在插件里硬编码所有节点配置，维护成本会很高，也很容易过时。

因此本项目采用动态检索的方式：

- 通过 n8n MCP 获取 SDK 指南。
- 通过 n8n MCP 搜索节点。
- 通过 n8n MCP 获取节点类型和配置文档。
- 让 OpenCode 根据当前文档生成 workflow 计划。
- 插件根据实际编译出的 workflow 生成用于 n8n MCP `validate_workflow` 的 SDK code。
- 插件负责校验、编译、MCP validation、持久化和安全边界。

这样可以让插件随着 n8n 节点文档更新而更容易适配新节点。

## v0.1.0 已实现能力

- 根据自然语言 prompt 创建 inactive 的 n8n workflow 草稿。
- 使用 n8n MCP 动态检索 SDK 指南和节点文档。
- 将 OpenCode 生成的计划编译成 n8n workflow JSON。
- 在保存和更新前校验 workflow 结构。
- 在本地 `.opencode/n8n-workflows.json` 中记录托管 workflow。
- 只 inspect 本插件托管、inactive、且属于当前 n8n base URL 的 workflow。
- 只 update 本插件托管、inactive、且属于当前 n8n base URL 的 workflow。
- 使用 `preview` / `apply` 两阶段更新流程。
- 在 apply 前检查 workflow 是否已被 n8n UI 或其他方式修改，避免过期 preview 覆盖新改动。
- 从本地环境变量解析或创建 n8n credential 引用。
- 避免把明文密钥写入 workflow JSON、preview 文件、registry 文件、日志或普通工具输出。
- 支持列出当前 OpenCode workspace 中本地 registry 记录的托管 workflow。

## v0.2.0 新增能力

- 增加 opt-in 的真实 n8n Docker E2E 验证；默认 `npm test` 仍只跑本地单元测试，不启动 Docker。
- 拆分普通 Vitest 配置和 E2E Vitest 配置，避免真实 n8n 测试混入默认测试。
- 增加 `docker-compose.e2e.yml` 和 `scripts/run-e2e.mjs`，由 runner 负责启动 n8n、等待就绪、映射测试环境变量和清理容器。
- 支持 MCP Bearer auth token：配置项 `n8n.mcpToken` 或环境变量 `N8N_MCP_TOKEN`。
- E2E 中通过真实 n8n REST API 创建、读取、更新并清理测试 workflow。
- 覆盖 lifecycle E2E 和 plugin smoke E2E，验证核心工具编排能连接真实 API/MCP 配置。

## v0.3.0 新增能力

- 使用 n8n MCP `get_suggested_nodes` 为 planner 提供节点选择建议。
- planner 输出 workflow draft 和 nodeSelection 理由，插件根据实际编译出的 workflow 生成用于 MCP `validate_workflow` 的 SDK code。
- build 和 update preview 在保存前调用 MCP `validate_workflow`。
- MCP validation error 会阻止创建 workflow 或保存 update preview。
- MCP validation warning 会进入工具结果的 `warnings`，便于用户继续调整 workflow。
- E2E 覆盖扩展到 `get_suggested_nodes`、`validate_workflow` 和 draft planner 路径。

v0.3 仍然使用现有 n8n REST API 创建和更新托管 workflow，不切换到 MCP `create_workflow_from_code` 或 MCP `update_workflow`。这样可以继续保留本地 registry、preview/apply、防 stale preview、inactive-only 等安全边界。

## v0.4.0 新增能力

- 增加节点兼容性 catalog，把节点支持声明拆分为 `tier_1_verified`、`tier_2_modeled` 和 `tier_3_dynamic`。
- planner prompt 会收到 node compatibility guidance，优先使用已验证节点，同时仍允许 MCP 动态发现的节点。
- build 和 update preview 会在工具结果中返回 `NODE_COMPATIBILITY_DYNAMIC` warning，提示某个节点来自动态发现但尚无提交的兼容性场景。
- 默认测试新增 `tests/node-compatibility.test.ts`，覆盖兼容性 catalog、planner guidance 和动态节点 warning。
- E2E fixture 扩展到 webhook transform response、schedule/http/if/set、webhook branch merge、API polling notice 等低风险场景。
- README 新增兼容性 tiers 表，明确区分“已测试验证”和“通过 MCP 动态支持但未场景验证”。

v0.4 仍不承诺每个官方节点和每种参数组合都已被真实 n8n E2E 验证。它的支持模型是：官方节点通过 MCP 动态检索和生成，仓库内只对明确列入兼容性矩阵的节点族和场景做测试背书。

## v0.5.0 新增能力

- build 和 update preview 结果新增 `credentialActions` 字段，和旧的 `missingCredentials` 并存，便于 OpenCode 给用户解释下一步操作。
- credential resolver 会返回结构化 action：`reuse_existing`、`create_from_env`、`set_missing_env`、`configure_mapping`、`complete_oauth_in_n8n`。
- `n8n.credentialEnv` 支持可选元数据：`authMode`、`setupUrl`、`docs`。
- OAuth credential 使用 `authMode: "oauth2"` 时不会尝试通过 API 创建 credential，而是返回到 n8n UI 手动完成授权的操作指引。
- 缺失环境变量时，工具结果只返回环境变量名，不返回环境变量值。
- n8n API 和 MCP 错误详情会经过递归 redaction，避免嵌套 `token`、`clientSecret`、Bearer token、Slack token 等值出现在普通工具输出中。

v0.5 仍不自动完成 OAuth consent，不存储 credential secret，也不修改非本插件创建和登记的 workflow。

## v0.6.0 新增能力

- 新增 `n8n_claim_workflow` 工具，用于显式接管已有 inactive n8n workflow。
- `preview` 模式只读取 workflow，返回 eligibility、风险和结构摘要，不写 n8n，也不写本地 registry。
- `apply` 模式要求 `confirm: true`，并会重新读取 workflow、重新校验资格，然后写入 `opencode-n8n-builder` marker 和本地 registry。
- 已经带有本插件 marker 但本地 registry 缺失的 workflow，可以通过 claim apply 修复 registry。
- active workflow、其他工具管理的 workflow、base URL 不匹配的 registry 记录、包含疑似明文密钥的 workflow 都会被阻断。
- 成功 claim 后，既有 `n8n_inspect_workflow` 和 `n8n_update_workflow` 安全边界继续适用。

v0.6 仍不接管 active workflow，不自动修复不安全节点，不导入执行历史，也不放宽 update preview/apply 的 stale 检查。

## v0.7.0 新增能力

- `n8n_update_workflow` 的 preview/apply 结果新增结构化 `diff`，覆盖新增/移除节点、参数变化、credential 名称变化、连接变化和 settings 变化。
- update preview 文件会同时保存 `baseWorkflow`、`proposedWorkflow` 和脱敏后的 `diff`，为后续 rollback 提供可审计依据。
- 新增 `rollback-preview` 模式：只读取 preview 和当前 workflow，返回从当前 proposed workflow 恢复到 base workflow 的差异，不写入 n8n。
- 新增 `rollback-apply` 模式：仅当当前 n8n workflow 仍匹配当时的 proposed workflow hash 时，才恢复到 preview 前的 base workflow，并更新本地 registry。
- update patch planner prompt 现在明确要求保留未改变的 node name、id、credential 和 connection，并优先生成满足需求的最小完整替换 workflow。
- diff 输出会对敏感字段名和 Bearer/Slack token 风格字符串做 redaction，避免 preview 文件或工具结果暴露 secret。

v0.7 仍不提供可视化 canvas diff，不浏览任意历史版本，不对未托管或未 claim 的 workflow 执行 rollback，也不放宽 inactive-only 安全边界。

## 当前暂不支持

- 修改或接管 active workflow。
- 自动把 workflow 放入 n8n project 或 folder。
- 自动完成 OAuth 授权流程。
- 可视化 workflow diff。
- 创建或更新后自动激活 workflow。
- 保证支持所有第三方或社区节点。
- 导入 workflow 执行历史。

## 节点兼容性声明（v0.4+）

v0.4 开始，项目使用分层兼容性声明。插件仍会通过 n8n MCP 动态检索官方节点文档，但 README 只对已经进入测试场景的节点族做明确验证声明。

| Tier | 含义 | 示例 | 测试证据 |
| --- | --- | --- | --- |
| `tier_1_verified` | 已有提交的低风险场景和默认单元测试覆盖；Docker 可用时可跑真实 n8n E2E。 | Manual Trigger, Webhook, Schedule Trigger, Set/Edit Fields, IF, Switch, Merge, HTTP Request, Respond to Webhook | `tests/node-compatibility.test.ts`, `tests/e2e/helpers/test-workflows.test.ts`, opt-in Docker E2E |
| `tier_2_modeled` | 已知节点族，可通过 MCP 文档动态生成，通常涉及凭据或 OAuth；v0.4 不做真实第三方服务 E2E。 | Slack, Gmail, Google Sheets, Code | unit fixtures and MCP docs context |
| `tier_3_dynamic` | 运行时由 MCP 搜索/文档发现，但仓库中没有提交的兼容性场景。 | 其他官方节点或社区节点 | 工具结果返回 `NODE_COMPATIBILITY_DYNAMIC` warning |

## 整体架构

```mermaid
flowchart TD
  User["用户在 OpenCode 中输入自然语言需求"] --> Plugin["OpenCode 插件工具"]
  Plugin --> MCP["n8n MCP Client"]
  Plugin --> Planner["OpenCode Planner"]
  MCP --> NodeDocs["SDK 指南和节点文档"]
  NodeDocs --> Planner
  Planner --> Plan["结构化 workflow 计划"]
  Plan --> Compiler["Workflow Compiler"]
  Compiler --> Validator["Workflow Validator"]
  Validator --> API["n8n REST API Client"]
  API --> N8N["n8n workflow 草稿"]
  API --> Credentials["n8n credentials"]
  Plugin --> Registry["本地 workflow registry"]
  Plugin --> PreviewStore["本地 update preview store"]
```

主要模块：

- `src/plugin.ts`：OpenCode 插件入口，负责注册工具和依赖装配。
- `src/opencode-planner.ts`：调用 OpenCode 生成 workflow 计划，并解析结构化 JSON。
- `src/n8n-mcp-client.ts`：n8n MCP JSON-RPC 客户端，用于读取 SDK 指南、搜索节点和获取节点文档。
- `src/n8n-api-client.ts`：n8n REST API 客户端，用于 workflow 和 credential 持久化。
- `src/workflow-compiler.ts`：把内部 workflow plan 编译为 n8n workflow JSON。
- `src/validator.ts`：校验 workflow 结构、托管标记、连接关系、active 状态和疑似明文密钥。
- `src/credential-resolver.ts`：根据配置和环境变量复用或创建 n8n credential。
- `src/credential-actions.ts`：生成 credential setup action，用于解释复用、创建、缺失环境变量、缺失映射和 OAuth handoff。
- `src/security.ts`：明文密钥检测、私网 URL warning 和递归 secret redaction。
- `src/registry.ts`：管理本地托管 workflow registry。
- `src/preview-store.ts`：保存短期 update preview。
- `src/tools/*`：分别实现 build、update、claim、inspect、list 工具编排。

## OpenCode 工具

### `n8n_build_workflow`

根据自然语言创建新的 inactive n8n workflow 草稿。

参数：

- `prompt`：必填，自然语言 workflow 需求。
- `name`：可选，workflow 名称覆盖。

执行流程：

1. 读取 n8n SDK 指南。
2. 根据 prompt 搜索相关 n8n 节点。
3. 根据 prompt 获取 MCP suggested-node guidance。
4. 获取节点类型和配置文档。
5. 让 OpenCode 生成 workflow draft：包含 workflow plan 和节点选择理由。
6. 编译为 n8n workflow JSON。
7. 强制设置 `active: false`。
8. 写入 `opencode-n8n-builder` 托管标记。
9. 执行本地 workflow 校验。
10. 解析 credential 引用，并生成 `credentialActions`。
11. 根据实际编译出的 workflow 生成 SDK code，并使用 n8n MCP `validate_workflow` 校验。
12. 调用 n8n REST API 创建 workflow。
13. 写入本地 registry。

### `n8n_update_workflow`

预览或应用对托管 workflow 的更新。

参数：

- `workflowId`：必填，n8n workflow ID。
- `mode`：必填，`preview`、`apply`、`rollback-preview` 或 `rollback-apply`。
- `prompt`：`preview` 模式必填，描述希望如何修改 workflow。
- `previewId`：`apply`、`rollback-preview` 和 `rollback-apply` 模式必填，由上一次 preview 返回。

`preview` 行为：

- 读取当前 workflow。
- 检查 workflow 是否为 inactive 的托管 workflow。
- 检查本地 registry 中是否存在同 base URL 的记录。
- 根据用户 prompt 生成替换方案。
- 编译和校验新 workflow。
- 解析 credential，并生成 `credentialActions`。
- 根据 replacement workflow 生成 SDK code，并使用 n8n MCP `validate_workflow` 校验。
- 保存短期 preview。
- 返回变更摘要和结构化 `diff`，不修改 n8n。

`apply` 行为：

- 读取 preview。
- 重新读取当前 workflow。
- 检查当前 workflow hash 是否仍然匹配 preview 生成时的 base hash。
- 再次校验 proposed workflow。
- 调用 n8n API 更新 workflow。
- 更新本地 registry。
- 返回保存的 preview `diff`。

`rollback-preview` 行为：

- 读取 preview。
- 重新读取当前 workflow。
- 检查当前 workflow 是否仍然匹配 preview 中的 proposed workflow hash。
- 校验当前 workflow 和 rollback 目标 workflow。
- 返回从当前 workflow 恢复到 base workflow 的结构化 `diff`，不修改 n8n。

`rollback-apply` 行为：

- 读取 preview。
- 重新读取当前 workflow。
- 检查当前 workflow 是否仍然匹配 preview 中的 proposed workflow hash。
- 校验 rollback 目标 workflow。
- 调用 n8n API 把 workflow 恢复到 preview 前的 base workflow。
- 更新本地 registry，并返回 rollback `diff`。

### `n8n_claim_workflow`

显式接管已有 inactive n8n workflow，使其进入当前 OpenCode workspace 的托管生命周期。

参数：

- `workflowId`：必填，n8n workflow ID。
- `mode`：必填，`preview` 或 `apply`。
- `confirm`：`apply` 模式必须为 `true`。

`preview` 行为：

- 读取目标 workflow。
- 校验 workflow 是否为 inactive。
- 检查是否已有其他不兼容 ownership marker。
- 检查本地 registry 是否已有同 workflow ID 且属于其他 n8n base URL 的记录。
- 执行结构校验、疑似明文密钥检查和私网 URL warning。
- 返回 claim eligibility、风险列表、节点数量、连接数量、触发节点类型和 credential 类型。
- 不调用 n8n update API。
- 不写本地 registry。

`apply` 行为：

- 要求 `confirm: true`。
- 重新读取 workflow 并重新执行 `preview` 的 eligibility 检查。
- 对未托管且符合条件的 inactive workflow 写入 `opencode-n8n-builder` marker/tag。
- 对已带有本插件 marker 但本地 registry 缺失的 workflow，只修复本地 registry，不重复写 marker。
- 写入本地 registry 后，既有 inspect 和 update preview/apply 流程即可继续使用。

安全限制：

- 不接管 active workflow。
- 不接管带有其他 `meta.managedBy` 标记的 workflow。
- 不接管包含疑似明文密钥参数的 workflow。
- 不跨 n8n base URL 修复 registry 记录。

### `n8n_inspect_workflow`

查看托管 workflow 的摘要信息。

参数：

- `workflowId`：必填，n8n workflow ID。

返回内容包括：

- workflow ID。
- workflow 名称。
- active 状态。
- 节点名称和类型。
- 节点 credential 类型。
- 连接信息。
- 校验问题。

安全限制：

- 只允许 inspect inactive workflow。
- workflow 必须带有 `opencode-n8n-builder` 托管标记。
- 本地 registry 必须存在对应 workflow ID。
- registry 记录的 base URL 必须和当前配置一致。

### `n8n_list_managed_workflows`

列出当前 OpenCode workspace 中本地 registry 记录的托管 workflow。

参数：无。

特点：

- 只读取本地 `.opencode/n8n-workflows.json`。
- 不需要 n8n API key。
- 不需要 n8n MCP URL。
- 适合快速查看当前项目由插件管理了哪些 workflow。

## 安全模型

当前安全模型是保守的。

插件不会 update 或 inspect 一个 workflow，除非同时满足：

- n8n workflow 中有 `opencode-n8n-builder` 托管 marker 或 tag。
- workflow 当前为 inactive。
- 本地 OpenCode workspace registry 中存在该 workflow ID。
- registry 记录属于当前配置的 `N8N_BASE_URL`。

update 还额外要求：

- 必须先生成 preview。
- apply 时必须提供 previewId。
- preview 未过期。
- preview 中 proposed workflow hash 未被篡改。
- 当前 n8n workflow hash 仍然等于生成 preview 时的 base hash。

claim 采用更窄的显式接管流程：

- `preview` 只读，不写 n8n，也不写本地 registry。
- `apply` 必须设置 `confirm: true`。
- `apply` 会重新读取 workflow 并重新校验 eligibility。
- 只有 inactive、结构有效、没有疑似明文密钥、没有不兼容 marker、没有 registry base URL 冲突的 workflow 才能被接管。

这些限制用于避免：

- 意外修改用户手工创建的 workflow。
- 覆盖用户在 n8n UI 中直接做出的新修改。
- 因 workflow ID 在不同 n8n 实例中碰撞而误操作。
- 在第一版中误处理 active production workflow。

## 密钥和凭据策略

不要在 prompt 或 node parameters 中写入 API key、OAuth secret、password、bearer token、webhook signing secret 等明文密钥。

插件会尽量避免密钥泄漏：

- planner 和 validator 会拒绝常见疑似明文密钥。
- credential resolver 从本地环境变量读取 credential 值。
- workflow JSON 中只保存 n8n credential 引用，不保存原始密钥。
- registry 文件不保存密钥。
- preview 文件不保存密钥。
- 普通工具输出不返回密钥值。
- n8n API 和 MCP 错误会做 redaction 后再暴露。

OAuth 授权仍然需要用户在 n8n UI 中手动完成。插件不会替用户完成浏览器 OAuth consent。

## 配置方式

在 OpenCode 配置中启用插件，并提供 n8n 连接配置。

示例：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-n8n-builder"],
  "n8n": {
    "baseUrl": "https://your-instance.app.n8n.cloud/api/v1",
    "mcpUrl": "https://your-instance.app.n8n.cloud/mcp-server/http",
    "mcpToken": "optional-mcp-bearer-token",
    "credentialEnv": {
      "slackApi": {
        "name": "OpenCode Slack",
        "type": "slackApi",
        "authMode": "api_key",
        "env": {
          "accessToken": "SLACK_BOT_TOKEN"
        },
        "docs": ["Slack bot token with chat:write scope"]
      }
    }
  }
}
```

环境变量：

- `N8N_API_KEY`：n8n REST API key。
- `N8N_BASE_URL`：n8n REST API base URL，例如 `https://your-instance.app.n8n.cloud/api/v1`。
- `N8N_MCP_URL`：n8n MCP endpoint URL，用于 build 和 update preview。
- `N8N_MCP_TOKEN`：可选，n8n MCP endpoint 需要 Bearer auth 时使用。

配置要求：

- `N8N_BASE_URL` 和 `N8N_API_KEY` 是 inspect、build、update preview、update apply 必需配置。
- `N8N_MCP_URL` 是 build 和 update preview 必需配置。
- `N8N_MCP_TOKEN` 或 `n8n.mcpToken` 是可选配置；仅当 MCP endpoint 要求 Bearer Token 时才需要。API-only 和 local-only 命令不需要 MCP token。
- `n8n_list_managed_workflows` 只读取本地 registry，不需要 n8n 连接配置。

`N8N_BASE_URL` 和 `N8N_MCP_URL` 可以通过环境变量提供，也可以在 OpenCode config 中用 `n8n.baseUrl` 和 `n8n.mcpUrl` 提供。

`N8N_API_KEY` 也可以通过 `n8n.apiKey` 提供，但更推荐使用环境变量，减少本地配置文件中的密钥暴露。

`N8N_MCP_TOKEN` 也可以通过 `n8n.mcpToken` 提供。插件会以 Bearer token 形式发送到 MCP JSON-RPC endpoint；没有配置 token 时不会添加 Authorization header。

## Credential 映射

`n8n.credentialEnv` 用于告诉插件如何根据本地环境变量创建或复用 n8n credential。key 必须匹配 workflow node 使用的 credential type，例如 `slackApi`、`httpHeaderAuth`、`smtp` 或 `gmailOAuth2`。

每个映射支持：

- `name`：n8n 中要复用或创建的 credential 名称。
- `type`：n8n credential type。
- `env`：credential data 字段到本地环境变量名的映射。这里写的是环境变量名，不是 secret 值。
- `authMode`：可选，`api_key`、`oauth2` 或 `manual`。
- `setupUrl`：可选，指向公开文档或内部 setup 页面。
- `docs`：可选，返回给用户的公开说明文本或文档链接。

Slack bot token 示例：

```json
{
  "n8n": {
    "credentialEnv": {
      "slackApi": {
        "name": "OpenCode Slack",
        "type": "slackApi",
        "authMode": "api_key",
        "env": {
          "accessToken": "SLACK_BOT_TOKEN"
        },
        "docs": ["Use a Slack bot token with chat:write scope."]
      }
    }
  }
}
```

HTTP Header Auth / 通用 API key 示例：

```json
{
  "n8n": {
    "credentialEnv": {
      "httpHeaderAuth": {
        "name": "OpenCode Vendor API",
        "type": "httpHeaderAuth",
        "authMode": "api_key",
        "env": {
          "name": "VENDOR_API_HEADER_NAME",
          "value": "VENDOR_API_KEY"
        },
        "docs": ["Set VENDOR_API_HEADER_NAME to Authorization or X-API-Key as required by the vendor."]
      }
    }
  }
}
```

SMTP 多环境变量示例：

```json
{
  "n8n": {
    "credentialEnv": {
      "smtp": {
        "name": "OpenCode SMTP",
        "type": "smtp",
        "authMode": "api_key",
        "env": {
          "user": "SMTP_USER",
          "password": "SMTP_PASSWORD",
          "host": "SMTP_HOST",
          "port": "SMTP_PORT"
        },
        "docs": ["Use a dedicated SMTP app password if your provider supports it."]
      }
    }
  }
}
```

Gmail OAuth handoff 示例：

```json
{
  "n8n": {
    "credentialEnv": {
      "gmailOAuth2": {
        "name": "OpenCode Gmail",
        "type": "gmailOAuth2",
        "authMode": "oauth2",
        "env": {},
        "setupUrl": "https://docs.n8n.io/integrations/builtin/credentials/google/",
        "docs": ["Create or authorize this OAuth credential in n8n UI, then rerun the OpenCode request."]
      }
    }
  }
}
```

不同 n8n 版本或 credential type 的 data 字段可能不同；实际字段名应以当前 n8n credential schema、MCP 文档或 n8n UI 为准。插件只负责按 `env` 映射把环境变量值提交给 n8n credential API，不会在工具输出中回显这些值。

运行时行为：

1. workflow plan 引用了某种 credential type，例如 `slackApi`。
2. resolver 检查 `n8n.credentialEnv` 中是否有对应映射。
3. 如果 n8n 中已存在同 type 和 name 的 credential，就复用该引用，并返回 `reuse_existing` action。
4. 如果不存在，并且所需环境变量都存在，就创建新的 n8n credential，并返回 `create_from_env` action。
5. 如果配置缺失，workflow 草稿仍可创建，但工具结果会返回 `configure_mapping` action。
6. 如果环境变量缺失，工具结果会返回 `set_missing_env` action；`requiredEnv` 只包含环境变量名。
7. 如果 `authMode` 是 `oauth2`，插件不会调用 credential 创建 API，而是返回 `complete_oauth_in_n8n` action。

工具结果会保留旧的 `missingCredentials` 字段，并新增 `credentialActions`：

```json
{
  "missingCredentials": [
    {
      "nodeName": "Send Slack Alert",
      "credentialType": "slackApi",
      "credentialName": "OpenCode Slack",
      "reason": "Missing environment variables: SLACK_BOT_TOKEN"
    }
  ],
  "credentialActions": [
    {
      "nodeName": "Send Slack Alert",
      "credentialType": "slackApi",
      "credentialName": "OpenCode Slack",
      "action": "set_missing_env",
      "status": "required",
      "message": "Set missing environment variables for OpenCode Slack: SLACK_BOT_TOKEN.",
      "requiredEnv": ["SLACK_BOT_TOKEN"],
      "manualSetupUrl": "https://your-instance.app.n8n.cloud/credentials"
    }
  ]
}
```

## 本地开发

安装依赖：

```bash
npm install
```

运行检查：

```bash
npm run typecheck
npm run test
npm run build
```

也可以直接运行本地二进制：

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
./node_modules/.bin/tsup
```

脚本说明：

- `npm run typecheck`：运行 TypeScript 类型检查。
- `npm run test`：运行 Vitest 测试。
- `npm run build`：使用 tsup 构建 package 输出。
- `npm run check`：依次运行 typecheck、test、build。

## 真实 n8n 实例验证（v0.2+）

v0.2 增加了一个显式触发的 E2E 验证层，用本地 Docker n8n 实例验证插件的核心生命周期。v0.3 在该 E2E 层中继续覆盖 MCP `get_suggested_nodes`、`validate_workflow` 和 draft planner 路径。v0.4 继续扩展低风险节点兼容性场景。v0.5 补充 credential setup UX 和错误脱敏的默认测试。v0.6 增加已有 inactive workflow 的 claim/import 场景。v0.7 增加结构化 diff、preview base/proposed 持久化和 rollback 的默认单元测试。默认的 `npm test` 不会启动 Docker，也不要求真实 n8n。

前置条件：

- 已安装 Docker 或 Docker Desktop。
- 能运行 `docker compose`。
- 已在本地测试 n8n 中创建测试用 API Key。

运行方式：

```bash
N8N_E2E_API_KEY=<你的测试 API Key> npm run test:e2e
```

该命令会启动 `docker-compose.e2e.yml` 中定义的 n8n `2.23.4` 测试实例，等待 n8n 可访问，将 `N8N_E2E_BASE_URL`、`N8N_E2E_MCP_URL`、`N8N_E2E_API_KEY` 和可选 MCP token 映射给测试进程，然后运行 `tests/e2e/**/*.e2e.test.ts`。该 Docker stack 会通过环境变量启用 instance-level MCP access；如果你覆盖镜像版本并希望继续用环境变量自动启用 MCP，请使用支持 env-managed MCP settings 的 n8n `2.20.0` 或更高版本。更早但已支持 workflow-builder MCP 的版本需要在 UI 中手动启用 MCP access。

首次创建 API Key：

如果没有传入 `N8N_E2E_API_KEY`，runner 会先检查 Docker 和 `docker compose`。如果 Docker 本身不可用，会更早失败并输出 Docker 诊断。Docker 可用时，runner 会启动本地 n8n 并提示打开：

```text
http://localhost:5678
```

在 n8n UI 中完成初始化并创建测试 API Key 后，重新运行：

```bash
N8N_E2E_API_KEY=<你的测试 API Key> npm run test:e2e
```

MCP 配置：

- 默认 MCP URL 是 `http://127.0.0.1:5678/mcp-server/http`。
- 如果 n8n MCP endpoint 需要 Bearer Token，可传入 `N8N_E2E_MCP_TOKEN`：

```bash
N8N_E2E_API_KEY=<你的测试 API Key> N8N_E2E_MCP_TOKEN=<你的 MCP Token> npm run test:e2e
```

调试模式：

```bash
N8N_E2E_KEEP_ALIVE=1 N8N_E2E_API_KEY=<你的测试 API Key> npm run test:e2e
```

调试模式会让 Docker stack 在测试结束后继续运行，方便进入 n8n UI 查看 workflow 和日志。默认 runner 在成功或普通失败清理时会停止容器并移除 orphan container，但不会删除 n8n Docker volume；首次 bootstrap 缺少 API Key 时也会保留 volume，避免丢失已经完成的本地初始化。只有显式设置 `N8N_E2E_REMOVE_VOLUMES=1` 时，cleanup 才会移除 volume。

## 测试覆盖

v0.7.0 默认测试覆盖：

- OpenCode 插件注册和工具 wiring。
- 配置从环境变量和 OpenCode config 中加载。
- n8n MCP JSON-RPC envelope、content parsing 和错误 redaction。
- n8n MCP Bearer token 配置和请求 header。
- n8n MCP `get_suggested_nodes` 和 `validate_workflow` 客户端调用。
- 节点兼容性 catalog、tier 分类、planner compatibility guidance 和 dynamic node warning。
- planner draft schema、nodeSelection 理由和 workflow-to-SDK validation code 生成。
- build/update preview 保存前的 MCP validation 阻断与 warning 输出。
- build/update preview 对 `tier_3_dynamic` 节点返回 `NODE_COMPATIBILITY_DYNAMIC` warning。
- n8n REST API workflow 和 credential 调用。
- n8n API 非 2xx 响应体的递归 redaction。
- MCP JSON-RPC `error.data` 的递归 redaction。
- planner JSON 提取和校验。
- workflow compiler 行为。
- workflow validator 的结构校验、secret 检测、连接校验和托管 marker 校验。
- credential resolver 行为。
- credential setup action helper。
- build/update 结果中的 `credentialActions`。
- credential config metadata：`authMode`、`setupUrl`、`docs`。
- workflow ownership state helper。
- claim workflow preview/apply、confirm、registry repair 和阻断条件。
- workflow diff 模型、secret redaction、diff empty-state 判断。
- registry 和 preview store 持久化，包括 update preview 的 `baseWorkflow`、`proposedWorkflow` 和 `diff` 结构校验。
- build workflow 编排。
- update preview/apply 安全边界、结构化 diff 返回和 rollback preview/apply/stale 阻断。
- 插件 update mode schema、rollback 参数路由，以及 patch planner 最小变更提示。
- inspect/list 安全边界。
- v0.4 低风险场景 fixture：webhook transform response、schedule/http/if/set、webhook branch merge、API polling notice。

v0.7.0 opt-in E2E 覆盖：

- Docker runner 的 Docker/Compose 诊断、n8n readiness、API Key bootstrap 提示、环境变量映射和 cleanup 参数。
- 真实 n8n API lifecycle：创建、读取、更新和清理测试 workflow。
- 真实 MCP endpoint smoke 检查，覆盖 `get_sdk_reference`、`search_nodes`、`get_node_types`、`get_suggested_nodes` 和 `validate_workflow`；需要 Bearer auth 时支持 `N8N_E2E_MCP_TOKEN`。
- 插件 smoke E2E：通过插件工具路径连接真实测试配置。
- v0.4 低风险兼容性场景：Webhook + Set + Respond to Webhook、Schedule + HTTP Request + IF + Set、Webhook + Switch + Merge、Schedule + HTTP Request + IF + Set notice。
- v0.6 claim/import 场景：创建外部 inactive workflow -> claim preview -> claim apply -> inspect -> update preview。
- v0.7 尚未新增 Docker E2E rollback 场景；rollback 当前由默认单元测试覆盖。

v0.7.0 最近一次本地验证结果（不含 Docker E2E）：

- TypeScript：`./node_modules/.bin/tsc --noEmit` 通过。
- Vitest：`./node_modules/.bin/vitest run` 通过，20 个测试文件，212 个测试通过。
- 当前环境没有 Docker CLI，`env -u N8N_E2E_API_KEY node scripts/run-e2e.mjs` 返回 `spawn docker ENOENT` 诊断；有 Docker 和本地测试 API Key 时再运行 `N8N_E2E_API_KEY=<你的测试 API Key> npm run test:e2e` 做完整 E2E。

## 当前版本状态

`0.7.0` 是 rich update diff 和 rollback 里程碑：

- 插件运行时已接入 OpenCode。
- build/update/claim/inspect/list 五个工具已实现。
- workflow ownership 和 active workflow 安全限制已实现。
- `n8n_claim_workflow` 支持只读 preview 和需要 `confirm: true` 的 apply。
- 未托管 inactive workflow 可以被显式接管，已带本插件 marker 但缺 registry 的 workflow 可以修复 registry。
- active workflow、不兼容 owner、registry base URL mismatch、疑似明文密钥都会阻断 claim。
- update preview 会返回结构化 `diff`，并保存 preview 前后的 workflow 快照。
- update apply 会返回保存的 preview `diff`。
- rollback preview/apply 已实现，并要求当前 workflow 仍匹配已应用 preview 的 proposed hash。
- rollback apply 会恢复到 preview 前的 base workflow，并刷新 registry hash。
- patch planner prompt 已强化为最小变更优先，避免不必要地改动未触及的节点、credential 和连接。
- credential 引用和明文密钥防护已实现。
- build 和 update preview 会返回 `credentialActions`，说明 credential 已复用、已创建或需要用户补操作。
- OAuth credential 会返回 n8n UI handoff 指引，不自动完成 OAuth 授权。
- 缺失 credential mapping 或环境变量时，工具结果只包含公开配置项和环境变量名。
- 默认单元测试保持 Docker-free。
- 真实 n8n Docker E2E 已作为显式 opt-in 验证路径加入。
- build 和 update preview 已在保存前接入 n8n MCP `validate_workflow`。
- MCP warnings 会随工具结果返回，MCP errors 会阻止保存。
- planner 已接入 node compatibility guidance。
- build 和 update preview 会为未提交兼容性场景的动态节点返回 `NODE_COMPATIBILITY_DYNAMIC` warning。
- n8n API/MCP 错误详情会递归脱敏后再暴露。
- README 中的节点支持声明按兼容性 tier 区分，不把动态支持表述为完整验证。
- README 描述的是当前真实支持范围；除非实际运行 `npm run test:e2e`，不要把 Docker E2E 视为已在当前机器通过。

## 后续路线

可能的后续方向：

- 继续扩展节点兼容性矩阵和真实 n8n 场景覆盖。
- 为 update diff 增加可视化展示、历史浏览和更细粒度的参数解释。
- 支持用户显式确认后的 active workflow 操作。
- 在 n8n API 支持明确后增加 project/folder placement。
- 增强 credential provider 支持。
- 深化已有 workflow claim/import 的场景覆盖，例如更丰富的风险解释和迁移辅助。
- 针对更多真实 workflow 形态加强 workflow-to-SDK validation code 生成覆盖。
- 完善 OpenCode 插件发布和安装文档。

## License

Apache-2.0，和仓库中的 `LICENSE` 文件以及 `package.json` 保持一致。
