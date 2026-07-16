import { createReadStream } from "node:fs"
import { resolve } from "node:path"
import { pipeline } from "node:stream/promises"
import { spawn } from "node:child_process"
import { createGunzip } from "node:zlib"

const databaseUrl = process.env.TEST_DATABASE_URL?.trim()
const archive = process.argv[2] ? resolve(process.argv[2]) : ""
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required")
if (!archive.endsWith(".sql.gz")) throw new Error("Pass a .sql.gz backup path")

const url = new URL(databaseUrl)
const database = url.pathname.replace(/^\//, "")
if (!new Set(["mysql:", "mariadb:"]).has(url.protocol)) throw new Error("TEST_DATABASE_URL must use MySQL or MariaDB")
if (!/(^|[-_])test($|[-_])|_test$/i.test(database)) throw new Error("Refusing to restore into a non-test database")

const child = spawn(process.env.MYSQL_BIN || "mysql", [
  `--host=${url.hostname}`,
  `--port=${url.port || "3306"}`,
  `--user=${decodeURIComponent(url.username)}`,
  "--default-character-set=utf8mb4",
  database,
], {
  env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) },
  stdio: ["pipe", "inherit", "inherit"],
})

await pipeline(createReadStream(archive), createGunzip(), child.stdin)
const exitCode = await new Promise((resolveExit, reject) => {
  child.once("error", reject)
  child.once("close", resolveExit)
})
if (exitCode !== 0) throw new Error(`mysql restore failed with exit code ${exitCode}`)
console.log(`database-backup-restored target=${database}`)
