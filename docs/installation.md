# 安装指南

`opencode-n8n-builder` 是连接 OpenCode 和 n8n 的插件，用于从自然语言创建、迭代、检查和运营受托管的 n8n workflow。本指南面向第一次接手项目的技术用户，目标是完成安装、配置和一次最小 smoke test。

## 前置条件

- Node.js 20 或更新版本。
- OpenCode，并启用插件配置能力。
- 一个可访问的 n8n 实例。
- n8n public API key。用于创建、读取、更新、claim、readiness、activation/deactivation 和 inspect。
- n8n MCP endpoint。build 和 update preview 需要 MCP 提供 SDK 指南、节点文档和 workflow validation。
- 可选：Docker Desktop。只有运行 opt-in E2E 测试时需要。

## 从包安装

项目 owner 发布 npm 包后，可以在 OpenCode workspace 中安装：

```bash
npm install opencode-n8n-builder
```

如果从本地 checkout 安装或调试，先安装依赖并构建：

```bash
npm install
npm run build
```

当前 Codex desktop 环境可能没有 `npm`，本仓库开发时可直接使用本地二进制：

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
./node_modules/.bin/tsup
node scripts/check-package-files.mjs
```

## 启用插件

在 OpenCode config 中加入插件名，并提供 `n8n` 配置。推荐把 `N8N_API_KEY` 和 `N8N_MCP_TOKEN` 放在环境变量中，不写入仓库文件。可从 `examples/` 复制 local n8n、n8n Cloud、MCP token 和 credential mapping 示例。

## 最小 smoke test

1. 先运行 `n8n_list_managed_workflows`。它只读取本地 registry，不需要 n8n API 或 MCP。
2. 对一个已托管 workflow 运行 `n8n_check_workflow_readiness` 的 `preview` 模式，验证 n8n API 可读。
3. 如果要创建新 workflow，运行 `n8n_build_workflow`，确认返回 inactive workflow 和本地 registry 记录。
4. 如果要修改 workflow，先运行 `n8n_update_workflow` 的 `preview`，审核 diff 后再用 `apply`。

## 本地验证

默认验证不启动 Docker：

```bash
npm run typecheck
npm run test
npm run build
npm run package:check
```

真实 n8n E2E 是显式 opt-in：

```bash
N8N_E2E_API_KEY=<your test key> npm run test:e2e
```

如果看到 `spawn docker ENOENT`，表示当前机器没有可用 Docker CLI 或 Docker daemon。先安装并启动 Docker Desktop，再重新运行 E2E。
