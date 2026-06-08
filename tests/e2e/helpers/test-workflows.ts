import {
  workflowPatchPlanSchema,
  workflowPlanSchema,
  type WorkflowPatchPlan,
  type WorkflowPlan,
} from "../../../src/workflow-plan.js"

export const e2eManualSetPlan: WorkflowPlan = workflowPlanSchema.parse({
  name: "OCN8N E2E Manual Set",
  summary: "Manual trigger creates a deterministic field.",
  nodes: [
    {
      key: "manual",
      name: "Manual Trigger",
      type: "n8n-nodes-base.manualTrigger",
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    },
    {
      key: "set",
      name: "Set Fields",
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [280, 0],
      parameters: {
        assignments: {
          assignments: [
            {
              id: "message",
              name: "message",
              type: "string",
              value: "created by opencode",
            },
          ],
        },
      },
    },
  ],
  connections: [{ from: "manual", to: "set" }],
})

export const e2eManualSetSdkCode = `
import { Workflow } from '@n8n/workflow'

const workflow = new Workflow({
  name: 'OCN8N E2E Manual Set',
  nodes: [
    {
      id: 'manual-trigger',
      name: 'Manual Trigger',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    },
    {
      id: 'set-fields',
      name: 'Set Fields',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [280, 0],
      parameters: {
        assignments: {
          assignments: [
            {
              id: 'message',
              name: 'message',
              type: 'string',
              value: 'created by opencode',
            },
          ],
        },
      },
    },
  ],
  connections: {
    'Manual Trigger': {
      main: [
        [
          {
            node: 'Set Fields',
            type: 'main',
            index: 0,
          },
        ],
      ],
    },
  },
})

export default workflow
`.trim()

export const e2eWebhookSetPlan: WorkflowPlan = workflowPlanSchema.parse({
  name: "OCN8N E2E Webhook Set",
  summary: "Webhook trigger normalizes an incoming payload.",
  nodes: [
    {
      key: "webhook",
      name: "Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [0, 0],
      parameters: {
        path: "ocn8n-e2e-webhook",
        httpMethod: "POST",
        responseMode: "lastNode",
      },
    },
    {
      key: "set",
      name: "Set Payload",
      type: "n8n-nodes-base.set",
      typeVersion: 3.4,
      position: [280, 0],
      parameters: {
        assignments: {
          assignments: [
            {
              id: "source",
              name: "source",
              type: "string",
              value: "webhook",
            },
          ],
        },
      },
    },
  ],
  connections: [{ from: "webhook", to: "set" }],
})

export const e2eScheduleHttpIfPlan: WorkflowPlan = workflowPlanSchema.parse({
  name: "OCN8N E2E Schedule HTTP IF",
  summary: "Schedule trigger calls a public HTTP endpoint and branches on the response.",
  nodes: [
    {
      key: "schedule",
      name: "Schedule Trigger",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1,
      position: [0, 0],
      parameters: {
        rule: {
          interval: [{ field: "minutes", minutesInterval: 30 }],
        },
      },
    },
    {
      key: "http",
      name: "HTTP Request",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [280, 0],
      parameters: {
        method: "GET",
        url: "https://example.com",
        options: {
          response: {
            response: {
              responseFormat: "text",
            },
          },
        },
      },
    },
    {
      key: "if",
      name: "IF",
      type: "n8n-nodes-base.if",
      typeVersion: 2,
      position: [560, 0],
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: "",
            typeValidation: "strict",
          },
          conditions: [
            {
              id: "status",
              leftValue: "={{ $json.statusCode || 200 }}",
              rightValue: 200,
              operator: {
                type: "number",
                operation: "equals",
              },
            },
          ],
          combinator: "and",
        },
      },
    },
  ],
  connections: [
    { from: "schedule", to: "http" },
    { from: "http", to: "if" },
  ],
})

export const e2eUpdatedManualIfPlan: WorkflowPatchPlan = workflowPatchPlanSchema.parse({
  summary: "Add an IF branch after the Set node.",
  changes: ["Add IF node that checks the generated message."],
  replacementPlan: {
    name: "OCN8N E2E Manual Set Updated",
    summary: "Manual trigger creates a field and branches on it.",
    nodes: [
      ...e2eManualSetPlan.nodes,
      {
        key: "if",
        name: "IF Message",
        type: "n8n-nodes-base.if",
        typeVersion: 2,
        position: [560, 0],
        parameters: {
          conditions: {
            options: {
              caseSensitive: true,
              leftValue: "",
              typeValidation: "strict",
            },
            conditions: [
              {
                id: "message-check",
                leftValue: "={{ $json.message }}",
                rightValue: "created by opencode",
                operator: {
                  type: "string",
                  operation: "equals",
                },
              },
            ],
            combinator: "and",
          },
        },
      },
    ],
    connections: [
      ...e2eManualSetPlan.connections,
      { from: "set", to: "if" },
    ],
  },
})

export const e2eUpdatedManualIfSdkCode = `
import { Workflow } from '@n8n/workflow'

const workflow = new Workflow({
  name: 'OCN8N E2E Manual Set Updated',
  nodes: [
    {
      id: 'manual-trigger',
      name: 'Manual Trigger',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    },
    {
      id: 'set-fields',
      name: 'Set Fields',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [280, 0],
      parameters: {
        assignments: {
          assignments: [
            {
              id: 'message',
              name: 'message',
              type: 'string',
              value: 'created by opencode',
            },
          ],
        },
      },
    },
    {
      id: 'if-message',
      name: 'IF Message',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [560, 0],
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: '',
            typeValidation: 'strict',
          },
          conditions: [
            {
              id: 'message-check',
              leftValue: '={{ $json.message }}',
              rightValue: 'created by opencode',
              operator: {
                type: 'string',
                operation: 'equals',
              },
            },
          ],
          combinator: 'and',
        },
      },
    },
  ],
  connections: {
    'Manual Trigger': {
      main: [
        [
          {
            node: 'Set Fields',
            type: 'main',
            index: 0,
          },
        ],
      ],
    },
    'Set Fields': {
      main: [
        [
          {
            node: 'IF Message',
            type: 'main',
            index: 0,
          },
        ],
      ],
    },
  },
})

export default workflow
`.trim()
