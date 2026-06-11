# Operations Guide

本文档描述 v2.0 默认公开 OpenCode 工具的参数、行为、写操作和安全限制。v2.0 是 Breaking Reset：默认插件入口只暴露 `n8n_v2_*` 工具，v1 registry 和 preview artifact 不会被自动读取或迁移。

## `n8n_v2_auto_preview`

用途：从自然语言需求生成 v2 plan，执行 review、validate、simulate，并编译为本地 n8n workflow preview。

参数：

- `prompt`：必填，自然语言业务流程需求。
- `name`：可选，workflow 名称覆盖。

行为：本地生成 plan artifact，运行 plan review 和 foundation simulation，编译 inactive workflow preview，并返回 `previewId`、review、simulation、mapping trace、confidence、riskLevel 和 warnings。

写操作：只写 `.opencode/n8n-v2/plans/` 和 `.opencode/n8n-v2/previews/`，不写 n8n。

## `n8n_v2_create_plan`

用途：创建 v2 business workflow plan artifact。

参数：

- `prompt`：必填。
- `name`：可选。

行为：生成 pattern-first plan，覆盖 trigger、transform、branch、loop_batch、error_handling、external_call 和 output 等 pattern family。

写操作：写 `.opencode/n8n-v2/plans/<planId>/v1.json`。

## `n8n_v2_review_plan`

用途：审查指定 plan version 的 pattern choices、assumptions、risks、credential gaps 和 simulation coverage。

参数：

- `planId`：必填。
- `planVersion`：必填。

行为：读取精确 plan version，返回 `V2PlanReview`。

写操作：无。

## `n8n_v2_patch_plan`

用途：基于已有 plan version 保存新的 patch version。

参数：

- `planId`：必填。
- `planVersion`：必填，必须是当前 parent。
- `patch`：必填，自然语言 patch 描述。

行为：生成新的 immutable plan version，并降低/保留 confidence 以要求后续 validate/simulate。

写操作：写 `.opencode/n8n-v2/plans/<planId>/v<next>.json`。

## `n8n_v2_validate_simulate`

用途：对 plan version 执行 foundation validation 和 sample simulation。

参数：

- `planId`：必填。
- `planVersion`：必填。

行为：检查必要 input、step、pattern、output、test example，验证 branch 默认分支、loop 上限、external call response contract 和 credential requirement，并返回 sample path 与 field traces。

写操作：无。

## `n8n_v2_compile_preview`

用途：把通过 validation/simulation 的 plan version 编译为本地 inactive n8n workflow preview。

参数：

- `planId`：必填。
- `planVersion`：必填。

行为：编译 workflow JSON，写入 `opencode-n8n-builder-v2` marker，生成 `V2PreviewMappingTrace`，保存 preview artifact。

写操作：写 `.opencode/n8n-v2/previews/<previewId>.json`，不写 n8n。

## `n8n_v2_apply`

用途：把 compiled preview 创建为新的 inactive n8n workflow，或更新 v2-claimed inactive workflow。

参数：

- `previewId`：必填。
- `confirm`：必须为 `true`。
- `workflowId`：可选。省略时创建新 inactive workflow；提供时更新对应 v2-claimed inactive workflow。

行为：读取 preview 和对应 plan version，确认 validation status 没有失败且 credential requirement 不阻断 apply。未提供 `workflowId` 时调用 n8n create workflow API。提供 `workflowId` 时读取 v2 registry 和当前 n8n workflow，要求 registry base URL 匹配、claim mode 为 `full`、当前 workflow inactive、当前 workflow hash 匹配 registry，然后调用 n8n update workflow API。

写操作：创建新的 inactive n8n workflow 或更新 v2-claimed inactive workflow，并写 `.opencode/n8n-v2/registry/workflows.json`。

安全限制：不结构性修改 active workflow，不更新 read-only claimed workflow，不在 registry base URL mismatch 或 stale hash 时 apply，不在缺失 credential 时 apply。

## `n8n_v2_claim_workflow`

用途：显式把已有 workflow 纳入 v2 registry。

参数：

- `workflowId`：必填。
- `mode`：`preview` 或 `apply`。
- `confirm`：`apply` 必须为 `true`。

行为：读取 workflow，检查 ownership、active/inactive policy、base URL、结构和 plaintext secret 风险。inactive workflow 可以 full claim 并写入 `opencode-n8n-builder-v2` marker；active workflow 只能 read-only claim，只写本地 v2 registry。

写操作：`preview` 不写。inactive full apply 可能写 n8n marker/tag 和 registry；active read-only apply 只写 registry。

## `n8n_v2_reverse_plan`

用途：从已 v2 claim 的 workflow 反向生成 v2 plan artifact。

参数：

- `workflowId`：必填。

行为：要求 workflow 已存在于 `.opencode/n8n-v2/registry/workflows.json`，重新读取 workflow，按已知 node family 映射到 v2 pattern，保存 `source: "reverse"` 的 plan version，并返回 mapped step count、unmapped nodes 和 uncertainty warnings。

写操作：写 `.opencode/n8n-v2/plans/` 和更新 v2 registry 的 latest plan metadata；不写 n8n。

安全限制：base URL mismatch 会阻断；active workflow reverse planning 只读。

## `n8n_v2_run_trial`

用途：对 compiled preview 执行 v2 dry-run trial。

参数：

- `previewId`：必填。
- `mode`：必须是 `dry_run`。
- `confirm`：必须为 `true`。
- `sampleName`：可选，必须匹配 plan test contract 中已有样例名称。

行为：读取 immutable preview 和对应 plan version，重新运行本地 validation/simulation，按可选样例名称检查 sample coverage，返回 `runId`、status、warnings、`triggered: false`、`executionMode: "not_triggered"` 和 `cleanupRequired: false`。

写操作：写 `.opencode/n8n-v2/runs/<runId>.json`；不写 n8n。

安全限制：不会调用 n8n trigger endpoint，不创建临时 workflow，不激活 workflow，不调用外部 API，也不采样 execution history。
