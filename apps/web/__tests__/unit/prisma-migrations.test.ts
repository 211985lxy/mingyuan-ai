import { existsSync, readFileSync, readdirSync } from "fs"
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

  it("creates OutcomeAttribution for per-event business attribution (WP-3)", () => {
    const schema = readPrismaSchema()
    const migrationSql = readMigrationSql()

    expect(schema).toContain("model OutcomeAttribution")
    expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS `OutcomeAttribution`")
    expect(migrationSql).toContain("UNIQUE INDEX `OutcomeAttribution_externalLeadId_key`")
  })

  it("owns phase 14 schema changes in Prisma migrations only", () => {
    const migrationSql = readFileSync(
      path.join(
        appRoot,
        "prisma/migrations/20260713113000_consolidate_phase14_schema/migration.sql",
      ),
      "utf8",
    )

    expect(migrationSql).toContain("information_schema.COLUMNS")
    expect(migrationSql).toContain("ContentGenerationRun_topicSelectionId_idx")
    expect(migrationSql).toContain("Script_topicSelectionId_idx")
    expect(existsSync(path.join(appRoot, "src/app/api/admin/migrate/route.ts"))).toBe(false)
  })

  it("does not provide a fallback database URL", () => {
    const prismaConfig = readFileSync(path.join(appRoot, "prisma.config.ts"), "utf8")

    expect(prismaConfig).toContain('url: process.env["DATABASE_URL"]')
    expect(prismaConfig).not.toContain("changethis")
  })

  it("requires backup evidence before retiring production media data", () => {
    const preflight = readFileSync(
      path.join(appRoot, "scripts/check-retired-media-data.mjs"),
      "utf8",
    )
    const deployWorkflow = readFileSync(
      path.join(appRoot, "../../.github/workflows/deploy.yml"),
      "utf8",
    )

    expect(preflight).toContain("RETIRED_MEDIA_BACKUP_REFERENCE")
    expect(deployWorkflow).toContain(
      "RETIRED_MEDIA_BACKUP_REFERENCE: ${{ secrets.RETIRED_MEDIA_BACKUP_REFERENCE }}",
    )
    expect(deployWorkflow).toContain("run: pnpm security:audit")
  })

  it("repairs the known empty authVideoUrl production drift without breaking fresh databases", () => {
    const preflight = readFileSync(
      path.join(appRoot, "scripts/check-retired-media-data.mjs"),
      "utf8",
    )
    const repair = readFileSync(
      path.join(
        appRoot,
        "prisma/migrations/20260717160000_finish_retired_auth_video_column/migration.sql",
      ),
      "utf8",
    )

    expect(preflight).toContain("column:User.authVideoUrl")
    expect(preflight).toContain("Known authVideoUrl repair drift preflight passed.")
    expect(repair).toContain("information_schema`.`COLUMNS")
    expect(repair).toContain("ALTER TABLE `User` DROP COLUMN `authVideoUrl`")
    expect(repair).toContain("PREPARE drop_auth_video_column_statement")
  })
})
