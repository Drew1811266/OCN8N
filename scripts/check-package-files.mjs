import { access, readFile } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
const requiredFiles = [
  "dist/index.js",
  "dist/index.d.ts",
  "README.md",
  "CHANGELOG.md",
  "docs/installation.md",
  "docs/configuration.md",
  "docs/credential-setup.md",
  "docs/operations.md",
  "docs/troubleshooting.md",
  "docs/release-checklist.md",
  "examples/opencode.local-n8n.json",
  "examples/opencode.n8n-cloud.json",
  "examples/opencode.mcp-token.json",
  "examples/opencode.credentials.json",
  "package.json",
]

const failures = []

for (const file of requiredFiles) {
  try {
    await access(path.join(root, file))
  } catch {
    failures.push(`Missing package file: ${file}`)
  }
}

if (pkg.main !== "./dist/index.js") {
  failures.push(`Expected package main ./dist/index.js, received ${pkg.main}`)
}

if (pkg.types !== "./dist/index.d.ts") {
  failures.push(`Expected package types ./dist/index.d.ts, received ${pkg.types}`)
}

if (pkg.exports?.["."]?.default !== "./dist/index.js") {
  failures.push('Expected exports["."].default to point at ./dist/index.js')
}

if (pkg.exports?.["."]?.types !== "./dist/index.d.ts") {
  failures.push('Expected exports["."].types to point at ./dist/index.d.ts')
}

for (const entry of ["dist", "README.md", "CHANGELOG.md", "docs", "examples", "package.json"]) {
  if (!pkg.files?.includes(entry)) {
    failures.push(`package.json files is missing ${entry}`)
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"))
  process.exit(1)
}

console.log("Package file boundary check passed.")
