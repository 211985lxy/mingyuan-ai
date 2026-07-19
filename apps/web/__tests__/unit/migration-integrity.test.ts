import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { findMigrationIntegrityViolations } from "../../scripts/check-migration-integrity.mjs"

const appRoot = resolve(__dirname, "../..")

describe("migration integrity policy", () => {
  it("accepts the committed baseline and production schema contract", () => {
    const baselineMigrations = JSON.parse(
      readFileSync(resolve(appRoot, "prisma/baseline/migrations.json"), "utf8"),
    )
    const migrationDirectories = readdirSync(resolve(appRoot, "prisma/migrations"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    const schemaContract = JSON.parse(
      readFileSync(resolve(appRoot, "prisma/production-schema-contract.json"), "utf8"),
    )

    expect(
      findMigrationIntegrityViolations({ baselineMigrations, migrationDirectories, schemaContract }),
    ).toEqual([])
  })

  it("rejects a baseline that is not a migration history prefix", () => {
    expect(
      findMigrationIntegrityViolations({
        baselineMigrations: ["20260702"],
        migrationDirectories: ["20260701", "20260702"],
        schemaContract: { tables: [] },
      }),
    ).toContain("baseline migrations must be an ordered prefix of the migration history")
  })

  it("rejects retired columns in the production schema contract", () => {
    expect(
      findMigrationIntegrityViolations({
        baselineMigrations: [],
        migrationDirectories: [],
        schemaContract: { tables: [{ name: "User", columns: ["authVideoUrl"] }] },
      }),
    ).toContain("production schema contract requires retired column User.authVideoUrl")
  })
})
