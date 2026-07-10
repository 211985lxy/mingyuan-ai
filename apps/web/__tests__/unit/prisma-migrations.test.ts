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

  it("creates the AimExecutionTrace table for a clean database", () => {
    const appRoot = path.resolve(__dirname, "../..")
    const schema = readFileSync(path.join(appRoot, "prisma/schema.prisma"), "utf8")

    expect(schema).toContain("model AimExecutionTrace")

    const migrationsRoot = path.join(appRoot, "prisma/migrations")
    const migrationSql = readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readFileSync(path.join(migrationsRoot, entry.name, "migration.sql"), "utf8"))
      .join("\n")

    expect(migrationSql).toContain("CREATE TABLE `AimExecutionTrace`")
  })

  it("creates the AgentMethodology table and preserves production text widths", () => {
    const appRoot = path.resolve(__dirname, "../..")
    const schema = readFileSync(path.join(appRoot, "prisma/schema.prisma"), "utf8")
    const migrationsRoot = path.join(appRoot, "prisma/migrations")
    const migrationSql = readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readFileSync(path.join(migrationsRoot, entry.name, "migration.sql"), "utf8"))
      .join("\n")

    expect(schema).toContain("model AgentMethodology")
    expect(schema).toMatch(/topicTitle\s+String\?\s+@db\.Text/)
    expect(schema).toMatch(/hotTopic\s+String\?\s+@db\.Text/)
    expect(migrationSql).toContain("CREATE TABLE `AgentMethodology`")
  })

  it("creates the AimRunEvent table for user adoption signals", () => {
    const appRoot = path.resolve(__dirname, "../..")
    const schema = readFileSync(path.join(appRoot, "prisma/schema.prisma"), "utf8")
    const migrationsRoot = path.join(appRoot, "prisma/migrations")
    const migrationSql = readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readFileSync(path.join(migrationsRoot, entry.name, "migration.sql"), "utf8"))
      .join("\n")

    expect(schema).toContain("model AimRunEvent")
    expect(migrationSql).toContain("CREATE TABLE `AimRunEvent`")
    expect(migrationSql).toContain("FOREIGN KEY (`userId`) REFERENCES `User`(`id`)")
  })
})
