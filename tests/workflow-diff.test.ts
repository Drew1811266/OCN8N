import { describe, expect, it } from "vitest"
import { createWorkflowDiff, hasWorkflowDiff } from "../src/workflow-diff.js"
import type { N8nWorkflow } from "../src/validator.js"

function workflow(overrides: Partial<N8nWorkflow> = {}): N8nWorkflow {
  return {
    name: "Orders",
    active: false,
    nodes: [
      {
        name: "Manual Trigger",
        type: "n8n-nodes-base.manualTrigger",
        typeVersion: 1,
        position: [0, 0],
        parameters: {},
      },
      {
        name: "Set Fields",
        type: "n8n-nodes-base.set",
        typeVersion: 3.4,
        position: [300, 0],
        parameters: {
          assignments: {
            assignments: [
              {
                id: "message",
                name: "message",
                type: "string",
                value: "old",
              },
            ],
          },
        },
        credentials: {
          httpHeaderAuth: { id: "cred_old", name: "Old API" },
        },
      },
    ],
    connections: {
      "Manual Trigger": {
        main: [[{ node: "Set Fields", type: "main", index: 0 }]],
      },
    },
    settings: {
      timezone: "UTC",
    },
    ...overrides,
  }
}

describe("createWorkflowDiff", () => {
  it("reports added and removed nodes in stable order", () => {
    const before = workflow({
      nodes: [
        {
          name: "Old Node",
          type: "n8n-nodes-base.set",
          typeVersion: 3,
          position: [0, 0],
          parameters: {},
        },
      ],
      connections: {},
    })
    const after = workflow({
      nodes: [
        {
          name: "New Node",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4,
          position: [0, 0],
          parameters: {},
        },
      ],
      connections: {},
    })

    expect(createWorkflowDiff(before, after)).toMatchObject({
      addedNodes: [{ nodeName: "New Node", nodeType: "n8n-nodes-base.httpRequest" }],
      removedNodes: [{ nodeName: "Old Node", nodeType: "n8n-nodes-base.set" }],
    })
  })

  it("reports parameter, credential, connection, and settings changes", () => {
    const before = workflow()
    const after = workflow({
      nodes: [
        before.nodes[0],
        {
          ...before.nodes[1],
          parameters: {
            assignments: {
              assignments: [
                {
                  id: "message",
                  name: "message",
                  type: "string",
                  value: "new",
                },
              ],
            },
          },
          credentials: {
            httpHeaderAuth: { id: "cred_new", name: "New API" },
          },
        },
      ],
      connections: {
        "Manual Trigger": {
          main: [[{ node: "Set Fields", type: "main", index: 0 }]],
        },
        "Set Fields": {
          main: [[{ node: "Manual Trigger", type: "main", index: 0 }]],
        },
      },
      settings: {
        timezone: "Europe/Berlin",
      },
    })

    expect(createWorkflowDiff(before, after)).toEqual({
      addedNodes: [],
      removedNodes: [],
      changedNodeParameters: [
        {
          nodeName: "Set Fields",
          path: "assignments.assignments.0.value",
          before: "old",
          after: "new",
        },
      ],
      changedCredentials: [
        {
          nodeName: "Set Fields",
          credentialType: "httpHeaderAuth",
          beforeName: "Old API",
          afterName: "New API",
        },
      ],
      changedConnections: [
        {
          source: "Set Fields",
          before: undefined,
          after: {
            main: [[{ node: "Manual Trigger", type: "main", index: 0 }]],
          },
        },
      ],
      changedSettings: [
        {
          path: "timezone",
          before: "UTC",
          after: "Europe/Berlin",
        },
      ],
    })
  })

  it("redacts secret-looking parameter values", () => {
    const before = workflow({
      nodes: [
        {
          name: "HTTP",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4,
          position: [0, 0],
          parameters: { headers: { token: "old-secret" } },
        },
      ],
      connections: {},
    })
    const after = workflow({
      nodes: [
        {
          name: "HTTP",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4,
          position: [0, 0],
          parameters: { headers: { token: "new-secret" } },
        },
      ],
      connections: {},
    })

    const diff = createWorkflowDiff(before, after)

    expect(diff.changedNodeParameters).toEqual([
      {
        nodeName: "HTTP",
        path: "headers.token",
        before: "[REDACTED]",
        after: "[REDACTED]",
      },
    ])
    expect(JSON.stringify(diff)).not.toContain("old-secret")
    expect(JSON.stringify(diff)).not.toContain("new-secret")
  })

  it("detects whether a diff contains changes", () => {
    expect(hasWorkflowDiff(createWorkflowDiff(workflow(), workflow()))).toBe(false)
    expect(
      hasWorkflowDiff(
        createWorkflowDiff(
          workflow(),
          workflow({
            settings: { timezone: "Europe/Berlin" },
          }),
        ),
      ),
    ).toBe(true)
  })
})
