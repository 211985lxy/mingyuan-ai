import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseMysqlUrl } from "./verify-production-schema.mjs"

export const PRODUCTION_SCHEMA_PATCHES = [
  "ALTER TABLE `User` ADD COLUMN IF NOT EXISTS `authVideoUrl` VARCHAR(191) NULL",
]

function runMysql(connection, query) {
  const args = ["--protocol=TCP", "--host", connection.host, "--port", connection.port, "--user", connection.user]
  if (connection.password) args.push(`--password=${connection.password}`)
  args.push(connection.database, "--execute", query)
  execFileSync(process.env.MYSQL_BIN || "mysql", args, { stdio: ["ignore", "pipe", "pipe"] })
}

function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required")
  const connection = parseMysqlUrl(process.env.DATABASE_URL)
  for (const query of PRODUCTION_SCHEMA_PATCHES) runMysql(connection, query)
  console.log(`production-schema-patches-ok count=${PRODUCTION_SCHEMA_PATCHES.length}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
