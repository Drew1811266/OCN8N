import { describe, expect, it } from "vitest"
import { N8nBuilderPlugin, createN8nBuilderPlugin } from "../src/index.js"

describe("plugin exports", () => {
  it("exports a plugin factory and default plugin function", () => {
    expect(typeof createN8nBuilderPlugin).toBe("function")
    expect(typeof N8nBuilderPlugin).toBe("function")
  })
})
