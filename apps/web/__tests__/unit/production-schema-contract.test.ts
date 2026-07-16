import { describe, expect, it } from "vitest"
import { findContractViolations, parseMysqlUrl } from "../../scripts/verify-production-schema.mjs"

describe("production schema contract", () => {
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
