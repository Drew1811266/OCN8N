const SECRET_KEYS = new Set([
  "apikey",
  "authorization",
  "token",
  "password",
  "secret",
  "clientsecret",
  "accesstoken",
  "refreshtoken",
])
const redactedValue = "[REDACTED]"
const secretAssignmentPattern =
  /\b(?:token|password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization)\s*[:=]\s*\S+/i

export function containsPlaintextSecret(value: unknown): boolean {
  return scanValue(value)
}

export function redactSecrets(value: unknown): unknown {
  return redactValue(value, undefined)
}

export function isPrivateNetworkUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    const host = normalizeUrlHost(url.hostname)

    if (host === "localhost" || host === "::1") {
      return true
    }

    const ipv4 = parseIpv4(host)
    if (!ipv4) {
      return false
    }

    const [first, second] = ipv4
    return (
      first === 10 ||
      first === 127 ||
      (first === 192 && second === 168) ||
      (first === 172 && second >= 16 && second <= 31)
    )
  } catch {
    return false
  }
}

function normalizeUrlHost(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, "")
  if (host.startsWith("[") && host.endsWith("]")) {
    return host.slice(1, -1)
  }

  return host
}

function scanValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(scanValue)
  }

  if (!value || typeof value !== "object") {
    return false
  }

  return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
    if (isSecretKey(key)) {
      return hasPlaintextString(child)
    }

    return scanValue(child)
  })
}

function isSecretKey(key: string): boolean {
  const normalized = key.replace(/[\s_-]/g, "").toLowerCase()
  return SECRET_KEYS.has(normalized)
}

function redactValue(value: unknown, key: string | undefined): unknown {
  if (key && isSecretKey(key)) {
    return redactedValue
  }

  if (typeof value === "string") {
    return isSecretString(value) ? redactedValue : value
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, undefined))
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        redactValue(childValue, childKey),
      ]),
    )
  }

  return value
}

function isSecretString(value: string): boolean {
  return (
    /\bBearer\s+[A-Za-z0-9._~+/=:-]+/i.test(value) ||
    /\bxox[baprs]-[A-Za-z0-9-]+/i.test(value) ||
    secretAssignmentPattern.test(value)
  )
}

function hasPlaintextString(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0
  }

  if (Array.isArray(value)) {
    return value.some(hasPlaintextString)
  }

  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasPlaintextString)
  }

  return false
}

function parseIpv4(host: string): [number, number, number, number] | undefined {
  const parts = host.split(".")
  if (parts.length !== 4) {
    return undefined
  }

  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return undefined
    }

    const value = Number(part)
    return value >= 0 && value <= 255 ? value : undefined
  })

  if (octets.some((octet) => octet === undefined)) {
    return undefined
  }

  return octets as [number, number, number, number]
}
