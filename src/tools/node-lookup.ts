export type NodeTypeLookup =
  | string
  | {
      nodeId: string
      version?: number
      resource?: string
      operation?: string
      mode?: string
    }

export function extractNodeTypeLookups(searchResult: string): NodeTypeLookup[] {
  const jsonLookups: NodeTypeLookup[] = []
  const jsonRanges: Array<[number, number]> = []

  for (const candidate of parseJsonCandidates(searchResult)) {
    const lookups = collectNodeTypeLookups(candidate.value)
    if (lookups.length === 0) continue

    jsonLookups.push(...lookups)
    jsonRanges.push(candidate.range)
  }

  const searchableText = removeRanges(searchResult, jsonRanges)
  const textLookups = searchableText.match(/(?:@n8n\/)?n8n-nodes-[a-z0-9_-]+(?:\.[a-z0-9_-]+)+\b/gi) ?? []

  return dedupeNodeTypeLookups([...jsonLookups, ...textLookups]).slice(0, 20)
}

function parseJsonCandidates(input: string): Array<{ value: unknown; range: [number, number] }> {
  const candidates: Array<{ value: unknown; range: [number, number] }> = []

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (char !== "{" && char !== "[") continue

    const end = findJsonEnd(input, index)
    if (end === undefined) continue

    try {
      candidates.push({ value: JSON.parse(input.slice(index, end)), range: [index, end] })
      index = end - 1
    } catch {
      continue
    }
  }

  return candidates
}

function findJsonEnd(input: string, start: number): number | undefined {
  const stack: string[] = []
  let inString = false
  let escaped = false

  for (let index = start; index < input.length; index += 1) {
    const char = input[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === "\"") {
        inString = false
      }

      continue
    }

    if (char === "\"") {
      inString = true
      continue
    }

    if (char === "{") {
      stack.push("}")
      continue
    }

    if (char === "[") {
      stack.push("]")
      continue
    }

    if (char === "}" || char === "]") {
      if (stack.pop() !== char) return undefined
      if (stack.length === 0) return index + 1
    }
  }

  return undefined
}

function collectNodeTypeLookups(value: unknown): NodeTypeLookup[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectNodeTypeLookups)
  }

  if (!isRecord(value)) {
    return []
  }

  const lookups = Object.values(value).flatMap(collectNodeTypeLookups)
  if (typeof value.nodeId !== "string" || !isNodeId(value.nodeId)) {
    return lookups
  }

  const lookup: Exclude<NodeTypeLookup, string> = {
    nodeId: value.nodeId,
  }

  if (typeof value.version === "number") {
    lookup.version = value.version
  }

  if (typeof value.resource === "string") {
    lookup.resource = value.resource
  }

  if (typeof value.operation === "string") {
    lookup.operation = value.operation
  }

  if (typeof value.mode === "string") {
    lookup.mode = value.mode
  }

  return [lookup, ...lookups]
}

function removeRanges(input: string, ranges: Array<[number, number]>): string {
  if (ranges.length === 0) return input

  let output = ""
  let cursor = 0

  for (const [start, end] of mergeRanges(ranges)) {
    output += input.slice(cursor, start)
    output += " ".repeat(end - start)
    cursor = end
  }

  return output + input.slice(cursor)
}

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const sortedRanges = [...ranges].sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []

  for (const [start, end] of sortedRanges) {
    const previous = merged.at(-1)
    if (!previous || start > previous[1]) {
      merged.push([start, end])
      continue
    }

    previous[1] = Math.max(previous[1], end)
  }

  return merged
}

function dedupeNodeTypeLookups(lookups: NodeTypeLookup[]): NodeTypeLookup[] {
  const seen = new Set<string>()
  const deduped: NodeTypeLookup[] = []

  for (const lookup of lookups) {
    const key = nodeTypeLookupKey(lookup)
    if (seen.has(key)) continue

    seen.add(key)
    deduped.push(lookup)
  }

  return deduped
}

function nodeTypeLookupKey(lookup: NodeTypeLookup): string {
  if (typeof lookup === "string") {
    return `string:${lookup}`
  }

  return `object:${JSON.stringify(lookup)}`
}

function isNodeId(value: string): boolean {
  return /^(?:@n8n\/)?n8n-nodes-[a-z0-9_-]+(?:\.[a-z0-9_-]+)+$/i.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
