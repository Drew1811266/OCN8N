import type { WorkflowRegistryRecord } from "../registry.js"

export type ListManagedWorkflowsResult = {
  workflows: Array<{
    workflowId: string
    name: string
    url: string
    lastUpdatedAt: string
  }>
}

export type ListManagedWorkflowDeps = {
  registry: {
    list(): Promise<WorkflowRegistryRecord[]>
  }
}

export async function listManagedWorkflows(
  deps: ListManagedWorkflowDeps,
): Promise<ListManagedWorkflowsResult> {
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
