import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const appRoot = path.resolve(__dirname, "../..")

// The five legacy account-level content models that must gain an optional
// project scope in this task. Each entry maps to the prisma file that owns it.
const LEGACY_PROJECT_MODELS: Record<string, string> = {
  CompetitorAnalysis: "competitor.prisma",
  WatchAccount: "competitor.prisma",
  VideoCopyExtraction: "competitor.prisma",
  ContentGenerationRun: "content.prisma",
  Script: "content.prisma",
}

/**
 * Extract the text of a single model block from a prisma schema file.
 * The block runs from its `model <Name> {` marker to the next top-level
 * `model ` declaration (model files are prisma-formatted, so declarations
 * always start at column 0 on their own line).
 */
function modelBlock(schemaText: string, modelName: string): string {
  const startMarker = `model ${modelName} {`
  const start = schemaText.indexOf(startMarker)
  if (start === -1) return ""
  const tail = schemaText.slice(start + startMarker.length)
  const nextModel = tail.search(/\nmodel\s+\w+\s*\{/)
  return nextModel === -1 ? tail : tail.slice(0, nextModel)
}

describe("legacy content project schema", () => {
  for (const [modelName, file] of Object.entries(LEGACY_PROJECT_MODELS)) {
    it(`${modelName} has a nullable projectId, a ClientProject relation and a [userId, projectId, ...] index`, () => {
      const schema = readFileSync(path.resolve(appRoot, "prisma", file), "utf8")
      const block = modelBlock(schema, modelName)

      expect(block, `model ${modelName} not found in ${file}`).not.toBe("")
      expect(block, `${modelName} is missing a projectId column`).toMatch(/projectId\s+String\?/)
      expect(
        block,
        `${modelName} is missing the ClientProject relation on projectId`,
      ).toMatch(/project\s+ClientProject\?\s+@relation\(fields:\s*\[projectId\]/)
      expect(
        block,
        `${modelName} is missing a [userId, projectId, ...] index`,
      ).toMatch(/@@index\(\[userId,\s*projectId/)
    })
  }

  it("production schema contract includes projectId on all five legacy content tables", () => {
    const contract = JSON.parse(
      readFileSync(path.resolve(appRoot, "prisma/production-schema-contract.json"), "utf8"),
    ) as { tables: Array<{ name: string; columns: string[] }> }
    const byName = new Map(contract.tables.map((table) => [table.name, table.columns]))

    for (const modelName of Object.keys(LEGACY_PROJECT_MODELS)) {
      expect(byName.has(modelName), `missing production schema contract table ${modelName}`).toBe(true)
      expect(byName.get(modelName), `contract table ${modelName} missing projectId`).toEqual(
        expect.arrayContaining(["projectId"]),
      )
    }
  })
})
