import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createConnection, type RowDataPacket } from "mysql2/promise"

const WEB_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
const BASELINE_SQL = resolve(WEB_ROOT, "prisma/baseline/current.sql")
const BASELINE_MIGRATIONS = resolve(WEB_ROOT, "prisma/baseline/migrations.json")
const PRODUCTION_SCHEMA_CONTRACT = resolve(WEB_ROOT, "prisma/production-schema-contract.json")

export function requireTestDatabaseUrl(databaseUrl?: string): string {
  const value = databaseUrl?.trim()
  if (!value) throw new Error("TEST_DATABASE_URL is required")

  const url = new URL(value)
  if (!["mysql:", "mariadb:"].includes(url.protocol)) {
    throw new Error("TEST_DATABASE_URL must use mysql:// or mariadb://")
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""))
  if (!/(^|[_-])test([_-]|$)/i.test(database)) {
    throw new Error(`Refusing to reset database without a test segment: ${database}`)
  }
  return value
}

async function connect(databaseUrl: string, multipleStatements = false) {
  const url = new URL(databaseUrl)
  return createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    connectTimeout: 5000,
    multipleStatements,
  })
}

async function applyBaseline(databaseUrl: string): Promise<void> {
  const connection = await connect(databaseUrl, true)
  try {
    await connection.query(readFileSync(BASELINE_SQL, "utf8"))
  } finally {
    await connection.end()
  }
}

export async function resetE2eDatabase(databaseUrl = process.env.TEST_DATABASE_URL): Promise<void> {
  const safeUrl = requireTestDatabaseUrl(databaseUrl)
  const connection = await connect(safeUrl)
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0")
    const [views] = await connection.query<RowDataPacket[]>("SHOW FULL TABLES WHERE Table_type = 'VIEW'")
    for (const row of views) {
      await connection.query("DROP VIEW IF EXISTS ??", [String(Object.values(row)[0])])
    }
    const [tables] = await connection.query<RowDataPacket[]>("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")
    for (const row of tables) {
      await connection.query("DROP TABLE IF EXISTS ??", [String(Object.values(row)[0])])
    }
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1").catch(() => undefined)
    await connection.end()
  }
}

async function verifySchemaContract(databaseUrl: string): Promise<void> {
  const contract = JSON.parse(readFileSync(PRODUCTION_SCHEMA_CONTRACT, "utf8")) as {
    tables: Array<{ name: string; columns: string[] }>
  }
  const connection = await connect(databaseUrl)
  try {
    for (const table of contract.tables) {
      const [rows] = await connection.query<RowDataPacket[]>(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
        [table.name],
      )
      const columns = new Set(rows.map((row) => String(row.COLUMN_NAME)))
      if (columns.size === 0) throw new Error(`Schema contract missing table ${table.name}`)
      for (const column of table.columns) {
        if (!columns.has(column)) throw new Error(`Schema contract missing column ${table.name}.${column}`)
      }
    }

    const [retiredTables] = await connection.query<RowDataPacket[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('VideoTask', 'VideoProductionPlan', 'VideoPackagingTemplate', 'Avatar')",
    )
    if (retiredTables.length > 0) {
      throw new Error(`Retired media tables remain: ${retiredTables.map((row) => row.TABLE_NAME).join(", ")}`)
    }
  } finally {
    await connection.end()
  }
}

function runPrisma(args: string[], databaseUrl: string): void {
  execFileSync("pnpm", ["exec", "prisma", ...args], {
    cwd: WEB_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  })
}

export async function prepareE2eDatabase(databaseUrl = process.env.TEST_DATABASE_URL): Promise<void> {
  const safeUrl = requireTestDatabaseUrl(databaseUrl)
  await resetE2eDatabase(safeUrl)
  await applyBaseline(safeUrl)

  const baselineMigrations = JSON.parse(readFileSync(BASELINE_MIGRATIONS, "utf8")) as string[]
  for (const migration of baselineMigrations) {
    runPrisma(["migrate", "resolve", "--applied", migration], safeUrl)
  }

  runPrisma(["migrate", "deploy"], safeUrl)
  await verifySchemaContract(safeUrl)
}

async function main() {
  const action = process.argv[2]
  if (action === "prepare") await prepareE2eDatabase()
  else if (action === "reset") await resetE2eDatabase()
  else throw new Error("Usage: tsx scripts/e2e-database.ts <prepare|reset>")
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
