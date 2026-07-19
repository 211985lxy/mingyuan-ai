import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const WEB_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
const DEFAULT_CONTRACT = resolve(WEB_ROOT, "prisma", "production-schema-contract.json")

export function parseMysqlUrl(databaseUrl) {
  const url = new URL(databaseUrl)
  if (!["mysql:", "mariadb:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use mysql:// or mariadb://")
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""))
  if (!database) throw new Error("DATABASE_URL must include a database name")

  return {
    host: url.hostname,
    port: url.port || "3306",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  }
}

function assertSchemaIdentifier(value) {
  if (!/^[A-Za-z0-9_]+$/.test(value)) throw new Error(`Invalid schema identifier: ${value}`)
}

function runMysql(connection, query) {
  const mysqlBin = process.env.MYSQL_BIN || "mysql"
  const args = ["--protocol=TCP", "--batch", "--skip-column-names", "--host", connection.host, "--port", connection.port, "--user", connection.user]
  args.push(connection.database, "--execute", query)
  try {
    return execFileSync(mysqlBin, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, MYSQL_PWD: connection.password },
    })
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`MySQL client not found: set MYSQL_BIN or install mysql client (${mysqlBin})`)
    }
    throw error
  }
}

export function findContractViolations(contract, tableColumns) {
  const violations = []
  for (const table of contract.tables) {
    const columns = tableColumns.get(table.name)
    if (!columns) {
      violations.push(`missing table ${table.name}`)
      continue
    }
    for (const column of table.columns) {
      if (!columns.has(column)) violations.push(`missing column ${table.name}.${column}`)
    }
  }
  return violations
}

export function verifySchema({ databaseUrl, contractPath = DEFAULT_CONTRACT }) {
  const contract = JSON.parse(readFileSync(contractPath, "utf8"))
  if (!Array.isArray(contract.tables) || contract.tables.length === 0) {
    throw new Error("Schema contract must define at least one table")
  }

  const connection = parseMysqlUrl(databaseUrl)
  const tableColumns = new Map()
  for (const table of contract.tables) {
    assertSchemaIdentifier(table.name)
    const output = runMysql(connection, `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table.name}'`)
    const columns = new Set(output.split(/\r?\n/).filter(Boolean).map((line) => line.split("\t", 1)[0]))
    if (columns.size > 0) tableColumns.set(table.name, columns)
  }

  return findContractViolations(contract, tableColumns)
}

function main() {
  const contractPath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_CONTRACT
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error("DATABASE_URL is required for schema verification")

  const violations = verifySchema({ databaseUrl, contractPath })
  if (violations.length > 0) {
    console.error("Production schema contract failed:")
    for (const violation of violations) console.error(`  - ${violation}`)
    process.exit(1)
  }

  console.log(`production-schema-contract-ok tables=${JSON.parse(readFileSync(contractPath, "utf8")).tables.length}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
