import { access } from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import process from "node:process"

const composeFile = process.env.N8N_E2E_DOCKER_COMPOSE_FILE || "docker-compose.e2e.yml"
const projectName = process.env.N8N_E2E_PROJECT || "ocn8n-e2e"
const port = process.env.N8N_E2E_PORT || "5678"
const baseAppUrl = process.env.N8N_E2E_APP_URL || `http://127.0.0.1:${port}`
const baseUrl = process.env.N8N_E2E_BASE_URL || `${baseAppUrl}/api/v1`
const mcpUrl = process.env.N8N_E2E_MCP_URL || `${baseAppUrl}/mcp`
const keepAlive = process.env.N8N_E2E_KEEP_ALIVE === "1"
const removeVolumes = process.env.N8N_E2E_REMOVE_VOLUMES === "1"

const env = {
  ...process.env,
  N8N_E2E_DOCKER_COMPOSE_FILE: composeFile,
  N8N_E2E_PROJECT: projectName,
  N8N_E2E_PORT: port,
  N8N_E2E_APP_URL: baseAppUrl,
  N8N_E2E_BASE_URL: baseUrl,
  N8N_E2E_MCP_URL: mcpUrl,
}

let stackTouched = false

main().catch(async (error) => {
  if (error instanceof MissingApiKeyError) {
    console.error(redact(error.message))
    console.error("")
    console.error(`n8n E2E stack kept running at ${baseAppUrl} so you can create a test API key.`)
    console.error(`Stop it with: docker compose -p ${projectName} -f ${composeFile} down`)
    console.error(`Remove its data with: docker compose -p ${projectName} -f ${composeFile} down --volumes`)
    process.exit(1)
  }

  console.error(redact(String(error?.stack || error?.message || error)))

  if (stackTouched && !keepAlive) {
    await compose(["down", "--volumes", "--remove-orphans"], { allowFailure: true, printOutput: true })
  } else if (stackTouched) {
    console.error(`n8n E2E stack kept running at ${baseAppUrl}`)
  }

  process.exit(1)
})

async function main() {
  await assertDockerAvailable()

  stackTouched = true
  await compose(["up", "-d", "--wait"], { printOutput: true })
  await waitForN8n()
  await assertApiKeyConfigured()
  await runVitest()

  if (!keepAlive) {
    await compose(successfulDownArgs(), { printOutput: true })
  } else {
    console.log(`n8n E2E stack kept running at ${baseAppUrl}`)
  }
}

async function assertDockerAvailable() {
  await run("docker", ["version"], {
    errorMessage: "Docker CLI or daemon is not available. Install Docker Desktop or ensure docker is on PATH and running.",
  })
  await run("docker", ["compose", "version"], {
    errorMessage: "Docker Compose is not available. Install Docker Compose v2 or update Docker Desktop.",
  })
}

async function waitForN8n() {
  const deadline = Date.now() + 120_000
  let lastError = ""

  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(baseAppUrl, 5_000)
      if (response.status < 500) {
        console.log(`n8n is reachable at ${baseAppUrl}`)
        return
      }
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = String(error?.message || error)
    }

    await delay(2_000)
  }

  await compose(["logs", "--tail", "120"], { allowFailure: true, printOutput: true })
  throw new Error(`n8n did not become ready within 120 seconds. Last error: ${lastError}`)
}

async function assertApiKeyConfigured() {
  if (!env.N8N_E2E_API_KEY) {
    throw new MissingApiKeyError(
      [
        "N8N_E2E_API_KEY is required for real API E2E.",
        `Open local n8n at ${baseAppUrl}, create a test API key, then rerun:`,
        "N8N_E2E_API_KEY=<key> npm run test:e2e",
      ].join("\n"),
    )
  }
}

class MissingApiKeyError extends Error {
  constructor(message) {
    super(message)
    this.name = "MissingApiKeyError"
  }
}

function successfulDownArgs() {
  const args = ["down", "--remove-orphans"]

  if (removeVolumes) {
    args.splice(1, 0, "--volumes")
  }

  return args
}

async function runVitest() {
  if (await commandAvailable("npm", ["--version"])) {
    await run("npm", ["run", "test:e2e:vitest"], {
      env,
      errorMessage: "Vitest E2E suite failed.",
      printOutput: true,
    })
    return
  }

  const localVitest = path.join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "vitest.cmd" : "vitest",
  )
  if (!(await fileExists(localVitest))) {
    throw new Error(
      [
        "npm is unavailable and the local Vitest binary was not found.",
        `Expected local Vitest at ${localVitest}`,
        "Install dependencies or run through a package manager that provides npm.",
      ].join("\n"),
    )
  }

  console.log("npm is unavailable; running local Vitest binary directly.")
  await run(localVitest, ["run", "--config", "vitest.e2e.config.ts"], {
    env,
    errorMessage: "Vitest E2E suite failed.",
    printOutput: true,
  })
}

async function compose(args, options = {}) {
  await run("docker", ["compose", "-p", projectName, "-f", composeFile, ...args], {
    ...options,
    env,
    errorMessage: `Docker Compose command failed: docker compose -p ${projectName} -f ${composeFile} ${args.join(" ")}`,
  })
}

async function run(command, args, options = {}) {
  const result = await collectCommand(command, args, options.env || process.env)
  const output = formatCommandOutput(result)

  if (options.printOutput && output && (result.exitCode === 0 || options.allowFailure)) {
    writeRedactedOutput(output)
  }

  if (result.exitCode !== 0 && !options.allowFailure) {
    throw new Error(
      [
        options.errorMessage || `${command} ${args.join(" ")} exited with ${result.exitCode}`,
        `Exit code: ${result.exitCode}`,
        output,
      ]
        .filter(Boolean)
        .join("\n"),
    )
  }

  return result
}

async function commandAvailable(command, args) {
  const result = await collectCommand(command, args, process.env)

  return result.exitCode === 0
}

function collectCommand(command, args, commandEnv) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: commandEnv,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""

    child.stdout?.setEncoding("utf8")
    child.stderr?.setEncoding("utf8")
    child.stdout?.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr?.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", (error) => {
      stderr += error.message
      resolve({ exitCode: 127, stdout, stderr })
    })
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr })
    })
  })
}

function formatCommandOutput(result) {
  const sections = []

  if (result.stdout.trim()) {
    sections.push(result.stdout.trimEnd())
  }
  if (result.stderr.trim()) {
    sections.push(result.stderr.trimEnd())
  }

  return sections.join("\n")
}

function writeRedactedOutput(output) {
  process.stderr.write(`${redact(output)}\n`)
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function redact(value) {
  return redactConfiguredSecretValues(value)
    .replace(
      /(["']?authorization["']?\s*:\s*)("Bearer\s+[^"]*"|'Bearer\s+[^']*'|Bearer\s+[^\s,}]+)/gi,
      (_match, prefix, rawValue) => {
        const quote = rawValue.startsWith("\"") ? "\"" : rawValue.startsWith("'") ? "'" : ""

        return `${prefix}${quote}Bearer [REDACTED]${quote}`
      },
    )
    .replace(
      /(["']?(?:apiKey|api[_-]?key|token|password|secret|N8N_E2E_API_KEY|N8N_E2E_MCP_TOKEN|X-N8N-API-KEY)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,}]+)/gi,
      (_match, prefix, rawValue) => {
        const quote = rawValue.startsWith("\"") ? "\"" : rawValue.startsWith("'") ? "'" : ""

        return `${prefix}${quote}[REDACTED]${quote}`
      },
    )
    .replace(/Authorization:\s*Bearer\s+[^\s]+/gi, "Authorization: Bearer [REDACTED]")
}

function redactConfiguredSecretValues(value) {
  return [env.N8N_E2E_API_KEY, env.N8N_E2E_MCP_TOKEN]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .reduce((output, secret) => {
      return output.replace(new RegExp(escapeRegExp(secret), "g"), "[REDACTED]")
    }, value)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
