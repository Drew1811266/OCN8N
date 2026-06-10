import { describe, expect, it } from "vitest"
import { stableHash, stableStringify } from "../src/hash.js"
import { containsPlaintextSecret, isPrivateNetworkUrl, redactSecrets } from "../src/security.js"
import {
  getWorkflowOwnershipState,
  isManagedWorkflow,
  validateWorkflowForSave,
  type N8nWorkflow,
} from "../src/validator.js"

function workflow(overrides: Partial<N8nWorkflow> = {}): N8nWorkflow {
  return {
    name: "Workflow",
    active: false,
    nodes: [
      {
        id: "1",
        name: "Start",
        type: "n8n-nodes-base.manualTrigger",
        typeVersion: 1,
        position: [0, 0],
        parameters: {},
      },
    ],
    connections: {},
    settings: {},
    tags: [],
    ...overrides,
  }
}

describe("stable hashing", () => {
  it("hashes objects independent of key order", () => {
    const left = stableHash({ b: 2, a: 1, nested: { z: true, y: false } })
    const right = stableHash({ nested: { y: false, z: true }, a: 1, b: 2 })

    expect(left).toBe(right)
  })

  it("serializes object keys in stable sorted order", () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}')
  })
})

describe("security checks", () => {
  it("detects common plaintext secret-looking keys", () => {
    expect(containsPlaintextSecret({ token: "abc123" })).toBe(true)
    expect(containsPlaintextSecret({ nested: { clientSecret: "abc123" } })).toBe(true)
  })

  it("does not flag normal non-secret fields", () => {
    expect(containsPlaintextSecret({ url: "https://example.com/webhook" })).toBe(false)
  })

  it("detects private network URL hosts", () => {
    expect(isPrivateNetworkUrl("http://localhost:5678")).toBe(true)
    expect(isPrivateNetworkUrl("http://127.0.0.1:5678")).toBe(true)
    expect(isPrivateNetworkUrl("http://[::1]:5678")).toBe(true)
    expect(isPrivateNetworkUrl("http://10.1.2.3/internal")).toBe(true)
    expect(isPrivateNetworkUrl("http://192.168.1.25/api")).toBe(true)
    expect(isPrivateNetworkUrl("http://172.16.0.1/api")).toBe(true)
    expect(isPrivateNetworkUrl("http://172.31.255.255/api")).toBe(true)
  })

  it("does not flag public URL hosts", () => {
    expect(isPrivateNetworkUrl("https://api.example.com")).toBe(false)
    expect(isPrivateNetworkUrl("http://172.32.0.1/api")).toBe(false)
  })

  it("redacts nested secret-looking keys without mutating the original value", () => {
    const input = {
      message: "Unauthorized",
      details: {
        token: "secret-token",
        credentials: {
          clientSecret: "client-secret",
          safe: "visible",
        },
      },
    }

    expect(redactSecrets(input)).toEqual({
      message: "Unauthorized",
      details: {
        token: "[REDACTED]",
        credentials: {
          clientSecret: "[REDACTED]",
          safe: "visible",
        },
      },
    })
    expect(input.details.token).toBe("secret-token")
    expect(input.details.credentials.clientSecret).toBe("client-secret")
  })

  it("redacts bearer and Slack token-looking strings inside arrays", () => {
    expect(
      redactSecrets({
        errors: ["Authorization: Bearer secret-token", "Slack token xoxb-secret-token", "plain message"],
      }),
    ).toEqual({
      errors: ["[REDACTED]", "[REDACTED]", "plain message"],
    })
  })
})

describe("validateWorkflowForSave", () => {
  it("rejects duplicate node names and missing connection endpoints", () => {
    const result = validateWorkflowForSave({
      workflow: workflow({
        name: "Broken",
        nodes: [
          {
            id: "1",
            name: "Start",
            type: "n8n-nodes-base.manualTrigger",
            typeVersion: 1,
            position: [0, 0],
            parameters: {},
          },
          {
            id: "2",
            name: "Start",
            type: "n8n-nodes-base.set",
            typeVersion: 3,
            position: [300, 0],
            parameters: {},
          },
        ],
        connections: {
          MissingSource: {
            main: [[{ node: "MissingTarget", type: "main", index: 0 }]],
          },
        },
      }),
      requireManagedMarker: false,
    })

    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "DUPLICATE_NODE_NAME",
        "MISSING_CONNECTION_SOURCE",
        "MISSING_CONNECTION_TARGET",
      ]),
    )
  })

  it("rejects plaintext secrets in node parameters", () => {
    const result = validateWorkflowForSave({
      workflow: workflow({
        name: "Secret",
        nodes: [
          {
            id: "1",
            name: "HTTP",
            type: "n8n-nodes-base.httpRequest",
            typeVersion: 4,
            position: [0, 0],
            parameters: { token: "abc123" },
          },
        ],
      }),
      requireManagedMarker: false,
    })

    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain("PLAINTEXT_SECRET")
  })

  it("warns for private network URL parameters without invalidating the workflow", () => {
    const result = validateWorkflowForSave({
      workflow: workflow({
        nodes: [
          {
            id: "1",
            name: "HTTP",
            type: "n8n-nodes-base.httpRequest",
            typeVersion: 4,
            position: [0, 0],
            parameters: { url: "http://127.0.0.1:5678/webhook" },
          },
        ],
      }),
      requireManagedMarker: false,
    })

    expect(result.valid).toBe(true)
    expect(result.warnings.map((warning) => warning.code)).toContain("PRIVATE_NETWORK_HTTP_TARGET")
  })

  it("reports workflow ownership state from meta and tags", () => {
    expect(getWorkflowOwnershipState(workflow())).toBe("unmanaged")
    expect(getWorkflowOwnershipState(workflow({ meta: { managedBy: "opencode-n8n-builder" } }))).toBe(
      "managed_by_opencode",
    )
    expect(getWorkflowOwnershipState(workflow({ tags: [{ name: "opencode-n8n-builder" }] }))).toBe(
      "managed_by_opencode",
    )
    expect(getWorkflowOwnershipState(workflow({ meta: { managedBy: "other-builder" } }))).toBe("managed_by_other")
  })

  it("keeps isManagedWorkflow true only for opencode ownership", () => {
    expect(isManagedWorkflow(workflow({ meta: { managedBy: "opencode-n8n-builder" } }))).toBe(true)
    expect(isManagedWorkflow(workflow({ meta: { managedBy: "other-builder" } }))).toBe(false)
    expect(isManagedWorkflow(workflow())).toBe(false)
  })

  it("enforces managed workflow markers when requested", () => {
    const unmanaged = validateWorkflowForSave({
      workflow: workflow(),
      requireManagedMarker: true,
    })
    const metaManaged = validateWorkflowForSave({
      workflow: workflow({ meta: { managedBy: "opencode-n8n-builder" } }),
      requireManagedMarker: true,
    })
    const tagManaged = workflow({ tags: [{ name: "opencode-n8n-builder" }] })

    expect(unmanaged.valid).toBe(false)
    expect(unmanaged.issues.map((issue) => issue.code)).toContain("UNMANAGED_WORKFLOW")
    expect(metaManaged.valid).toBe(true)
    expect(isManagedWorkflow(tagManaged)).toBe(true)
  })

  it("blocks active workflow updates unless explicitly allowed", () => {
    const blocked = validateWorkflowForSave({
      workflow: workflow({
        active: true,
        meta: { managedBy: "opencode-n8n-builder" },
      }),
      requireManagedMarker: true,
    })
    const allowed = validateWorkflowForSave({
      workflow: workflow({
        active: true,
        meta: { managedBy: "opencode-n8n-builder" },
      }),
      requireManagedMarker: true,
      allowActiveUpdate: true,
    })

    expect(blocked.valid).toBe(false)
    expect(blocked.issues.map((issue) => issue.code)).toContain("ACTIVE_WORKFLOW_BLOCKED")
    expect(allowed.valid).toBe(true)
  })
})
