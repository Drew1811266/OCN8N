const SECRET_KEYS = new Set(["apikey", "token", "password", "secret", "clientsecret", "accesstoken", "refreshtoken"])

export function containsPlaintextSecret(value: unknown): boolean {
  return scanValue(value)
}

export function isPrivateNetworkUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    const host = url.hostname.toLowerCase().replace(/\.$/, "")

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
