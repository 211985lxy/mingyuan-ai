import { readFileSync, readdirSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

describe("Prisma migrations", () => {
  it("creates the WatchAccount table when the model exists", () => {
    const appRoot = path.resolve(__dirname, "../..")
    const schema = readFileSync(path.join(appRoot, "prisma/schema.prisma"), "utf8")

    expect(schema).toContain("model WatchAccount")

    const migrationsRoot = path.join(appRoot, "prisma/migrations")
    const migrationSql = readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        readFileSync(path.join(migrationsRoot, entry.name, "migration.sql"), "utf8"),
      )
      .join("\n")

    expect(migrationSql).toContain("CREATE TABLE `WatchAccount`")
  })

  it("creates the MarketHotSnapshot table when the model exists", () => {
    const appRoot = path.resolve(__dirname, "../..")
    const schema = readFileSync(path.join(appRoot, "prisma/schema.prisma"), "utf8")

    expect(schema).toContain("model MarketHotSnapshot")

    const migrationsRoot = path.join(appRoot, "prisma/migrations")
    const migrationSql = readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        readFileSync(path.join(migrationsRoot, entry.name, "migration.sql"), "utf8"),
      )
      .join("\n")

    expect(migrationSql).toContain("CREATE TABLE `MarketHotSnapshot`")
  })

  it("creates the AimRunSnapshot table when the model exists", () => {
    const appRoot = path.resolve(__dirname, "../..")
    const schema = readFileSync(path.join(appRoot, "prisma/schema.prisma"), "utf8")

    expect(schema).toContain("model AimRunSnapshot")

    const migrationsRoot = path.join(appRoot, "prisma/migrations")
    const migrationSql = readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        readFileSync(path.join(migrationsRoot, entry.name, "migration.sql"), "utf8"),
      )
      .join("\n")

    expect(migrationSql).toContain("CREATE TABLE `AimRunSnapshot`")
  })
})
