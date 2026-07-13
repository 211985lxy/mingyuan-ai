import { readFileSync, readdirSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

const appRoot = path.resolve(__dirname, "../..")

function readPrismaSchema() {
  const prismaRoot = path.join(appRoot, "prisma")
  return readdirSync(prismaRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".prisma"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => readFileSync(path.join(prismaRoot, entry.name), "utf8"))
    .join("\n")
}

function readMigrationSql() {
  const migrationsRoot = path.join(appRoot, "prisma/migrations")
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readFileSync(path.join(migrationsRoot, entry.name, "migration.sql"), "utf8"))
    .join("\n")
}

describe("Prisma migrations", () => {
  it("creates the WatchAccount table when the model exists", () => {
    const schema = readPrismaSchema()

    expect(schema).toContain("model WatchAccount")

    const migrationSql = readMigrationSql()

    expect(migrationSql).toContain("CREATE TABLE `WatchAccount`")
  })

  it("creates the MarketHotSnapshot table when the model exists", () => {
    const schema = readPrismaSchema()

    expect(schema).toContain("model MarketHotSnapshot")

    const migrationSql = readMigrationSql()

    expect(migrationSql).toContain("CREATE TABLE `MarketHotSnapshot`")
  })

  it("creates the AimRunSnapshot table when the model exists", () => {
    const schema = readPrismaSchema()

    expect(schema).toContain("model AimRunSnapshot")

    const migrationSql = readMigrationSql()

    expect(migrationSql).toContain("CREATE TABLE `AimRunSnapshot`")
  })

  it("creates the AimExecutionTrace table for a clean database", () => {
    const schema = readPrismaSchema()

    expect(schema).toContain("model AimExecutionTrace")

    const migrationSql = readMigrationSql()

    expect(migrationSql).toContain("CREATE TABLE `AimExecutionTrace`")
  })

  it("creates the AgentMethodology table and preserves production text widths", () => {
    const schema = readPrismaSchema()
    const migrationSql = readMigrationSql()

    expect(schema).toContain("model AgentMethodology")
    expect(schema).toMatch(/topicTitle\s+String\?\s+@db\.Text/)
    expect(schema).toMatch(/hotTopic\s+String\?\s+@db\.Text/)
    expect(migrationSql).toContain("CREATE TABLE `AgentMethodology`")
  })

  it("creates the AimRunEvent table for user adoption signals", () => {
    const schema = readPrismaSchema()
    const migrationSql = readMigrationSql()

    expect(schema).toContain("model AimRunEvent")
    expect(migrationSql).toContain("CREATE TABLE `AimRunEvent`")
    expect(migrationSql).toContain("FOREIGN KEY (`userId`) REFERENCES `User`(`id`)")
  })
})
