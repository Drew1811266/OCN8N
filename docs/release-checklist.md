# Release Checklist

本清单用于 v2.0 之后的发布准备。除非 project owner 明确批准，不要 tag、不要 publish npm、不要合并 release 分支。

## Pre-release Verification

- [ ] `npm run typecheck` 通过，或在 Codex desktop 中运行 `./node_modules/.bin/tsc --noEmit`。
- [ ] `npm run test` 通过，默认测试不需要 Docker。
- [ ] `npm run build` 通过，并生成 `dist/index.js` 和 `dist/index.d.ts`。
- [ ] `npm run package:check` 通过。
- [ ] `git diff --check` 无输出。
- [ ] Docker 可用环境中运行 `N8N_E2E_API_KEY=<key> npm run test:e2e`，或明确记录 Docker 不可用诊断。

## v1.0 Release Candidate Review

- [ ] `README.md` 当前版本为 `1.0.0`，并描述实际行为而不是未来目标。
- [ ] `CHANGELOG.md` 包含 `## 1.0.0`。
- [ ] `docs/public-contract.md` 覆盖工具、结果、错误、warning、registry 和 preview 合同。
- [ ] `docs/compatibility.md` 覆盖 Node、OpenCode、n8n、MCP、节点 tier 和 credential flow。
- [ ] `docs/security-review.md` 记录无已知 critical safety blocker。
- [ ] package entrypoint 导出公开类型，`tests/public-contract.test.ts` 通过。
- [ ] GitHub token 具备 `workflow` scope，或明确记录 `.github/workflows/check.yml` 无法推送的授权阻断。

## v2.0 Public Contract Reset Review

- [ ] `README.md` 当前版本为 `2.0.0`，并描述 Breaking Reset。
- [ ] `CHANGELOG.md` 包含 `## 2.0.0`。
- [ ] `package.json` 和 `package-lock.json` root version 均为 `2.0.0`。
- [ ] 默认插件入口只暴露 `n8n_v2_auto_preview`。
- [ ] 默认插件入口只暴露 `n8n_v2_create_plan`。
- [ ] 默认插件入口只暴露 `n8n_v2_review_plan`。
- [ ] 默认插件入口只暴露 `n8n_v2_patch_plan`。
- [ ] 默认插件入口只暴露 `n8n_v2_validate_simulate`。
- [ ] 默认插件入口只暴露 `n8n_v2_compile_preview`。
- [ ] 默认插件入口只暴露 `n8n_v2_apply`。
- [ ] 默认插件入口只暴露 `n8n_v2_claim_workflow`。
- [ ] 默认插件入口只暴露 `n8n_v2_reverse_plan`。
- [ ] 默认插件入口只暴露 `n8n_v2_run_trial`。
- [ ] `docs/public-contract.md` 覆盖 v2 tools、result types、`V2ArtifactPaths`、`V2RegistryRecord`、`V2CompiledPreview` 和 `V2TrialRunArtifact`。
- [ ] `docs/public-contract.md` 覆盖 `n8n_v2_compile_preview` 的 MCP validation after compile、`mcpValidationStatus` 和 MCP validation failure 阻断。
- [ ] `docs/migration-v1-to-v2.md` 覆盖 v1 artifact 非迁移、full claim、read-only claim 和 no silent migration。
- [ ] `docs/pattern-compatibility-matrix.md` 覆盖七个 pattern family 的 required variants、validation focus 和 core node combinations。
- [ ] `docs/operations.md` 说明 `.opencode/n8n-v2/` artifact root 和 v1 artifact 不自动迁移。
- [ ] `docs/compatibility.md` 覆盖七个 pattern family：`trigger`、`transform`、`branch`、`loop_batch`、`error_handling`、`external_call`、`output`。
- [ ] `docs/security-review.md` 记录 no silent n8n writes、no active workflow structural apply、no silent migration from v1 artifacts、no execution-history sampling without opt-in、no trial run without opt-in，以及 v2-claimed inactive workflow update apply 的 stale-hash 防护。
- [ ] `tests/plugin.test.ts`、`tests/public-contract.test.ts`、`tests/package-metadata.test.ts` 和 `tests/docs-release.test.ts` 通过。

## Pack Review

- [ ] 在有 npm 的 shell 中运行 `npm pack --dry-run --json`。
- [ ] 确认包内只包含 `dist`、`README.md`、`CHANGELOG.md`、`docs`、`examples`、`package.json` 和自动包含的 license/readme 元数据。
- [ ] 确认没有 `.opencode`、preview 文件、registry、secret、测试 fixture output 或本地环境文件进入包。

## Owner Approval Gates

- [ ] owner 同意合并目标分支。
- [ ] owner 同意创建 tag，例如 `v0.9.0` 或 `v1.0.0`。
- [ ] owner 同意 npm publish。准备好不等于自动发布。

## Rollback

如果发布前发现问题，不要删除历史 tag。先停止 publish，修复分支，重新跑验证。若 npm 已发布且存在严重问题，由 owner 决定 deprecate、publish patch version，或撤回发行说明。
