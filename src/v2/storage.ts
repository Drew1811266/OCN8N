import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

export type V2WriteTextOptions = {
  exclusive?: boolean
}

export type V2ArtifactStorage = {
  readText(filePath: string): Promise<string | undefined>
  writeText(filePath: string, content: string, options?: V2WriteTextOptions): Promise<void>
  listNames(dirPath: string): Promise<string[]>
}

export class V2FileArtifactStorage implements V2ArtifactStorage {
  async readText(filePath: string): Promise<string | undefined> {
    try {
      return await readFile(filePath, "utf8")
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return undefined
      }

      throw error
    }
  }

  async writeText(filePath: string, content: string, options: V2WriteTextOptions = {}): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, content, {
      encoding: "utf8",
      flag: options.exclusive ? "wx" : "w",
    })
  }

  async listNames(dirPath: string): Promise<string[]> {
    try {
      return await readdir(dirPath)
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return []
      }

      throw error
    }
  }
}

export function isStorageAlreadyExistsError(error: unknown): boolean {
  return isNodeError(error) && error.code === "EEXIST"
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
