import { z } from "zod"

const workflowPlanNodeSchema = z.object({
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
})

const workflowPlanConnectionSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  output: z.string().default("main"),
  input: z.string().default("main"),
  outputIndex: z.number().int().nonnegative().default(0),
  inputIndex: z.number().int().nonnegative().default(0),
})

export const workflowPlanSchema = z.object({
  name: z.string().min(1),
  summary: z.string().min(1),
  nodes: z.array(workflowPlanNodeSchema),
  connections: z.array(workflowPlanConnectionSchema),
})

export type WorkflowPlan = z.infer<typeof workflowPlanSchema>

export const nodeSelectionSchema = z.object({
  nodeType: z.string().min(1),
  reason: z.string().min(1),
})

export const workflowDraftSchema = z.object({
  plan: workflowPlanSchema,
  sdkCode: z.string().min(1),
  nodeSelection: z.array(nodeSelectionSchema).default([]),
})

export type WorkflowDraft = z.infer<typeof workflowDraftSchema>

export const workflowPatchPlanSchema = z.object({
  summary: z.string().min(1),
  changes: z.array(z.string().min(1)),
  replacementPlan: workflowPlanSchema,
})

export type WorkflowPatchPlan = z.infer<typeof workflowPatchPlanSchema>

export const workflowPatchDraftSchema = z.object({
  summary: z.string().min(1),
  changes: z.array(z.string().min(1)),
  replacementPlan: workflowPlanSchema,
  sdkCode: z.string().min(1),
  nodeSelection: z.array(nodeSelectionSchema).default([]),
})

export type WorkflowPatchDraft = z.infer<typeof workflowPatchDraftSchema>
