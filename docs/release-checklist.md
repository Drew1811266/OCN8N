# Release Checklist

本清单用于 v0.9 之后的发布准备。除非 project owner 明确批准，不要 tag、不要 publish npm、不要合并 release 分支。

## Pre-release Verification

- [ ] `npm run typecheck` 通过，或在 Codex desktop 中运行 `./node_modules/.bin/tsc --noEmit`。
- [ ] `npm run test` 通过，默认测试不需要 Docker。
- [ ] `npm run build` 通过，并生成 `dist/index.js` 和 `dist/index.d.ts`。
- [ ] `npm run package:check` 通过。
- [ ] `git diff --check` 无输出。
- [ ] Docker 可用环境中运行 `N8N_E2E_API_KEY=<key> npm run test:e2e`，或明确记录 Docker 不可用诊断。

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
