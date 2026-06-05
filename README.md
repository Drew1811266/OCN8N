# opencode-n8n-builder

OpenCode plugin for creating and updating managed n8n workflow drafts from natural language.

## Capabilities

- Create inactive n8n draft workflows from a prompt.
- Update only workflows previously created and marked as managed by this plugin.
- Inspect managed workflow nodes, connections, active status, and validation issues.
- List workflows managed from the current OpenCode workspace.
- Use n8n MCP for SDK guidance, node search, and node type/schema lookup.
- Use the n8n REST API for workflow and credential persistence.
- Keep plaintext secrets out of generated workflow JSON, registry files, logs, and normal tool output.

## Configuration

Add the plugin to your OpenCode config and provide n8n connection settings:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-n8n-builder"],
  "n8n": {
    "baseUrl": "https://your-instance.app.n8n.cloud/api/v1",
    "mcpUrl": "https://your-instance.app.n8n.cloud/mcp",
    "credentialEnv": {
      "slackApi": {
        "name": "OpenCode Slack",
        "type": "slackApi",
        "env": {
          "accessToken": "SLACK_BOT_TOKEN"
        }
      }
    }
  }
}
```

Required environment variables:

- `N8N_API_KEY`: n8n API key used for REST API calls.
- `N8N_BASE_URL`: n8n REST API base URL, for example `https://your-instance.app.n8n.cloud/api/v1`.
- `N8N_MCP_URL`: n8n MCP endpoint URL.

`N8N_BASE_URL` and `N8N_MCP_URL` can be set either in the environment or in OpenCode config as `n8n.baseUrl` and `n8n.mcpUrl`. `N8N_API_KEY` can also be provided as `n8n.apiKey`, but using the environment is preferred for local secret handling.

Optional config:

- `n8n.credentialEnv`: maps credential types to n8n credential names and local environment variables.
- `n8n.projectId`: default n8n project ID for future project-aware workflow creation.
- `n8n.folderId`: default n8n folder ID for future folder-aware workflow creation.

## Tools

### `n8n_build_workflow`

Creates a new inactive managed draft workflow.

Arguments:

- `prompt` (required): natural-language workflow request.
- `name` (optional): workflow name override.
- `projectId` (optional): n8n project ID.
- `folderId` (optional): n8n folder ID.

### `n8n_update_workflow`

Previews or applies an update to a managed workflow.

Arguments:

- `workflowId` (required): n8n workflow ID.
- `mode` (required): `preview` or `apply`.
- `prompt` (required in `preview` mode): requested workflow change.
- `previewId` (required in `apply` mode): preview ID returned by a prior preview.

### `n8n_inspect_workflow`

Inspects a managed workflow and returns nodes, connections, active state, and validation issues.

Arguments:

- `workflowId` (required): n8n workflow ID.

### `n8n_list_managed_workflows`

Lists workflows tracked in the current workspace registry.

Arguments: none.

## Update Safety

Updates are two-stage by default:

1. `preview` reads the current managed workflow, generates a proposed replacement, validates it, stores a short-lived preview, and returns a change summary. It does not update n8n.
2. `apply` reloads the current workflow, verifies it still matches the preview base hash, revalidates the proposed workflow, and then updates n8n.

The plugin refuses to update workflows that are not marked as managed by `opencode-n8n-builder`. This prevents accidental edits to arbitrary n8n workflows and protects changes made directly in the n8n UI from stale preview application.

## Secret Policy

Do not put API keys, OAuth secrets, passwords, bearer tokens, or webhook signing secrets in prompts or workflow parameters. The planner and validator reject common plaintext secret patterns, and credential resolution uses configured environment variables to reference or create n8n credentials without writing secret values into workflow JSON, registry files, preview files, logs, or normal OpenCode-visible output.
