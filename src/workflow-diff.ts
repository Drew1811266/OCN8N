import { redactSecrets } from "./security.js"
import type { N8nWorkflow, N8nWorkflowNode } from "./validator.js"

export type WorkflowNodeDiff = {
  nodeName: string
  nodeType: string
}

export type NodeParameterDiff = {
  nodeName: string
  path: string
  before: unknown
  after: unknown
}

export type NodeCredentialDiff = {
  nodeName: string
  credentialType: string
  beforeName?: string
  afterName?: string
}

export type ConnectionDiff = {
  source: string
  before: unknown
  after: unknown
}

export type SettingDiff = {
  path: string
  before: unknown
  after: unknown
}

export type WorkflowDiff = {
  addedNodes: WorkflowNodeDiff[]
  removedNodes: WorkflowNodeDiff[]
  changedNodeParameters: NodeParameterDiff[]
  changedCredentials: NodeCredentialDiff[]
  changedConnections: ConnectionDiff[]
  changedSettings: SettingDiff[]
}

const secretDiffKeys = new Set([
  "apikey",
  "authorization",
  "token",
  "password",
  "secret",
  "clientsecret",
  "accesstoken",
  "refreshtoken",
])

export function createWorkflowDiff(before: N8nWorkflow, after: N8nWorkflow): WorkflowDiff {
  const beforeNodes = mapNodesByName(before.nodes)
  const afterNodes = mapNodesByName(after.nodes)
  const nodeNames = sortedUnion(Object.keys(beforeNodes), Object.keys(afterNodes))

  return {
    addedNodes: nodeNames
      .filter((nodeName) => !beforeNodes[nodeName] && afterNodes[nodeName])
      .map((nodeName) => nodeDiff(afterNodes[nodeName])),
    removedNodes: nodeNames
      .filter((nodeName) => beforeNodes[nodeName] && !afterNodes[nodeName])
      .map((nodeName) => nodeDiff(beforeNodes[nodeName])),
    changedNodeParameters: changedNodeParameters(nodeNames, beforeNodes, afterNodes),
    changedCredentials: changedCredentials(nodeNames, beforeNodes, afterNodes),
    changedConnections: changedRecordValues(before.connections, after.connections).map(([source, beforeValue, afterValue]) => ({
      source,
      before: redactSecrets(beforeValue),
      after: redactSecrets(afterValue),
    })),
    changedSettings: changedLeafValues(before.settings, after.settings).map(([path, beforeValue, afterValue]) => ({
      path,
      before: redactDiffValue(path, beforeValue),
      after: redactDiffValue(path, afterValue),
    })),
  }
}

export function hasWorkflowDiff(diff: WorkflowDiff): boolean {
  return Object.values(diff).some((items) => items.length > 0)
}

function mapNodesByName(nodes: N8nWorkflowNode[]): Record<string, N8nWorkflowNode> {
  return Object.fromEntries(nodes.map((node) => [node.name, node]))
}

function nodeDiff(node: N8nWorkflowNode): WorkflowNodeDiff {
  return {
    nodeName: node.name,
    nodeType: node.type,
  }
}

function changedNodeParameters(
  nodeNames: string[],
  beforeNodes: Record<string, N8nWorkflowNode>,
  afterNodes: Record<string, N8nWorkflowNode>,
): NodeParameterDiff[] {
  const changes: NodeParameterDiff[] = []

  for (const nodeName of nodeNames) {
    const before = beforeNodes[nodeName]
    const after = afterNodes[nodeName]
    if (!before || !after) continue

    for (const [path, beforeValue, afterValue] of changedLeafValues(before.parameters, after.parameters)) {
      changes.push({
        nodeName,
        path,
        before: redactDiffValue(path, beforeValue),
        after: redactDiffValue(path, afterValue),
      })
    }
  }

  return changes
}

function changedCredentials(
  nodeNames: string[],
  beforeNodes: Record<string, N8nWorkflowNode>,
  afterNodes: Record<string, N8nWorkflowNode>,
): NodeCredentialDiff[] {
  const changes: NodeCredentialDiff[] = []

  for (const nodeName of nodeNames) {
    const before = beforeNodes[nodeName]
    const after = afterNodes[nodeName]
    if (!before || !after) continue

    for (const credentialType of sortedUnion(
      Object.keys(before.credentials ?? {}),
      Object.keys(after.credentials ?? {}),
    )) {
      const beforeName = before.credentials?.[credentialType]?.name
      const afterName = after.credentials?.[credentialType]?.name
      if (beforeName !== afterName) {
        changes.push({
          nodeName,
          credentialType,
          ...(beforeName ? { beforeName } : {}),
          ...(afterName ? { afterName } : {}),
        })
      }
    }
  }

  return changes
}

function changedRecordValues(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Array<[string, unknown, unknown]> {
  return sortedUnion(Object.keys(before), Object.keys(after))
    .map((key): [string, unknown, unknown] => [key, before[key], after[key]])
    .filter(([, beforeValue, afterValue]) => stableStringify(beforeValue) !== stableStringify(afterValue))
}

function changedLeafValues(before: unknown, after: unknown, prefix = ""): Array<[string, unknown, unknown]> {
  if (stableStringify(before) === stableStringify(after)) return []

  if (isPlainRecord(before) && isPlainRecord(after)) {
    return sortedUnion(Object.keys(before), Object.keys(after)).flatMap((key) =>
      changedLeafValues(before[key], after[key], appendPath(prefix, key)),
    )
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length)
    const changes: Array<[string, unknown, unknown]> = []

    for (let index = 0; index < length; index += 1) {
      changes.push(...changedLeafValues(before[index], after[index], appendPath(prefix, String(index))))
    }

    return changes
  }

  return [[prefix, before, after]]
}

function appendPath(prefix: string, key: string): string {
  return prefix ? `${prefix}.${key}` : key
}

function redactDiffValue(path: string, value: unknown): unknown {
  const lastNamedSegment = [...path.split(".")].reverse().find((segment) => !/^\d+$/.test(segment)) ?? ""
  const normalized = lastNamedSegment.replace(/[\s_-]/g, "").toLowerCase()
  if (secretDiffKeys.has(normalized)) {
    return "[REDACTED]"
  }

  return redactSecrets(value)
}

function sortedUnion(left: string[], right: string[]): string[] {
  return [...new Set([...left, ...right])].sort((a, b) => a.localeCompare(b))
}

function stableStringify(value: unknown): string {
  return (
    JSON.stringify(value, (_key, child) => {
      if (!isPlainRecord(child)) return child

      return Object.fromEntries(Object.entries(child).sort(([left], [right]) => left.localeCompare(right)))
    }) ?? "undefined"
  )
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
