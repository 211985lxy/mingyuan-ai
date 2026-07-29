import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { findContractViolations, parseMysqlUrl } from "../../scripts/verify-production-schema.mjs"

describe("production schema contract", () => {
  it("covers the operating-system tables and structured verdict columns", () => {
    const contract = JSON.parse(
      readFileSync(
        path.resolve(__dirname, "../../prisma/production-schema-contract.json"),
        "utf8",
      ),
    ) as { tables: Array<{ name: string; columns: string[] }> }
    const byName = new Map(contract.tables.map((table) => [table.name, table.columns]))

    expect(byName.get("ContentOutcome")).toEqual(
      expect.arrayContaining(["userVerdict", "verdictNote", "verdictCode"]),
    )
    expect(byName.get("AssetCandidate")).toEqual(
      expect.arrayContaining(["promotedAt", "promotedEntryId"]),
    )
    for (const table of [
      "TaskEfficiencyBaseline",
      "GovernanceAssignment",
      "ApprovalDecision",
      "ReviewCycle",
      "ReviewAction",
      "LearningCandidate",
    ]) {
      expect(byName.has(table), `missing production schema contract table ${table}`).toBe(true)
    }
  })

  it("parses encoded MySQL connection details", () => {
    expect(parseMysqlUrl("mysql://name%40company:pass%2Fword@db.example.com:3307/aim_prod")).toEqual({
      host: "db.example.com",
      port: "3307",
      user: "name@company",
      password: "pass/word",
      database: "aim_prod",
    })
  })

  it("reports missing tables and columns precisely", () => {
    const violations = findContractViolations(
      {
        tables: [
          { name: "AimGeneration", columns: ["id", "taskSpec"] },
          { name: "ContentOutcome", columns: ["id"] },
        ],
      },
      new Map([["AimGeneration", new Set(["id"])]]),
    )

    expect(violations).toEqual(["missing column AimGeneration.taskSpec", "missing table ContentOutcome"])
  })
})
