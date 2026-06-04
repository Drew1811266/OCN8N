# OpenCode n8n Builder Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript OpenCode plugin that creates and updates managed inactive n8n workflow drafts from natural language using n8n MCP, n8n REST API, structured planning, validation, credential resolution, and preview/apply update safety.

**Architecture:** Keep the plugin shell thin and put core behavior in testable TypeScript modules. OpenCode tools call orchestration services; services call adapters for OpenCode structured output, n8n MCP, n8n REST API, local registry, preview cache, credential resolution, compiler, and validator.

**Tech Stack:** TypeScript ESM, Bun-compatible OpenCode plugin runtime, `@opencode-ai/plugin`, `@opencode-ai/sdk`, `zod`, Vitest, tsup, Node `fs/promises`, Web Fetch API.

---

## Source References

- Design spec: `docs/superpowers/specs/2026-06-04-opencode-n8n-plugin-design.md`
- OpenCode plugin docs: https://opencode.ai/docs/plugins/
- OpenCode custom tools docs: https://opencode.ai/docs/custom-tools/
- OpenCode SDK structured output docs: https://opencode.ai/docs/sdk/
- n8n REST API docs: https://docs.n8n.io/api/
- n8n API authentication docs: https://docs.n8n.io/api/authentication/
- n8n MCP tools reference: https://docs.n8n.io/advanced-ai/mcp/mcp_tools_reference/

Before implementation starts, re-open the OpenCode plugin docs and n8n MCP tools reference because both APIs are still evolving. Use official docs only for API-shape decisions.

## File Structure

Create this package structure:

```text
package.json
tsconfig.json
vitest.config.ts
tsup.config.ts
README.md
src/index.ts
src/plugin.ts
src/types.ts
src/errors.ts
src/config.ts
src/hash.ts
src/security.ts
src/validator.ts
src/workflow-plan.ts
src/workflow-compiler.ts
src/registry.ts
src/preview-store.ts
src/n8n-api-client.ts
src/credential-resolver.ts
src/n8n-mcp-client.ts
src/opencode-planner.ts
src/tools/build-workflow.ts
src/tools/update-workflow.ts
src/tools/inspect-workflow.ts
src/tools/list-managed-workflows.ts
tests/config.test.ts
tests/hash-security-validator.test.ts
tests/workflow-compiler.test.ts
tests/registry-preview-store.test.ts
tests/n8n-api-client.test.ts
tests/credential-resolver.test.ts
tests/n8n-mcp-client.test.ts
tests/opencode-planner.test.ts
tests/build-workflow.test.ts
tests/update-workflow.test.ts
tests/inspect-list-tools.test.ts
tests/plugin.test.ts
tests/fixtures/workflows.ts
```

Responsibilities:

- `src/plugin.ts`: returns the OpenCode plugin function and wires tool definitions.
- `src/index.ts`: public package export for npm consumers.
- `src/types.ts`: shared domain and adapter interfaces.
- `src/config.ts`: reads and validates plugin config from OpenCode config and environment.
- `src/hash.ts`: stable JSON serialization and SHA-256 hashes.
- `src/security.ts`: secret redaction, private network detection, and plaintext secret scanning.
- `src/validator.ts`: workflow validation and update ownership policy.
- `src/workflow-plan.ts`: Zod schemas used for structured output and typed workflow planning.
- `src/workflow-compiler.ts`: compiles `WorkflowPlan` into n8n workflow JSON.
- `src/registry.ts`: manages `.opencode/n8n-workflows.json`.
- `src/preview-store.ts`: manages short-lived update previews.
- `src/n8n-api-client.ts`: REST API wrapper using `X-N8N-API-KEY`.
- `src/credential-resolver.ts`: matches or creates n8n credentials without returning secret values.
- `src/n8n-mcp-client.ts`: calls n8n MCP tools for SDK reference, node search, and node type lookup.
- `src/opencode-planner.ts`: uses OpenCode SDK structured output to generate `WorkflowPlan` and `WorkflowPatchPlan`.
- `src/tools/*`: thin orchestration functions behind OpenCode custom tools.

## Implementation Tasks

### Task 1: Package Scaffold and Test Harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `tsup.config.ts`
- Create: `src/index.ts`
- Create: `src/plugin.ts`
- Create: `tests/plugin.test.ts`

- [ ] **Step 1: Write failing plugin export test**

Create `tests/plugin.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { N8nBuilderPlugin, createN8nBuilderPlugin } from "../src/index"

describe("plugin exports", () => {
  it("exports a plugin factory and default plugin function", () => {
    expect(typeof createN8nBuilderPlugin).toBe("function")
    expect(typeof N8nBuilderPlugin).toBe("function")
  })
})
```

- [ ] **Step 2: Create package files**

Create `package.json`:

```json
{
  "name": "opencode-n8n-builder",
  "version": "0.1.0",
  "description": "OpenCode plugin for creating and updating managed n8n workflow drafts.",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "README.md",
    "package.json"
  ],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "check": "npm run typecheck && npm run test && npm run build"
  },
  "dependencies": {
    "@opencode-ai/plugin": "latest",
    "@opencode-ai/sdk": "latest",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "tsup": "^8.5.0",
    "typescript": "^5.8.3",
    "vitest": "^3.2.0"
  },
  "keywords": [
    "opencode",
    "opencode-plugin",
    "n8n",
    "workflow",
    "automation"
  ],
  "license": "MIT"
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
  },
})
```

Create `tsup.config.ts`:

```ts
import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
})
```

- [ ] **Step 3: Create minimal plugin exports**

Create `src/plugin.ts`:

```ts
import type { Plugin } from "@opencode-ai/plugin"

export type N8nBuilderPluginOptions = {
  version?: string
}

export function createN8nBuilderPlugin(options: N8nBuilderPluginOptions = {}): Plugin {
  const version = options.version ?? "0.1.0"

  const plugin: Plugin = async ({ client }) => {
    await client.app.log({
      body: {
        service: "opencode-n8n-builder",
        level: "info",
        message: "Plugin initialized",
        extra: { version },
      },
    })

    return {
      tool: {},
    }
  }

  return plugin
}

export const N8nBuilderPlugin = createN8nBuilderPlugin()
```

Create `src/index.ts`:

```ts
export { N8nBuilderPlugin, createN8nBuilderPlugin } from "./plugin"
export type { N8nBuilderPluginOptions } from "./plugin"
```

- [ ] **Step 4: Run scaffold tests**

Run:

```bash
npm install
npm run test -- tests/plugin.test.ts
npm run typecheck
```

Expected:

```text
tests/plugin.test.ts ... pass
tsc exits 0
```

- [ ] **Step 5: Commit scaffold**

Run:

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts tsup.config.ts src/index.ts src/plugin.ts tests/plugin.test.ts
git commit -m "chore: scaffold opencode n8n plugin package"
```

### Task 2: Domain Types and Config Loader

**Files:**
- Create: `src/types.ts`
- Create: `src/errors.ts`
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write failing config tests**

Create `tests/config.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { loadPluginConfig } from "../src/config"

describe("loadPluginConfig", () => {
  it("loads required n8n settings from environment", () => {
    const config = loadPluginConfig({
      env: {
        N8N_BASE_URL: "https://demo.app.n8n.cloud/api/v1",
        N8N_API_KEY: "n8n_api_key",
        N8N_MCP_URL: "https://demo.app.n8n.cloud/mcp",
      },
      opencodeConfig: {},
      workspaceDir: "/tmp/project",
    })

    expect(config.baseUrl).toBe("https://demo.app.n8n.cloud/api/v1")
    expect(config.apiKey).toBe("n8n_api_key")
    expect(config.mcpUrl).toBe("https://demo.app.n8n.cloud/mcp")
    expect(config.workspaceDir).toBe("/tmp/project")
    expect(config.registryPath).toBe("/tmp/project/.opencode/n8n-workflows.json")
  })

  it("loads credential mappings from OpenCode config", () => {
    const config = loadPluginConfig({
      env: {
        N8N_BASE_URL: "https://demo.app.n8n.cloud/api/v1",
        N8N_API_KEY: "n8n_api_key",
        N8N_MCP_URL: "https://demo.app.n8n.cloud/mcp",
      },
      workspaceDir: "/tmp/project",
      opencodeConfig: {
        n8n: {
          credentialEnv: {
            slackApi: {
              name: "OpenCode Slack",
              type: "slackApi",
              env: { accessToken: "SLACK_BOT_TOKEN" },
            },
          },
        },
      },
    })

    expect(config.credentialEnv.slackApi.name).toBe("OpenCode Slack")
    expect(config.credentialEnv.slackApi.env.accessToken).toBe("SLACK_BOT_TOKEN")
  })

  it("throws a typed config error when required settings are missing", () => {
    expect(() =>
      loadPluginConfig({
        env: {},
        opencodeConfig: {},
        workspaceDir: "/tmp/project",
      }),
    ).toThrow("Missing required n8n configuration: N8N_BASE_URL, N8N_API_KEY, N8N_MCP_URL")
  })
})
```

- [ ] **Step 2: Add shared types and typed error**

Create `src/errors.ts`:

```ts
export class N8nBuilderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = "N8nBuilderError"
  }
}
```

Create `src/types.ts`:

```ts
export type Env = Record<string, string | undefined>

export type CredentialEnvMapping = {
  name: string
  type: string
  env: Record<string, string>
}

export type PluginConfig = {
  baseUrl: string
  apiKey: string
  mcpUrl: string
  workspaceDir: string
  registryPath: string
  previewDir: string
  credentialEnv: Record<string, CredentialEnvMapping>
  defaultProjectId?: string
  defaultFolderId?: string
  pluginVersion: string
}

export type Warning = {
  code: string
  message: string
  nodeName?: string
}

export type CredentialGap = {
  nodeName: string
  credentialType: string
  credentialName?: string
  reason: string
}

export type ManagedMarker = {
  managedBy: "opencode-n8n-builder"
  managedByVersion: string
  createdAt: string
  workspaceId?: string
}
```

- [ ] **Step 3: Implement config loader**

Create `src/config.ts`:

```ts
import path from "node:path"
import { N8nBuilderError } from "./errors"
import type { CredentialEnvMapping, Env, PluginConfig } from "./types"

type LoadPluginConfigInput = {
  env: Env
  opencodeConfig: unknown
  workspaceDir: string
  pluginVersion?: string
}

type OpencodeN8nConfig = {
  n8n?: {
    baseUrl?: string
    apiKey?: string
    mcpUrl?: string
    credentialEnv?: Record<string, CredentialEnvMapping>
    projectId?: string
    folderId?: string
  }
}

function asOpencodeN8nConfig(value: unknown): OpencodeN8nConfig {
  if (!value || typeof value !== "object") return {}
  return value as OpencodeN8nConfig
}

export function loadPluginConfig(input: LoadPluginConfigInput): PluginConfig {
  const opencode = asOpencodeN8nConfig(input.opencodeConfig)
  const n8n = opencode.n8n ?? {}

  const baseUrl = n8n.baseUrl ?? input.env.N8N_BASE_URL
  const apiKey = n8n.apiKey ?? input.env.N8N_API_KEY
  const mcpUrl = n8n.mcpUrl ?? input.env.N8N_MCP_URL

  const missing = [
    ["N8N_BASE_URL", baseUrl],
    ["N8N_API_KEY", apiKey],
    ["N8N_MCP_URL", mcpUrl],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (missing.length > 0) {
    throw new N8nBuilderError(
      `Missing required n8n configuration: ${missing.join(", ")}`,
      "CONFIG_MISSING",
      { missing },
    )
  }

  return {
    baseUrl: baseUrl as string,
    apiKey: apiKey as string,
    mcpUrl: mcpUrl as string,
    workspaceDir: input.workspaceDir,
    registryPath: path.join(input.workspaceDir, ".opencode", "n8n-workflows.json"),
    previewDir: path.join(input.workspaceDir, ".opencode", "n8n-update-previews"),
    credentialEnv: n8n.credentialEnv ?? {},
    defaultProjectId: n8n.projectId,
    defaultFolderId: n8n.folderId,
    pluginVersion: input.pluginVersion ?? "0.1.0",
  }
}
```

- [ ] **Step 4: Run config tests**

Run:

```bash
npm run test -- tests/config.test.ts
npm run typecheck
```

Expected:

```text
tests/config.test.ts ... pass
tsc exits 0
```

- [ ] **Step 5: Commit config module**

Run:

```bash
git add src/types.ts src/errors.ts src/config.ts tests/config.test.ts
git commit -m "feat: load n8n plugin configuration"
```

### Task 3: Hashing, Security Scanning, and Workflow Validator

**Files:**
- Create: `src/hash.ts`
- Create: `src/security.ts`
- Create: `src/validator.ts`
- Create: `tests/hash-security-validator.test.ts`

- [ ] **Step 1: Write failing hashing, security, and validation tests**

Create `tests/hash-security-validator.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { stableHash, stableStringify } from "../src/hash"
import { containsPlaintextSecret, isPrivateNetworkUrl } from "../src/security"
import { validateWorkflowForSave } from "../src/validator"

describe("stable hashing", () => {
  it("hashes objects independent of key order", () => {
    const left = stableHash({ b: 2, a: 1 })
    const right = stableHash({ a: 1, b: 2 })

    expect(left).toBe(right)
    expect(stableStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}')
  })
})

describe("security checks", () => {
  it("detects common secret-looking node parameter keys", () => {
    expect(containsPlaintextSecret({ token: "abc123" })).toBe(true)
    expect(containsPlaintextSecret({ nested: { clientSecret: "abc123" } })).toBe(true)
    expect(containsPlaintextSecret({ url: "https://example.com" })).toBe(false)
  })

  it("detects private network HTTP targets", () => {
    expect(isPrivateNetworkUrl("http://127.0.0.1:5678")).toBe(true)
    expect(isPrivateNetworkUrl("http://10.1.2.3/internal")).toBe(true)
    expect(isPrivateNetworkUrl("https://api.example.com")).toBe(false)
  })
})

describe("validateWorkflowForSave", () => {
  it("rejects duplicate node names and missing connection targets", () => {
    const result = validateWorkflowForSave({
      workflow: {
        name: "Broken",
        active: false,
        nodes: [
          { id: "1", name: "Start", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [0, 0], parameters: {} },
          { id: "2", name: "Start", type: "n8n-nodes-base.set", typeVersion: 3, position: [300, 0], parameters: {} },
        ],
        connections: {
          Start: {
            main: [[{ node: "Missing", type: "main", index: 0 }]],
          },
        },
        settings: {},
        tags: [],
      },
      requireManagedMarker: false,
    })

    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain("DUPLICATE_NODE_NAME")
    expect(result.issues.map((issue) => issue.code)).toContain("MISSING_CONNECTION_TARGET")
  })

  it("rejects plaintext secrets in node parameters", () => {
    const result = validateWorkflowForSave({
      workflow: {
        name: "Secret",
        active: false,
        nodes: [
          { id: "1", name: "HTTP", type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [0, 0], parameters: { token: "abc123" } },
        ],
        connections: {},
        settings: {},
        tags: [],
      },
      requireManagedMarker: false,
    })

    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain("PLAINTEXT_SECRET")
  })
})
```

- [ ] **Step 2: Implement stable hashing**

Create `src/hash.ts`:

```ts
import { createHash } from "node:crypto"

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex")
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (!value || typeof value !== "object") return value

  const record = value as Record<string, unknown>
  return Object.keys(record)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortValue(record[key])
      return acc
    }, {})
}
```

- [ ] **Step 3: Implement security helpers**

Create `src/security.ts`:

```ts
const SECRET_KEY_PATTERN = /(api[-_]?key|token|password|secret|clientSecret|accessToken|refreshToken)/i

export function containsPlaintextSecret(value: unknown): boolean {
  return scanValue(value, "")
}

function scanValue(value: unknown, keyPath: string): boolean {
  if (SECRET_KEY_PATTERN.test(keyPath) && typeof value === "string" && value.trim().length > 0) {
    return true
  }

  if (Array.isArray(value)) {
    return value.some((item, index) => scanValue(item, `${keyPath}[${index}]`))
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
      const nextPath = keyPath ? `${keyPath}.${key}` : key
      return scanValue(child, nextPath)
    })
  }

  return false
}

export function isPrivateNetworkUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    const host = url.hostname.toLowerCase()
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    )
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Implement workflow validator**

Create `src/validator.ts`:

```ts
import { containsPlaintextSecret, isPrivateNetworkUrl } from "./security"

export type N8nWorkflowNode = {
  id?: string
  name: string
  type: string
  typeVersion: number
  position: [number, number]
  parameters: Record<string, unknown>
  credentials?: Record<string, { id?: string; name?: string }>
}

export type N8nWorkflow = {
  id?: string
  name: string
  active: boolean
  nodes: N8nWorkflowNode[]
  connections: Record<string, Record<string, Array<Array<{ node: string; type: string; index: number }>>>>
  settings: Record<string, unknown>
  tags?: Array<{ name: string } | string>
  meta?: Record<string, unknown>
}

export type WorkflowIssue = {
  code: string
  message: string
  nodeName?: string
}

export type ValidationResult = {
  valid: boolean
  issues: WorkflowIssue[]
  warnings: WorkflowIssue[]
}

export function validateWorkflowForSave(input: {
  workflow: N8nWorkflow
  requireManagedMarker: boolean
  allowActiveUpdate?: boolean
}): ValidationResult {
  const issues: WorkflowIssue[] = []
  const warnings: WorkflowIssue[] = []
  const nodeNames = new Set<string>()
  const duplicateNames = new Set<string>()

  for (const node of input.workflow.nodes) {
    if (nodeNames.has(node.name)) duplicateNames.add(node.name)
    nodeNames.add(node.name)

    if (containsPlaintextSecret(node.parameters)) {
      issues.push({
        code: "PLAINTEXT_SECRET",
        message: `Node ${node.name} contains a secret-looking parameter value.`,
        nodeName: node.name,
      })
    }

    const url = typeof node.parameters.url === "string" ? node.parameters.url : undefined
    if (url && isPrivateNetworkUrl(url)) {
      warnings.push({
        code: "PRIVATE_NETWORK_HTTP_TARGET",
        message: `Node ${node.name} points at a private network URL.`,
        nodeName: node.name,
      })
    }
  }

  for (const name of duplicateNames) {
    issues.push({
      code: "DUPLICATE_NODE_NAME",
      message: `Workflow contains duplicate node name ${name}.`,
      nodeName: name,
    })
  }

  for (const [sourceName, byOutput] of Object.entries(input.workflow.connections)) {
    if (!nodeNames.has(sourceName)) {
      issues.push({
        code: "MISSING_CONNECTION_SOURCE",
        message: `Connection source ${sourceName} does not exist.`,
        nodeName: sourceName,
      })
    }

    for (const outputGroups of Object.values(byOutput)) {
      for (const group of outputGroups) {
        for (const connection of group) {
          if (!nodeNames.has(connection.node)) {
            issues.push({
              code: "MISSING_CONNECTION_TARGET",
              message: `Connection target ${connection.node} does not exist.`,
              nodeName: connection.node,
            })
          }
        }
      }
    }
  }

  if (input.requireManagedMarker && !isManagedWorkflow(input.workflow)) {
    issues.push({
      code: "UNMANAGED_WORKFLOW",
      message: "Workflow is not marked as managed by opencode-n8n-builder.",
    })
  }

  if (input.workflow.active && !input.allowActiveUpdate) {
    issues.push({
      code: "ACTIVE_WORKFLOW_BLOCKED",
      message: "Active managed workflows are blocked from v1 updates.",
    })
  }

  return { valid: issues.length === 0, issues, warnings }
}

export function isManagedWorkflow(workflow: N8nWorkflow): boolean {
  if (workflow.meta?.managedBy === "opencode-n8n-builder") return true
  return (workflow.tags ?? []).some((tag) => {
    const name = typeof tag === "string" ? tag : tag.name
    return name === "opencode-n8n-builder"
  })
}
```

- [ ] **Step 5: Run validation tests**

Run:

```bash
npm run test -- tests/hash-security-validator.test.ts
npm run typecheck
```

Expected:

```text
tests/hash-security-validator.test.ts ... pass
tsc exits 0
```

- [ ] **Step 6: Commit validation module**

Run:

```bash
git add src/hash.ts src/security.ts src/validator.ts tests/hash-security-validator.test.ts
git commit -m "feat: validate n8n workflows before saving"
```

### Task 4: Workflow Plan Schema and Compiler

**Files:**
- Create: `src/workflow-plan.ts`
- Create: `src/workflow-compiler.ts`
- Create: `tests/workflow-compiler.test.ts`
- Create: `tests/fixtures/workflows.ts`

- [ ] **Step 1: Write failing compiler tests**

Create `tests/fixtures/workflows.ts`:

```ts
import type { WorkflowPlan } from "../../src/workflow-plan"

export const simpleWebhookPlan: WorkflowPlan = {
  name: "Order webhook to Slack",
  summary: "Receive order webhooks and alert Slack.",
  nodes: [
    {
      key: "webhook",
      name: "Receive Order",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 0],
      parameters: { path: "orders", httpMethod: "POST", responseMode: "responseNode" },
    },
    {
      key: "slack",
      name: "Send Slack Alert",
      type: "n8n-nodes-base.slack",
      typeVersion: 2,
      position: [320, 0],
      parameters: { resource: "message", operation: "post", channel: "#orders", text: "New order received" },
      credential: { type: "slackApi", name: "OpenCode Slack" },
    },
  ],
  connections: [
    { from: "webhook", to: "slack" },
  ],
}
```

Create `tests/workflow-compiler.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { compileWorkflowPlan } from "../src/workflow-compiler"
import { simpleWebhookPlan } from "./fixtures/workflows"

describe("compileWorkflowPlan", () => {
  it("compiles a workflow plan into n8n workflow JSON with marker metadata", () => {
    const workflow = compileWorkflowPlan({
      plan: simpleWebhookPlan,
      marker: {
        managedBy: "opencode-n8n-builder",
        managedByVersion: "0.1.0",
        createdAt: "2026-06-04T00:00:00.000Z",
        workspaceId: "test-workspace",
      },
    })

    expect(workflow.name).toBe("Order webhook to Slack")
    expect(workflow.active).toBe(false)
    expect(workflow.nodes.map((node) => node.name)).toEqual(["Receive Order", "Send Slack Alert"])
    expect(workflow.connections["Receive Order"].main[0][0].node).toBe("Send Slack Alert")
    expect(workflow.tags).toEqual([{ name: "opencode-n8n-builder" }])
    expect(workflow.meta?.managedBy).toBe("opencode-n8n-builder")
    expect(workflow.nodes[1].credentials?.slackApi.name).toBe("OpenCode Slack")
  })
})
```

- [ ] **Step 2: Define workflow plan schema**

Create `src/workflow-plan.ts`:

```ts
import { z } from "zod"

export const workflowPlanSchema = z.object({
  name: z.string().min(1),
  summary: z.string().min(1),
  nodes: z.array(
    z.object({
      key: z.string().min(1),
      name: z.string().min(1),
      type: z.string().min(1),
      typeVersion: z.number().positive(),
      position: z.tuple([z.number(), z.number()]),
      parameters: z.record(z.unknown()).default({}),
      credential: z
        .object({
          type: z.string().min(1),
          name: z.string().min(1),
        })
        .optional(),
    }),
  ),
  connections: z.array(
    z.object({
      from: z.string().min(1),
      to: z.string().min(1),
      output: z.string().default("main"),
      input: z.string().default("main"),
      outputIndex: z.number().int().nonnegative().default(0),
      inputIndex: z.number().int().nonnegative().default(0),
    }),
  ),
})

export type WorkflowPlan = z.infer<typeof workflowPlanSchema>

export const workflowPatchPlanSchema = z.object({
  summary: z.string().min(1),
  changes: z.array(z.string().min(1)),
  replacementPlan: workflowPlanSchema,
})

export type WorkflowPatchPlan = z.infer<typeof workflowPatchPlanSchema>
```

- [ ] **Step 3: Implement compiler**

Create `src/workflow-compiler.ts`:

```ts
import type { ManagedMarker } from "./types"
import type { N8nWorkflow } from "./validator"
import type { WorkflowPlan } from "./workflow-plan"

type CompileWorkflowPlanInput = {
  plan: WorkflowPlan
  marker: ManagedMarker
}

export function compileWorkflowPlan(input: CompileWorkflowPlanInput): N8nWorkflow {
  const keyToName = new Map(input.plan.nodes.map((node) => [node.key, node.name]))

  const nodes = input.plan.nodes.map((node, index) => ({
    id: `${index + 1}`,
    name: node.name,
    type: node.type,
    typeVersion: node.typeVersion,
    position: node.position,
    parameters: node.parameters,
    credentials: node.credential
      ? {
          [node.credential.type]: {
            name: node.credential.name,
          },
        }
      : undefined,
  }))

  const connections: N8nWorkflow["connections"] = {}

  for (const connection of input.plan.connections) {
    const fromName = keyToName.get(connection.from) ?? connection.from
    const toName = keyToName.get(connection.to) ?? connection.to
    const outputType = connection.output ?? "main"
    const outputIndex = connection.outputIndex ?? 0

    connections[fromName] ??= {}
    connections[fromName][outputType] ??= []
    connections[fromName][outputType][outputIndex] ??= []
    connections[fromName][outputType][outputIndex].push({
      node: toName,
      type: connection.input ?? "main",
      index: connection.inputIndex ?? 0,
    })
  }

  return {
    name: input.plan.name,
    active: false,
    nodes,
    connections,
    settings: {},
    tags: [{ name: "opencode-n8n-builder" }],
    meta: input.marker,
  }
}
```

- [ ] **Step 4: Run compiler tests**

Run:

```bash
npm run test -- tests/workflow-compiler.test.ts
npm run typecheck
```

Expected:

```text
tests/workflow-compiler.test.ts ... pass
tsc exits 0
```

- [ ] **Step 5: Commit compiler**

Run:

```bash
git add src/workflow-plan.ts src/workflow-compiler.ts tests/workflow-compiler.test.ts tests/fixtures/workflows.ts
git commit -m "feat: compile workflow plans to n8n json"
```

### Task 5: Registry and Preview Store

**Files:**
- Create: `src/registry.ts`
- Create: `src/preview-store.ts`
- Create: `tests/registry-preview-store.test.ts`

- [ ] **Step 1: Write failing storage tests**

Create `tests/registry-preview-store.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { WorkflowRegistry } from "../src/registry"
import { PreviewStore } from "../src/preview-store"
import { simpleWebhookPlan } from "./fixtures/workflows"

let dir = ""

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "opencode-n8n-"))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("WorkflowRegistry", () => {
  it("saves and lists managed workflow records", async () => {
    const registry = new WorkflowRegistry(path.join(dir, ".opencode", "n8n-workflows.json"))

    await registry.upsert({
      workflowId: "wf_1",
      name: "Orders",
      url: "https://demo/workflow/wf_1",
      baseUrl: "https://demo/api/v1",
      managedBy: "opencode-n8n-builder",
      managedByVersion: "0.1.0",
      lastPlanHash: "abc",
      lastUpdatedAt: "2026-06-04T00:00:00.000Z",
    })

    expect(await registry.get("wf_1")).toMatchObject({ workflowId: "wf_1", name: "Orders" })
    expect(await registry.list()).toHaveLength(1)
  })
})

describe("PreviewStore", () => {
  it("stores and retrieves a non-expired preview", async () => {
    const store = new PreviewStore(path.join(dir, ".opencode", "n8n-update-previews"))
    const preview = await store.save({
      workflowId: "wf_1",
      baseWorkflowHash: "base",
      proposedWorkflowHash: "proposed",
      summary: "Add Slack node",
      changes: ["Add Slack node"],
      proposedWorkflow: { name: simpleWebhookPlan.name, active: false, nodes: [], connections: {}, settings: {} },
      createdAt: "2026-06-04T00:00:00.000Z",
      expiresAt: "2026-06-04T00:30:00.000Z",
    })

    const loaded = await store.get(preview.previewId, new Date("2026-06-04T00:10:00.000Z"))
    expect(loaded?.summary).toBe("Add Slack node")
  })
})
```

- [ ] **Step 2: Implement registry**

Create `src/registry.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

export type WorkflowRegistryRecord = {
  workflowId: string
  name: string
  url: string
  baseUrl: string
  managedBy: "opencode-n8n-builder"
  managedByVersion: string
  lastPlanHash: string
  lastUpdatedAt: string
}

type RegistryFile = {
  workflows: WorkflowRegistryRecord[]
}

export class WorkflowRegistry {
  constructor(private readonly filePath: string) {}

  async list(): Promise<WorkflowRegistryRecord[]> {
    return (await this.read()).workflows
  }

  async get(workflowId: string): Promise<WorkflowRegistryRecord | undefined> {
    return (await this.list()).find((record) => record.workflowId === workflowId)
  }

  async upsert(record: WorkflowRegistryRecord): Promise<void> {
    const file = await this.read()
    const next = file.workflows.filter((item) => item.workflowId !== record.workflowId)
    next.push(record)
    await this.write({ workflows: next.sort((a, b) => a.name.localeCompare(b.name)) })
  }

  private async read(): Promise<RegistryFile> {
    try {
      const raw = await readFile(this.filePath, "utf8")
      const parsed = JSON.parse(raw) as RegistryFile
      return { workflows: Array.isArray(parsed.workflows) ? parsed.workflows : [] }
    } catch {
      return { workflows: [] }
    }
  }

  private async write(file: RegistryFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`, "utf8")
  }
}
```

- [ ] **Step 3: Implement preview store**

Create `src/preview-store.ts`:

```ts
import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { N8nWorkflow } from "./validator"

export type UpdatePreview = {
  previewId: string
  workflowId: string
  baseWorkflowHash: string
  proposedWorkflowHash: string
  summary: string
  changes: string[]
  proposedWorkflow: N8nWorkflow
  createdAt: string
  expiresAt: string
}

export type SaveUpdatePreviewInput = Omit<UpdatePreview, "previewId">

export class PreviewStore {
  constructor(private readonly directory: string) {}

  async save(input: SaveUpdatePreviewInput): Promise<UpdatePreview> {
    const preview: UpdatePreview = { previewId: randomUUID(), ...input }
    await mkdir(this.directory, { recursive: true })
    await writeFile(this.filePath(preview.previewId), `${JSON.stringify(preview, null, 2)}\n`, "utf8")
    return preview
  }

  async get(previewId: string, now = new Date()): Promise<UpdatePreview | undefined> {
    try {
      const raw = await readFile(this.filePath(previewId), "utf8")
      const preview = JSON.parse(raw) as UpdatePreview
      if (new Date(preview.expiresAt).getTime() <= now.getTime()) return undefined
      return preview
    } catch {
      return undefined
    }
  }

  private filePath(previewId: string): string {
    return path.join(this.directory, `${previewId}.json`)
  }
}
```

- [ ] **Step 4: Run storage tests**

Run:

```bash
npm run test -- tests/registry-preview-store.test.ts
npm run typecheck
```

Expected:

```text
tests/registry-preview-store.test.ts ... pass
tsc exits 0
```

- [ ] **Step 5: Commit storage modules**

Run:

```bash
git add src/registry.ts src/preview-store.ts tests/registry-preview-store.test.ts
git commit -m "feat: store managed workflows and update previews"
```

### Task 6: n8n REST API Client and Credential Resolver

**Files:**
- Create: `src/n8n-api-client.ts`
- Create: `src/credential-resolver.ts`
- Create: `tests/n8n-api-client.test.ts`
- Create: `tests/credential-resolver.test.ts`

- [ ] **Step 1: Write failing API client tests**

Create `tests/n8n-api-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { N8nApiClient } from "../src/n8n-api-client"

describe("N8nApiClient", () => {
  it("creates workflows with X-N8N-API-KEY", async () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: "wf_1", name: "Orders", active: false }), { status: 200 }),
    )
    const client = new N8nApiClient({ baseUrl: "https://demo/api/v1", apiKey: "secret", fetch })

    const result = await client.createWorkflow({ name: "Orders", active: false, nodes: [], connections: {}, settings: {} })

    expect(result.id).toBe("wf_1")
    expect(fetch).toHaveBeenCalledWith(
      "https://demo/api/v1/workflows",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-N8N-API-KEY": "secret" }),
      }),
    )
  })
})
```

Create `tests/credential-resolver.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { CredentialResolver } from "../src/credential-resolver"

describe("CredentialResolver", () => {
  it("reuses an existing named credential", async () => {
    const api = {
      listCredentials: vi.fn(async () => [{ id: "cred_1", name: "OpenCode Slack", type: "slackApi" }]),
      createCredential: vi.fn(),
    }
    const resolver = new CredentialResolver({
      api,
      env: {},
      credentialEnv: {
        slackApi: { name: "OpenCode Slack", type: "slackApi", env: { accessToken: "SLACK_BOT_TOKEN" } },
      },
    })

    const result = await resolver.resolve({ nodeName: "Slack", credentialType: "slackApi" })

    expect(result.reference).toEqual({ id: "cred_1", name: "OpenCode Slack" })
    expect(api.createCredential).not.toHaveBeenCalled()
  })

  it("reports a credential gap when required environment variables are missing", async () => {
    const api = {
      listCredentials: vi.fn(async () => []),
      createCredential: vi.fn(),
    }
    const resolver = new CredentialResolver({
      api,
      env: {},
      credentialEnv: {
        slackApi: { name: "OpenCode Slack", type: "slackApi", env: { accessToken: "SLACK_BOT_TOKEN" } },
      },
    })

    const result = await resolver.resolve({ nodeName: "Slack", credentialType: "slackApi" })

    expect(result.gap?.credentialType).toBe("slackApi")
    expect(api.createCredential).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Implement n8n API client**

Create `src/n8n-api-client.ts`:

```ts
import { N8nBuilderError } from "./errors"
import type { N8nWorkflow } from "./validator"

type FetchLike = typeof fetch

export type N8nCredentialSummary = {
  id: string
  name: string
  type: string
}

export class N8nApiClient {
  constructor(
    private readonly options: {
      baseUrl: string
      apiKey: string
      fetch?: FetchLike
    },
  ) {}

  async createWorkflow(workflow: N8nWorkflow): Promise<N8nWorkflow & { id: string }> {
    return this.request<N8nWorkflow & { id: string }>("/workflows", {
      method: "POST",
      body: JSON.stringify(workflow),
    })
  }

  async updateWorkflow(workflowId: string, workflow: N8nWorkflow): Promise<N8nWorkflow & { id: string }> {
    return this.request<N8nWorkflow & { id: string }>(`/workflows/${encodeURIComponent(workflowId)}`, {
      method: "PUT",
      body: JSON.stringify(workflow),
    })
  }

  async getWorkflow(workflowId: string): Promise<N8nWorkflow & { id: string }> {
    return this.request<N8nWorkflow & { id: string }>(`/workflows/${encodeURIComponent(workflowId)}`, {
      method: "GET",
    })
  }

  async listCredentials(): Promise<N8nCredentialSummary[]> {
    const response = await this.request<{ data?: N8nCredentialSummary[] } | N8nCredentialSummary[]>("/credentials", {
      method: "GET",
    })
    return Array.isArray(response) ? response : response.data ?? []
  }

  async createCredential(input: { name: string; type: string; data: Record<string, string> }): Promise<N8nCredentialSummary> {
    return this.request<N8nCredentialSummary>("/credentials", {
      method: "POST",
      body: JSON.stringify(input),
    })
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const fetchImpl = this.options.fetch ?? fetch
    const response = await fetchImpl(`${this.options.baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "X-N8N-API-KEY": this.options.apiKey,
        ...(init.headers ?? {}),
      },
    })

    if (!response.ok) {
      throw new N8nBuilderError(`n8n API request failed with status ${response.status}`, "N8N_API_ERROR", {
        status: response.status,
        path,
      })
    }

    return (await response.json()) as T
  }
}
```

- [ ] **Step 3: Implement credential resolver**

Create `src/credential-resolver.ts`:

```ts
import type { CredentialEnvMapping, CredentialGap, Env } from "./types"
import type { N8nCredentialSummary } from "./n8n-api-client"

type CredentialApi = {
  listCredentials(): Promise<N8nCredentialSummary[]>
  createCredential(input: { name: string; type: string; data: Record<string, string> }): Promise<N8nCredentialSummary>
}

export type ResolveCredentialInput = {
  nodeName: string
  credentialType: string
}

export type ResolveCredentialResult = {
  reference?: { id?: string; name: string }
  gap?: CredentialGap
}

export class CredentialResolver {
  constructor(
    private readonly options: {
      api: CredentialApi
      env: Env
      credentialEnv: Record<string, CredentialEnvMapping>
    },
  ) {}

  async resolve(input: ResolveCredentialInput): Promise<ResolveCredentialResult> {
    const mapping = this.options.credentialEnv[input.credentialType]
    const expectedName = mapping?.name
    const credentials = await this.options.api.listCredentials()
    const existing = credentials.find((credential) => {
      return credential.type === input.credentialType && (!expectedName || credential.name === expectedName)
    })

    if (existing) {
      return { reference: { id: existing.id, name: existing.name } }
    }

    if (!mapping) {
      return {
        gap: {
          nodeName: input.nodeName,
          credentialType: input.credentialType,
          reason: "No credential mapping configured for this credential type.",
        },
      }
    }

    const data: Record<string, string> = {}
    const missing: string[] = []

    for (const [field, envName] of Object.entries(mapping.env)) {
      const value = this.options.env[envName]
      if (!value) missing.push(envName)
      else data[field] = value
    }

    if (missing.length > 0) {
      return {
        gap: {
          nodeName: input.nodeName,
          credentialType: input.credentialType,
          credentialName: mapping.name,
          reason: `Missing environment variables: ${missing.join(", ")}`,
        },
      }
    }

    const created = await this.options.api.createCredential({
      name: mapping.name,
      type: mapping.type,
      data,
    })

    return { reference: { id: created.id, name: created.name } }
  }
}
```

- [ ] **Step 4: Run API and credential tests**

Run:

```bash
npm run test -- tests/n8n-api-client.test.ts tests/credential-resolver.test.ts
npm run typecheck
```

Expected:

```text
tests/n8n-api-client.test.ts ... pass
tests/credential-resolver.test.ts ... pass
tsc exits 0
```

- [ ] **Step 5: Commit API and credential modules**

Run:

```bash
git add src/n8n-api-client.ts src/credential-resolver.ts tests/n8n-api-client.test.ts tests/credential-resolver.test.ts
git commit -m "feat: call n8n api and resolve credentials"
```

### Task 7: n8n MCP Client and OpenCode Structured Planner

**Files:**
- Create: `src/n8n-mcp-client.ts`
- Create: `src/opencode-planner.ts`
- Create: `tests/n8n-mcp-client.test.ts`
- Create: `tests/opencode-planner.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Create `tests/n8n-mcp-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { N8nMcpClient } from "../src/n8n-mcp-client"

describe("N8nMcpClient", () => {
  it("calls MCP tools through JSON-RPC", async () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: "1", result: { content: [{ type: "text", text: "SDK docs" }] } }), {
        status: 200,
      }),
    )
    const client = new N8nMcpClient({ mcpUrl: "https://demo/mcp", fetch })

    const reference = await client.getSdkReference("rules")

    expect(reference).toBe("SDK docs")
    expect(fetch).toHaveBeenCalledWith(
      "https://demo/mcp",
      expect.objectContaining({ method: "POST" }),
    )
  })
})
```

Create `tests/opencode-planner.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { OpencodePlanner } from "../src/opencode-planner"
import { simpleWebhookPlan } from "./fixtures/workflows"

describe("OpencodePlanner", () => {
  it("requests structured workflow plan output", async () => {
    const client = {
      session: {
        create: vi.fn(async () => ({ id: "session_1" })),
        prompt: vi.fn(async () => ({
          data: {
            info: {
              structured_output: simpleWebhookPlan,
            },
          },
        })),
      },
    }

    const planner = new OpencodePlanner({ client })
    const plan = await planner.createPlan({
      prompt: "Build an order webhook",
      sdkReference: "Use n8n workflow rules",
      nodeDocumentation: [{ nodeType: "n8n-nodes-base.webhook", documentation: "Webhook docs" }],
    })

    expect(plan.name).toBe(simpleWebhookPlan.name)
    expect(client.session.prompt).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Implement n8n MCP client**

Create `src/n8n-mcp-client.ts`:

```ts
import { N8nBuilderError } from "./errors"

type FetchLike = typeof fetch

type McpContent = {
  type: string
  text?: string
}

type McpResponse = {
  result?: {
    content?: McpContent[]
    [key: string]: unknown
  }
  error?: {
    message: string
  }
}

export class N8nMcpClient {
  private requestId = 0

  constructor(private readonly options: { mcpUrl: string; fetch?: FetchLike }) {}

  async getSdkReference(section: string): Promise<string> {
    return this.callTextTool("get_sdk_reference", { section })
  }

  async searchNodes(query: string): Promise<string> {
    return this.callTextTool("search_nodes", { query })
  }

  async getNodeTypes(nodeTypes: string[]): Promise<string> {
    return this.callTextTool("get_node_types", { nodeTypes })
  }

  private async callTextTool(name: string, argumentsValue: Record<string, unknown>): Promise<string> {
    const response = await this.call({
      method: "tools/call",
      params: {
        name,
        arguments: argumentsValue,
      },
    })

    const text = response.result?.content
      ?.map((item) => item.text)
      .filter((value): value is string => typeof value === "string")
      .join("\n")

    if (!text) {
      throw new N8nBuilderError(`n8n MCP tool ${name} returned no text content`, "N8N_MCP_EMPTY", { name })
    }

    return text
  }

  private async call(payload: { method: string; params: Record<string, unknown> }): Promise<McpResponse> {
    const fetchImpl = this.options.fetch ?? fetch
    const response = await fetchImpl(this.options.mcpUrl, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: String(++this.requestId),
        ...payload,
      }),
    })

    if (!response.ok) {
      throw new N8nBuilderError(`n8n MCP request failed with status ${response.status}`, "N8N_MCP_HTTP_ERROR", {
        status: response.status,
      })
    }

    const data = (await response.json()) as McpResponse
    if (data.error) {
      throw new N8nBuilderError(data.error.message, "N8N_MCP_TOOL_ERROR", { method: payload.method })
    }

    return data
  }
}
```

- [ ] **Step 3: Implement OpenCode structured planner**

Create `src/opencode-planner.ts`:

```ts
import { N8nBuilderError } from "./errors"
import { workflowPatchPlanSchema, workflowPlanSchema, type WorkflowPatchPlan, type WorkflowPlan } from "./workflow-plan"

type OpencodeClientLike = {
  session: {
    create(input: { body: { title: string } }): Promise<{ id: string }>
    prompt(input: {
      path: { id: string }
      body: {
        parts: Array<{ type: "text"; text: string }>
        format: {
          type: "json_schema"
          schema: Record<string, unknown>
          retryCount?: number
        }
      }
    }): Promise<{ data?: { info?: { structured_output?: unknown; error?: { name?: string; message?: string } } } }>
  }
}

type PlannerContext = {
  prompt: string
  sdkReference: string
  nodeDocumentation: Array<{ nodeType: string; documentation: string }>
}

export class OpencodePlanner {
  constructor(private readonly options: { client: OpencodeClientLike }) {}

  async createPlan(context: PlannerContext): Promise<WorkflowPlan> {
    const output = await this.promptStructured({
      title: "n8n workflow planning",
      text: this.buildCreatePrompt(context),
      schema: workflowPlanJsonSchema,
    })
    return workflowPlanSchema.parse(output)
  }

  async createPatchPlan(context: PlannerContext & { currentWorkflowJson: string }): Promise<WorkflowPatchPlan> {
    const output = await this.promptStructured({
      title: "n8n workflow update planning",
      text: this.buildPatchPrompt(context),
      schema: workflowPatchPlanJsonSchema,
    })
    return workflowPatchPlanSchema.parse(output)
  }

  private async promptStructured(input: { title: string; text: string; schema: Record<string, unknown> }): Promise<unknown> {
    const session = await this.options.client.session.create({ body: { title: input.title } })
    const result = await this.options.client.session.prompt({
      path: { id: session.id },
      body: {
        parts: [{ type: "text", text: input.text }],
        format: {
          type: "json_schema",
          schema: input.schema,
          retryCount: 2,
        },
      },
    })

    const info = result.data?.info
    if (info?.error) {
      throw new N8nBuilderError(info.error.message ?? "OpenCode structured planning failed", "OPENCODE_PLANNER_ERROR")
    }

    if (!info?.structured_output) {
      throw new N8nBuilderError("OpenCode structured planning returned no structured output", "OPENCODE_PLANNER_EMPTY")
    }

    return info.structured_output
  }

  private buildCreatePrompt(context: PlannerContext): string {
    return [
      "Create an n8n WorkflowPlan from the user request.",
      "Use only node types supported by the provided n8n MCP documentation.",
      "Do not include secret values in parameters.",
      "",
      `User request:\n${context.prompt}`,
      "",
      `SDK reference:\n${context.sdkReference}`,
      "",
      `Node documentation:\n${JSON.stringify(context.nodeDocumentation, null, 2)}`,
    ].join("\n")
  }

  private buildPatchPrompt(context: PlannerContext & { currentWorkflowJson: string }): string {
    return [
      "Create a full replacement WorkflowPatchPlan for a managed n8n workflow.",
      "Preserve existing behavior unless the user request changes it.",
      "Do not include secret values in parameters.",
      "",
      `User request:\n${context.prompt}`,
      "",
      `Current workflow JSON:\n${context.currentWorkflowJson}`,
      "",
      `SDK reference:\n${context.sdkReference}`,
      "",
      `Node documentation:\n${JSON.stringify(context.nodeDocumentation, null, 2)}`,
    ].join("\n")
  }
}

const planNodeSchema = {
  type: "object",
  properties: {
    key: { type: "string" },
    name: { type: "string" },
    type: { type: "string" },
    typeVersion: { type: "number" },
    position: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
    parameters: { type: "object" },
    credential: {
      type: "object",
      properties: {
        type: { type: "string" },
        name: { type: "string" },
      },
      required: ["type", "name"],
    },
  },
  required: ["key", "name", "type", "typeVersion", "position", "parameters"],
}

const workflowPlanJsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    summary: { type: "string" },
    nodes: { type: "array", items: planNodeSchema },
    connections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          output: { type: "string" },
          input: { type: "string" },
          outputIndex: { type: "number" },
          inputIndex: { type: "number" },
        },
        required: ["from", "to"],
      },
    },
  },
  required: ["name", "summary", "nodes", "connections"],
}

const workflowPatchPlanJsonSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    changes: { type: "array", items: { type: "string" } },
    replacementPlan: workflowPlanJsonSchema,
  },
  required: ["summary", "changes", "replacementPlan"],
}
```

- [ ] **Step 4: Run adapter tests**

Run:

```bash
npm run test -- tests/n8n-mcp-client.test.ts tests/opencode-planner.test.ts
npm run typecheck
```

Expected:

```text
tests/n8n-mcp-client.test.ts ... pass
tests/opencode-planner.test.ts ... pass
tsc exits 0
```

- [ ] **Step 5: Commit planner adapters**

Run:

```bash
git add src/n8n-mcp-client.ts src/opencode-planner.ts tests/n8n-mcp-client.test.ts tests/opencode-planner.test.ts
git commit -m "feat: plan workflows with opencode and n8n mcp"
```

### Task 8: Build, Inspect, and List Tool Orchestration

**Files:**
- Create: `src/tools/build-workflow.ts`
- Create: `src/tools/inspect-workflow.ts`
- Create: `src/tools/list-managed-workflows.ts`
- Create: `tests/build-workflow.test.ts`
- Create: `tests/inspect-list-tools.test.ts`

- [ ] **Step 1: Write failing orchestration tests**

Create `tests/build-workflow.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { buildWorkflow } from "../src/tools/build-workflow"
import { simpleWebhookPlan } from "./fixtures/workflows"

describe("buildWorkflow", () => {
  it("creates an inactive managed workflow and records it", async () => {
    const api = {
      createWorkflow: vi.fn(async (workflow) => ({ ...workflow, id: "wf_1" })),
    }
    const registry = { upsert: vi.fn() }
    const planner = { createPlan: vi.fn(async () => simpleWebhookPlan) }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "webhook slack"),
      getNodeTypes: vi.fn(async () => "node schemas"),
    }

    const result = await buildWorkflow({
      args: { prompt: "Build an order webhook", name: "Orders" },
      config: {
        baseUrl: "https://demo/api/v1",
        apiKey: "key",
        mcpUrl: "https://demo/mcp",
        workspaceDir: "/tmp/project",
        registryPath: "/tmp/project/.opencode/n8n-workflows.json",
        previewDir: "/tmp/project/.opencode/n8n-update-previews",
        credentialEnv: {},
        pluginVersion: "0.1.0",
      },
      api,
      registry,
      planner,
      mcp,
      now: () => new Date("2026-06-04T00:00:00.000Z"),
    })

    expect(result.workflowId).toBe("wf_1")
    expect(result.nodeCount).toBe(2)
    expect(api.createWorkflow).toHaveBeenCalled()
    expect(registry.upsert).toHaveBeenCalledWith(expect.objectContaining({ workflowId: "wf_1" }))
  })
})
```

Create `tests/inspect-list-tools.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { inspectWorkflow } from "../src/tools/inspect-workflow"
import { listManagedWorkflows } from "../src/tools/list-managed-workflows"

describe("inspectWorkflow", () => {
  it("summarizes a managed workflow", async () => {
    const api = {
      getWorkflow: vi.fn(async () => ({
        id: "wf_1",
        name: "Orders",
        active: false,
        nodes: [{ name: "Start", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [0, 0], parameters: {} }],
        connections: {},
        settings: {},
        tags: [{ name: "opencode-n8n-builder" }],
      })),
    }

    const result = await inspectWorkflow({ args: { workflowId: "wf_1" }, api })

    expect(result.workflowId).toBe("wf_1")
    expect(result.nodes[0].name).toBe("Start")
    expect(result.issues).toEqual([])
  })
})

describe("listManagedWorkflows", () => {
  it("returns registry records", async () => {
    const registry = {
      list: vi.fn(async () => [
        { workflowId: "wf_1", name: "Orders", url: "https://demo/workflow/wf_1", lastUpdatedAt: "2026-06-04T00:00:00.000Z" },
      ]),
    }

    const result = await listManagedWorkflows({ registry })

    expect(result.workflows).toEqual([
      { workflowId: "wf_1", name: "Orders", url: "https://demo/workflow/wf_1", lastUpdatedAt: "2026-06-04T00:00:00.000Z" },
    ])
  })
})
```

- [ ] **Step 2: Implement build workflow orchestration**

Create `src/tools/build-workflow.ts`:

```ts
import { stableHash } from "../hash"
import type { PluginConfig, Warning, CredentialGap } from "../types"
import { validateWorkflowForSave } from "../validator"
import { compileWorkflowPlan } from "../workflow-compiler"

type BuildWorkflowArgs = {
  prompt: string
  name?: string
  projectId?: string
  folderId?: string
}

type BuildWorkflowDeps = {
  args: BuildWorkflowArgs
  config: PluginConfig
  api: { createWorkflow(workflow: unknown): Promise<{ id: string; name: string }> }
  registry: { upsert(record: unknown): Promise<void> }
  planner: { createPlan(input: unknown): Promise<any> }
  mcp: { getSdkReference(section: string): Promise<string>; searchNodes(query: string): Promise<string>; getNodeTypes(nodeTypes: string[]): Promise<string> }
  now?: () => Date
}

export async function buildWorkflow(deps: BuildWorkflowDeps) {
  const now = deps.now?.() ?? new Date()
  const sdkReference = await deps.mcp.getSdkReference("all")
  const searchResult = await deps.mcp.searchNodes(deps.args.prompt)
  const nodeTypes = extractNodeTypes(searchResult)
  const nodeDocumentation = await deps.mcp.getNodeTypes(nodeTypes)
  const plan = await deps.planner.createPlan({
    prompt: deps.args.prompt,
    sdkReference,
    nodeDocumentation: [{ nodeType: "selected", documentation: nodeDocumentation }],
  })

  const workflow = compileWorkflowPlan({
    plan: { ...plan, name: deps.args.name ?? plan.name },
    marker: {
      managedBy: "opencode-n8n-builder",
      managedByVersion: deps.config.pluginVersion,
      createdAt: now.toISOString(),
    },
  })

  const validation = validateWorkflowForSave({ workflow, requireManagedMarker: false })
  if (!validation.valid) {
    return {
      workflowId: "",
      name: workflow.name,
      url: "",
      nodeCount: workflow.nodes.length,
      summary: "Workflow was not created because validation failed.",
      missingCredentials: [] as CredentialGap[],
      warnings: validation.issues.concat(validation.warnings) as Warning[],
    }
  }

  const created = await deps.api.createWorkflow(workflow)
  const url = workflowUrl(deps.config.baseUrl, created.id)
  await deps.registry.upsert({
    workflowId: created.id,
    name: workflow.name,
    url,
    baseUrl: deps.config.baseUrl,
    managedBy: "opencode-n8n-builder",
    managedByVersion: deps.config.pluginVersion,
    lastPlanHash: stableHash(plan),
    lastUpdatedAt: now.toISOString(),
  })

  return {
    workflowId: created.id,
    name: workflow.name,
    url,
    nodeCount: workflow.nodes.length,
    summary: plan.summary,
    missingCredentials: [] as CredentialGap[],
    warnings: validation.warnings as Warning[],
  }
}

function extractNodeTypes(searchResult: string): string[] {
  const matches = searchResult.match(/n8n-nodes-[a-zA-Z0-9_.-]+/g) ?? []
  return [...new Set(matches)].slice(0, 20)
}

function workflowUrl(baseUrl: string, workflowId: string): string {
  return baseUrl.replace(/\/api\/v\d+\/?$/, "").replace(/\/$/, "") + `/workflow/${workflowId}`
}
```

- [ ] **Step 3: Implement inspect and list tools**

Create `src/tools/inspect-workflow.ts`:

```ts
import { validateWorkflowForSave } from "../validator"

type InspectWorkflowDeps = {
  args: { workflowId: string }
  api: { getWorkflow(workflowId: string): Promise<any> }
}

export async function inspectWorkflow(deps: InspectWorkflowDeps) {
  const workflow = await deps.api.getWorkflow(deps.args.workflowId)
  const validation = validateWorkflowForSave({ workflow, requireManagedMarker: true, allowActiveUpdate: true })

  return {
    workflowId: workflow.id,
    name: workflow.name,
    active: workflow.active,
    nodes: workflow.nodes.map((node: any) => ({
      name: node.name,
      type: node.type,
      credentialTypes: Object.keys(node.credentials ?? {}),
    })),
    connections: Object.entries(workflow.connections ?? {}).map(([source, outputs]) => ({ source, outputs })),
    issues: validation.issues,
  }
}
```

Create `src/tools/list-managed-workflows.ts`:

```ts
type ListManagedWorkflowDeps = {
  registry: {
    list(): Promise<Array<{ workflowId: string; name: string; url: string; lastUpdatedAt?: string }>>
  }
}

export async function listManagedWorkflows(deps: ListManagedWorkflowDeps) {
  const workflows = await deps.registry.list()
  return {
    workflows: workflows.map((workflow) => ({
      workflowId: workflow.workflowId,
      name: workflow.name,
      url: workflow.url,
      lastUpdatedAt: workflow.lastUpdatedAt,
    })),
  }
}
```

- [ ] **Step 4: Run orchestration tests**

Run:

```bash
npm run test -- tests/build-workflow.test.ts tests/inspect-list-tools.test.ts
npm run typecheck
```

Expected:

```text
tests/build-workflow.test.ts ... pass
tests/inspect-list-tools.test.ts ... pass
tsc exits 0
```

- [ ] **Step 5: Commit build, inspect, and list tools**

Run:

```bash
git add src/tools/build-workflow.ts src/tools/inspect-workflow.ts src/tools/list-managed-workflows.ts tests/build-workflow.test.ts tests/inspect-list-tools.test.ts
git commit -m "feat: orchestrate workflow build and inspection tools"
```

### Task 9: Update Preview and Apply Tool Orchestration

**Files:**
- Create: `src/tools/update-workflow.ts`
- Create: `tests/update-workflow.test.ts`

- [ ] **Step 1: Write failing update preview/apply tests**

Create `tests/update-workflow.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { updateWorkflow } from "../src/tools/update-workflow"
import { stableHash } from "../src/hash"
import { simpleWebhookPlan } from "./fixtures/workflows"

const currentWorkflow = {
  id: "wf_1",
  name: "Orders",
  active: false,
  nodes: [{ name: "Start", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [0, 0], parameters: {} }],
  connections: {},
  settings: {},
  tags: [{ name: "opencode-n8n-builder" }],
}

describe("updateWorkflow", () => {
  it("previews an update without calling the n8n update API", async () => {
    const previewStore = { save: vi.fn(async (preview) => ({ previewId: "preview_1", ...preview })) }
    const api = { getWorkflow: vi.fn(async () => currentWorkflow), updateWorkflow: vi.fn() }
    const planner = {
      createPatchPlan: vi.fn(async () => ({
        summary: "Add Slack notification",
        changes: ["Add Slack node"],
        replacementPlan: simpleWebhookPlan,
      })),
    }
    const mcp = {
      getSdkReference: vi.fn(async () => "SDK rules"),
      searchNodes: vi.fn(async () => "slack"),
      getNodeTypes: vi.fn(async () => "slack schema"),
    }

    const result = await updateWorkflow({
      args: { workflowId: "wf_1", mode: "preview", prompt: "Add Slack" },
      config: baseConfig(),
      api,
      planner,
      mcp,
      previewStore,
      now: () => new Date("2026-06-04T00:00:00.000Z"),
    })

    expect(result.mode).toBe("preview")
    expect(result.previewId).toBe("preview_1")
    expect(api.updateWorkflow).not.toHaveBeenCalled()
  })

  it("applies a fresh preview and updates n8n", async () => {
    const proposedWorkflow = { ...currentWorkflow, name: "Order webhook to Slack", meta: { managedBy: "opencode-n8n-builder" } }
    const api = { getWorkflow: vi.fn(async () => currentWorkflow), updateWorkflow: vi.fn(async () => ({ ...proposedWorkflow, id: "wf_1" })) }
    const previewStore = {
      get: vi.fn(async () => ({
        previewId: "preview_1",
        workflowId: "wf_1",
        baseWorkflowHash: stableHash(currentWorkflow),
        proposedWorkflowHash: stableHash(proposedWorkflow),
        summary: "Apply Slack",
        changes: ["Add Slack node"],
        proposedWorkflow,
        createdAt: "2026-06-04T00:00:00.000Z",
        expiresAt: "2026-06-04T00:30:00.000Z",
      })),
    }
    const registry = { upsert: vi.fn() }

    const result = await updateWorkflow({
      args: { workflowId: "wf_1", mode: "apply", previewId: "preview_1" },
      config: baseConfig(),
      api,
      previewStore,
      registry,
      now: () => new Date("2026-06-04T00:10:00.000Z"),
    })

    expect(result.mode).toBe("apply")
    expect(api.updateWorkflow).toHaveBeenCalledWith("wf_1", proposedWorkflow)
    expect(registry.upsert).toHaveBeenCalled()
  })
})

function baseConfig() {
  return {
    baseUrl: "https://demo/api/v1",
    apiKey: "key",
    mcpUrl: "https://demo/mcp",
    workspaceDir: "/tmp/project",
    registryPath: "/tmp/project/.opencode/n8n-workflows.json",
    previewDir: "/tmp/project/.opencode/n8n-update-previews",
    credentialEnv: {},
    pluginVersion: "0.1.0",
  }
}
```

- [ ] **Step 2: Implement update orchestration**

Create `src/tools/update-workflow.ts`:

```ts
import { N8nBuilderError } from "../errors"
import { stableHash } from "../hash"
import type { PluginConfig, Warning, CredentialGap } from "../types"
import { validateWorkflowForSave, type N8nWorkflow } from "../validator"
import { compileWorkflowPlan } from "../workflow-compiler"

type UpdateWorkflowArgs =
  | { workflowId: string; mode: "preview"; prompt: string; previewId?: never }
  | { workflowId: string; mode: "apply"; previewId: string; prompt?: never }

type UpdateWorkflowDeps = {
  args: UpdateWorkflowArgs
  config: PluginConfig
  api: { getWorkflow(workflowId: string): Promise<N8nWorkflow & { id: string }>; updateWorkflow?(workflowId: string, workflow: N8nWorkflow): Promise<N8nWorkflow & { id: string }> }
  planner?: { createPatchPlan(input: unknown): Promise<any> }
  mcp?: { getSdkReference(section: string): Promise<string>; searchNodes(query: string): Promise<string>; getNodeTypes(nodeTypes: string[]): Promise<string> }
  previewStore: { save?(preview: any): Promise<any>; get?(previewId: string, now?: Date): Promise<any> }
  registry?: { upsert(record: unknown): Promise<void> }
  now?: () => Date
}

export async function updateWorkflow(deps: UpdateWorkflowDeps) {
  return deps.args.mode === "preview" ? previewUpdate(deps as UpdateWorkflowDeps & { args: Extract<UpdateWorkflowArgs, { mode: "preview" }> }) : applyUpdate(deps as UpdateWorkflowDeps & { args: Extract<UpdateWorkflowArgs, { mode: "apply" }> })
}

async function previewUpdate(deps: UpdateWorkflowDeps & { args: Extract<UpdateWorkflowArgs, { mode: "preview" }> }) {
  if (!deps.planner || !deps.mcp || !deps.previewStore.save) {
    throw new N8nBuilderError("Preview dependencies are not configured.", "UPDATE_PREVIEW_DEPS_MISSING")
  }

  const now = deps.now?.() ?? new Date()
  const currentWorkflow = await deps.api.getWorkflow(deps.args.workflowId)
  const ownership = validateWorkflowForSave({ workflow: currentWorkflow, requireManagedMarker: true, allowActiveUpdate: false })
  if (!ownership.valid) {
    throw new N8nBuilderError("Workflow cannot be previewed for update.", "WORKFLOW_UPDATE_BLOCKED", { issues: ownership.issues })
  }

  const sdkReference = await deps.mcp.getSdkReference("all")
  const searchResult = await deps.mcp.searchNodes(deps.args.prompt)
  const nodeTypes = extractNodeTypes(searchResult)
  const nodeDocumentation = await deps.mcp.getNodeTypes(nodeTypes)
  const patch = await deps.planner.createPatchPlan({
    prompt: deps.args.prompt,
    currentWorkflowJson: JSON.stringify(currentWorkflow, null, 2),
    sdkReference,
    nodeDocumentation: [{ nodeType: "selected", documentation: nodeDocumentation }],
  })

  const proposedWorkflow = compileWorkflowPlan({
    plan: patch.replacementPlan,
    marker: {
      managedBy: "opencode-n8n-builder",
      managedByVersion: deps.config.pluginVersion,
      createdAt: now.toISOString(),
    },
  })

  const validation = validateWorkflowForSave({ workflow: proposedWorkflow, requireManagedMarker: true, allowActiveUpdate: false })
  if (!validation.valid) {
    throw new N8nBuilderError("Proposed workflow failed validation.", "PROPOSED_WORKFLOW_INVALID", { issues: validation.issues })
  }

  const preview = await deps.previewStore.save({
    workflowId: deps.args.workflowId,
    baseWorkflowHash: stableHash(currentWorkflow),
    proposedWorkflowHash: stableHash(proposedWorkflow),
    summary: patch.summary,
    changes: patch.changes,
    proposedWorkflow,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
  })

  return {
    workflowId: deps.args.workflowId,
    name: proposedWorkflow.name,
    url: workflowUrl(deps.config.baseUrl, deps.args.workflowId),
    mode: "preview" as const,
    previewId: preview.previewId,
    summary: patch.summary,
    changes: patch.changes,
    missingCredentials: [] as CredentialGap[],
    warnings: validation.warnings as Warning[],
  }
}

async function applyUpdate(deps: UpdateWorkflowDeps & { args: Extract<UpdateWorkflowArgs, { mode: "apply" }> }) {
  if (!deps.previewStore.get || !deps.api.updateWorkflow || !deps.registry) {
    throw new N8nBuilderError("Apply dependencies are not configured.", "UPDATE_APPLY_DEPS_MISSING")
  }

  const now = deps.now?.() ?? new Date()
  const preview = await deps.previewStore.get(deps.args.previewId, now)
  if (!preview || preview.workflowId !== deps.args.workflowId) {
    throw new N8nBuilderError("Update preview is missing, expired, or for a different workflow.", "UPDATE_PREVIEW_INVALID")
  }

  const currentWorkflow = await deps.api.getWorkflow(deps.args.workflowId)
  if (stableHash(currentWorkflow) !== preview.baseWorkflowHash) {
    throw new N8nBuilderError("Workflow changed after preview was created.", "UPDATE_PREVIEW_STALE")
  }

  const validation = validateWorkflowForSave({ workflow: preview.proposedWorkflow, requireManagedMarker: true, allowActiveUpdate: false })
  if (!validation.valid) {
    throw new N8nBuilderError("Preview workflow failed validation during apply.", "PROPOSED_WORKFLOW_INVALID", { issues: validation.issues })
  }

  const updated = await deps.api.updateWorkflow(deps.args.workflowId, preview.proposedWorkflow)
  const url = workflowUrl(deps.config.baseUrl, deps.args.workflowId)
  await deps.registry.upsert({
    workflowId: deps.args.workflowId,
    name: updated.name,
    url,
    baseUrl: deps.config.baseUrl,
    managedBy: "opencode-n8n-builder",
    managedByVersion: deps.config.pluginVersion,
    lastPlanHash: preview.proposedWorkflowHash,
    lastUpdatedAt: now.toISOString(),
  })

  return {
    workflowId: deps.args.workflowId,
    name: updated.name,
    url,
    mode: "apply" as const,
    summary: preview.summary,
    changes: preview.changes,
    missingCredentials: [] as CredentialGap[],
    warnings: validation.warnings as Warning[],
  }
}

function extractNodeTypes(searchResult: string): string[] {
  const matches = searchResult.match(/n8n-nodes-[a-zA-Z0-9_.-]+/g) ?? []
  return [...new Set(matches)].slice(0, 20)
}

function workflowUrl(baseUrl: string, workflowId: string): string {
  return baseUrl.replace(/\/api\/v\d+\/?$/, "").replace(/\/$/, "") + `/workflow/${workflowId}`
}
```

- [ ] **Step 3: Run update tests**

Run:

```bash
npm run test -- tests/update-workflow.test.ts
npm run typecheck
```

Expected:

```text
tests/update-workflow.test.ts ... pass
tsc exits 0
```

- [ ] **Step 4: Commit update orchestration**

Run:

```bash
git add src/tools/update-workflow.ts tests/update-workflow.test.ts
git commit -m "feat: preview and apply managed workflow updates"
```

### Task 10: OpenCode Plugin Tool Wiring and Documentation

**Files:**
- Modify: `src/plugin.ts`
- Modify: `src/index.ts`
- Create: `README.md`
- Modify: `tests/plugin.test.ts`

- [ ] **Step 1: Expand plugin wiring test**

Replace `tests/plugin.test.ts` with:

```ts
import { describe, expect, it, vi } from "vitest"
import { createN8nBuilderPlugin, N8nBuilderPlugin } from "../src/index"

describe("plugin exports", () => {
  it("exports a plugin factory and default plugin function", () => {
    expect(typeof createN8nBuilderPlugin).toBe("function")
    expect(typeof N8nBuilderPlugin).toBe("function")
  })

  it("registers the four n8n tools", async () => {
    const plugin = createN8nBuilderPlugin({ version: "0.1.0" })
    const result = await plugin({
      project: {},
      directory: "/tmp/project",
      worktree: "/tmp/project",
      $: vi.fn(),
      client: {
        app: { log: vi.fn(async () => true) },
        config: { get: vi.fn(async () => ({ n8n: {} })) },
      },
    } as any)

    expect(Object.keys(result.tool ?? {}).sort()).toEqual([
      "n8n_build_workflow",
      "n8n_inspect_workflow",
      "n8n_list_managed_workflows",
      "n8n_update_workflow",
    ])
  })
})
```

- [ ] **Step 2: Wire OpenCode tools**

Replace `src/plugin.ts` with:

```ts
import { tool, type Plugin } from "@opencode-ai/plugin"
import { z } from "zod"
import { loadPluginConfig } from "./config"
import { CredentialResolver } from "./credential-resolver"
import { N8nApiClient } from "./n8n-api-client"
import { N8nMcpClient } from "./n8n-mcp-client"
import { OpencodePlanner } from "./opencode-planner"
import { PreviewStore } from "./preview-store"
import { WorkflowRegistry } from "./registry"
import { buildWorkflow } from "./tools/build-workflow"
import { inspectWorkflow } from "./tools/inspect-workflow"
import { listManagedWorkflows } from "./tools/list-managed-workflows"
import { updateWorkflow } from "./tools/update-workflow"

export type N8nBuilderPluginOptions = {
  version?: string
}

export function createN8nBuilderPlugin(options: N8nBuilderPluginOptions = {}): Plugin {
  const version = options.version ?? "0.1.0"

  const plugin: Plugin = async ({ client, directory }) => {
    await client.app.log({
      body: {
        service: "opencode-n8n-builder",
        level: "info",
        message: "Plugin initialized",
        extra: { version },
      },
    })

    async function deps() {
      const opencodeConfig = await client.config.get()
      const config = loadPluginConfig({
        env: process.env,
        opencodeConfig,
        workspaceDir: directory,
        pluginVersion: version,
      })
      const api = new N8nApiClient({ baseUrl: config.baseUrl, apiKey: config.apiKey })
      return {
        config,
        api,
        registry: new WorkflowRegistry(config.registryPath),
        previewStore: new PreviewStore(config.previewDir),
        mcp: new N8nMcpClient({ mcpUrl: config.mcpUrl }),
        planner: new OpencodePlanner({ client: client as any }),
        credentialResolver: new CredentialResolver({
          api,
          env: process.env,
          credentialEnv: config.credentialEnv,
        }),
      }
    }

    return {
      tool: {
        n8n_build_workflow: tool({
          description: "Create a new inactive n8n workflow draft managed by OpenCode from a natural-language request.",
          args: {
            prompt: tool.schema.string(),
            name: tool.schema.string().optional(),
            projectId: tool.schema.string().optional(),
            folderId: tool.schema.string().optional(),
          },
          async execute(args) {
            const resolved = await deps()
            return buildWorkflow({ args, ...resolved })
          },
        }),

        n8n_update_workflow: tool({
          description: "Preview or apply an update to an n8n workflow previously created and managed by OpenCode.",
          args: {
            workflowId: tool.schema.string(),
            prompt: tool.schema.string().optional(),
            mode: z.enum(["preview", "apply"]),
            previewId: tool.schema.string().optional(),
          },
          async execute(args) {
            const resolved = await deps()
            return updateWorkflow({ args: args as any, ...resolved })
          },
        }),

        n8n_inspect_workflow: tool({
          description: "Inspect a managed n8n workflow and report nodes, connections, credential gaps, and validation issues.",
          args: {
            workflowId: tool.schema.string(),
          },
          async execute(args) {
            const resolved = await deps()
            return inspectWorkflow({ args, api: resolved.api })
          },
        }),

        n8n_list_managed_workflows: tool({
          description: "List n8n workflows managed by this OpenCode workspace.",
          args: {},
          async execute() {
            const resolved = await deps()
            return listManagedWorkflows({ registry: resolved.registry })
          },
        }),
      },
    }
  }

  return plugin
}

export const N8nBuilderPlugin = createN8nBuilderPlugin()
```

- [ ] **Step 3: Write README**

Create `README.md`:

```md
# opencode-n8n-builder

OpenCode plugin for creating and updating managed n8n workflow drafts from natural language.

## Capabilities

- Create inactive n8n draft workflows.
- Update only workflows created and marked by this plugin.
- Use n8n MCP for SDK guidance, node search, and node type lookup.
- Use n8n REST API for workflow persistence.
- Keep plaintext secrets out of workflow JSON, registry files, logs, and tool output.

## Configuration

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

Set `N8N_API_KEY` in the shell environment. You can also set `N8N_BASE_URL` and `N8N_MCP_URL` in the environment instead of the OpenCode config.

## Tools

- `n8n_build_workflow`: create a new inactive managed draft workflow.
- `n8n_update_workflow`: preview or apply updates to managed workflows.
- `n8n_inspect_workflow`: inspect a managed workflow.
- `n8n_list_managed_workflows`: list managed workflows in the current workspace.

## Update Safety

Updates use two stages:

1. `preview`: returns a change summary and preview ID without updating n8n.
2. `apply`: rechecks the current workflow hash and applies only a fresh preview.

The plugin refuses to update workflows it does not manage.
```

- [ ] **Step 4: Run full checks**

Run:

```bash
npm run check
```

Expected:

```text
tsc exits 0
all Vitest tests pass
tsup builds dist/index.js and dist/index.d.ts
```

- [ ] **Step 5: Commit plugin wiring and docs**

Run:

```bash
git add src/plugin.ts src/index.ts README.md tests/plugin.test.ts
git commit -m "feat: wire opencode n8n builder tools"
```

## Final Verification

- [ ] Run unit and build checks:

```bash
npm run check
```

Expected:

```text
typecheck passes
all tests pass
build succeeds
```

- [ ] Inspect package output:

```bash
ls -la dist
```

Expected:

```text
index.js
index.d.ts
```

- [ ] Confirm no secret-looking values are present in tracked files:

```bash
rg -n "N8N_API_KEY=|SLACK_BOT_TOKEN=|accessToken\":\\s*\"[^\"]+|clientSecret\":\\s*\"[^\"]+" .
```

Expected:

```text
No matches containing real secret assignments or literal token values.
```

- [ ] Review git history:

```bash
git log --oneline --max-count=12
git status --short
```

Expected:

```text
Task commits are present.
Working tree is clean.
```

## Spec Coverage Review

- Managed create workflow: Task 8 implements `n8n_build_workflow`.
- Managed update with preview/apply: Task 9 implements `n8n_update_workflow`.
- n8n MCP dynamic node context: Task 7 implements `N8nMcpClient`; Tasks 8 and 9 call it.
- OpenCode structured planning: Task 7 implements `OpencodePlanner`.
- n8n REST workflow persistence: Task 6 implements `N8nApiClient`.
- Credential strategy: Task 6 implements `CredentialResolver`; Task 3 blocks plaintext secrets.
- Local registry: Task 5 implements `WorkflowRegistry`.
- Preview cache: Task 5 implements `PreviewStore`.
- Ownership and active workflow safety: Task 3 validator and Task 9 update orchestration enforce these policies.
- Inspect/list tools: Task 8 implements `n8n_inspect_workflow` and `n8n_list_managed_workflows`.
- Package wiring and README: Task 10 exposes OpenCode tools and documents setup.
