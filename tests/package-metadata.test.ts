import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T
}

describe("package metadata", () => {
  it("declares v1 release-candidate metadata", async () => {
    const pkg = await readJson<{
      version: string
      description: string
      repository?: { type?: string; url?: string }
      bugs?: { url?: string }
      homepage?: string
      engines?: { node?: string }
      files?: string[]
      scripts?: Record<string, string>
    }>("package.json")

    expect(pkg.version).toBe("1.0.0")
    expect(pkg.description).toBe(
      "OpenCode plugin for creating, iterating, validating, and operating managed n8n workflows.",
    )
    expect(pkg.repository).toEqual({
      type: "git",
      url: "git+https://github.com/Drew1811266/OCN8N.git",
    })
    expect(pkg.bugs).toEqual({ url: "https://github.com/Drew1811266/OCN8N/issues" })
    expect(pkg.homepage).toBe("https://github.com/Drew1811266/OCN8N#readme")
    expect(pkg.engines?.node).toBe(">=20")
    expect(pkg.files).toEqual(["dist", "README.md", "CHANGELOG.md", "docs", "examples", "package.json"])
    expect(pkg.scripts?.["package:check"]).toBe("node scripts/check-package-files.mjs")
  })

  it("keeps package-lock root version in sync", async () => {
    const lock = await readJson<{ version: string; packages: Record<string, { version?: string }> }>(
      "package-lock.json",
    )

    expect(lock.version).toBe("1.0.0")
    expect(lock.packages[""].version).toBe("1.0.0")
  })
})
