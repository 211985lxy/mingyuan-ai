import { createHash } from "node:crypto"
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { basename, resolve } from "node:path"
import { pipeline } from "node:stream/promises"
import { spawn } from "node:child_process"
import { createGzip } from "node:zlib"
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local" })

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error("DATABASE_URL is required")

const url = new URL(databaseUrl)
if (!new Set(["mysql:", "mariadb:"]).has(url.protocol)) throw new Error("DATABASE_URL must use MySQL or MariaDB")

const outputDirectory = resolve(process.env.BACKUP_DIR || "backups")
mkdirSync(outputDirectory, { recursive: true })
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-")
const database = url.pathname.replace(/^\//, "")
const sqlPath = resolve(outputDirectory, `${database}-${stamp}.sql`)
const archivePath = `${sqlPath}.gz`
const mysqldumpBin = process.env.MYSQLDUMP_BIN
  || ["/opt/homebrew/opt/mysql-client/bin/mysqldump", "/usr/local/opt/mysql-client/bin/mysqldump"].find(existsSync)
  || "mysqldump"

const child = spawn(mysqldumpBin, [
  "--single-transaction",
  "--quick",
  "--routines",
  "--triggers",
  "--events",
  "--no-tablespaces",
  "--default-character-set=utf8mb4",
  `--host=${url.hostname}`,
  `--port=${url.port || "3306"}`,
  `--user=${decodeURIComponent(url.username)}`,
  `--result-file=${sqlPath}`,
  database,
], {
  env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) },
  stdio: ["ignore", "inherit", "inherit"],
})

const exitCode = await new Promise((resolveExit, reject) => {
  child.once("error", reject)
  child.once("close", resolveExit)
})
if (exitCode !== 0) throw new Error(`mysqldump failed with exit code ${exitCode}`)

try {
  await pipeline(createReadStream(sqlPath), createGzip({ level: 9 }), createWriteStream(`${archivePath}.tmp`))
  renameSync(`${archivePath}.tmp`, archivePath)
} finally {
  unlinkSync(sqlPath)
}

const digest = await new Promise((resolveDigest, reject) => {
  const hash = createHash("sha256")
  createReadStream(archivePath).on("data", (chunk) => hash.update(chunk)).on("end", () => resolveDigest(hash.digest("hex"))).on("error", reject)
})
writeFileSync(`${archivePath}.sha256`, `${digest}  ${basename(archivePath)}\n`)
console.log(`database-backup-created path=${archivePath} sha256=${digest}`)
