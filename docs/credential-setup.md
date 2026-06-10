# Credential Setup

插件不会把 secret 写入 workflow JSON、preview 文件、registry 或普通工具输出。workflow 中只保存 n8n credential 引用。credential 值来自本地环境变量或用户已经在 n8n UI 中配置好的 credential。

## Credential Actions

工具结果中的 `credentialActions` 会告诉用户下一步该做什么：

- `reuse_existing`：n8n 中已经存在匹配的 credential，插件复用它。
- `create_from_env`：插件可以根据 `n8n.credentialEnv` 和本地环境变量创建 credential。
- `set_missing_env`：配置中声明了环境变量名，但当前 shell 没有设置。
- `configure_mapping`：workflow 需要某种 credential type，但 OpenCode config 没有声明如何创建或复用。
- `complete_oauth_in_n8n`：OAuth credential 不能由插件自动完成浏览器 consent，用户需要去 n8n UI 授权。

## API Key Credential

对 API key 类 credential，推荐把真实值放在环境变量中：

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
        "docs": ["Slack bot token with chat:write scope"]
      }
    }
  }
}
```

如果 `SLACK_BOT_TOKEN` 没有设置，工具结果只会返回环境变量名，不返回任何 secret value。

## OAuth Credential

OAuth credential 推荐这样配置：

```json
{
  "name": "OpenCode Gmail",
  "type": "gmailOAuth2",
  "authMode": "oauth2",
  "env": {},
  "docs": ["Complete OAuth consent in n8n UI before activation."]
}
```

插件不会自动打开浏览器，也不会保存 OAuth client secret。它只会在 tool result 中返回 handoff action，提示用户到 n8n UI 完成授权，然后再次运行 readiness preview。

## 安全边界

不要把 API key、password、Bearer token、Slack token 或 webhook signing secret 写进 prompt 或 node parameters。validator 会阻断常见明文 secret 字段，错误详情也会递归 redaction。release 前如果发现 secret 进入 registry、preview 或 docs 示例，应视为 blocking issue。
