import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const WEB_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
const BASELINE_MIGRATIONS_PATH = resolve(WEB_ROOT, "prisma", "baseline", "migrations.json")
const MIGRATIONS_PATH = resolve(WEB_ROOT, "prisma", "migrations")
const PRODUCTION_SCHEMA_CONTRACT_PATH = resolve(WEB_ROOT, "prisma", "production-schema-contract.json")

const RETIRED_SCHEMA_COLUMNS = [{ table: "User", column: "authVideoUrl" }]

export function findMigrationIntegrityViolations({ baselineMigrations, migrationDirectories, schemaContract }) {
  const violations = []
  const seenMigrations = new Set()

  for (const migration of baselineMigrations) {
    if (seenMigrations.has(migration)) violations.push(`baseline repeats migration ${migration}`)
    seenMigrations.add(migration)
  }

  for (const migration of baselineMigrations) {
    if (!migrationDirectories.includes(migration)) {
      violations.push(`baseline references missing migration ${migration}`)
    }
  }

  const expectedBaseline = migrationDirectories.slice(0, baselineMigrations.length)
  if (expectedBaseline.join("\n") !== baselineMigrations.join("\n")) {
    violations.push("baseline migrations must be an ordered prefix of the migration history")
  }

  for (const retiredColumn of RETIRED_SCHEMA_COLUMNS) {
    const table = schemaContract.tables?.find((item) => item.name === retiredColumn.table)
    if (table?.columns?.includes(retiredColumn.column)) {
      violations.push(`production schema contract requires retired column ${retiredColumn.table}.${retiredColumn.column}`)
    }
  }

  return violations
}

function readMigrationDirectories() {
  return readdirSync(MIGRATIONS_PATH, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

function main() {
  const baselineMigrations = JSON.parse(readFileSync(BASELINE_MIGRATIONS_PATH, "utf8"))
  const migrationDirectories = readMigrationDirectories()
  const schemaContract = JSON.parse(readFileSync(PRODUCTION_SCHEMA_CONTRACT_PATH, "utf8"))
  const violations = findMigrationIntegrityViolations({
    baselineMigrations,
    migrationDirectories,
    schemaContract,
  })

  if (violations.length > 0) {
    console.error("Migration integrity policy failed:")
    for (const violation of violations) console.error(`  - ${violation}`)
    process.exitCode = 1
    return
  }

  console.log(`migration-integrity-ok baseline=${baselineMigrations.length} migrations=${migrationDirectories.length}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
