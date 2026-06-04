import { workflowPlanSchema, type WorkflowPlan } from "../../src/workflow-plan.js"

export const simpleWebhookPlan: WorkflowPlan = workflowPlanSchema.parse({
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
      parameters: {
        resource: "message",
        operation: "post",
        channel: "#orders",
        text: "New order received",
      },
      credential: { type: "slackApi", name: "OpenCode Slack" },
    },
  ],
  connections: [{ from: "webhook", to: "slack" }],
})
