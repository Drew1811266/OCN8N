import { createHash } from "node:crypto"

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex")
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue)
  }

  if (!value || typeof value !== "object") {
    return value
  }

  const record = value as Record<string, unknown>
  return Object.keys(record)
    .sort()
    .reduce<Record<string, unknown>>((accumulator, key) => {
      accumulator[key] = sortValue(record[key])
      return accumulator
    }, {})
}
