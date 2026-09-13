#!/usr/bin/env node
// 漂移门禁：对比「schema 声明的对象集合」与「生产库实际的对象集合」，只拦截缺失。
//
// 背景：生产库曾被 `migrate resolve --applied` 静默跳过一个迁移的 DDL，外键缺失
// 五天无人发现；而全量漂移门禁一直误报——生产库是 MariaDB 10.5，Prisma 7.8 的
// 两条内省管线在它上面读不全外键（migrate diff --from-config-datasource 与
// prisma db pull 对同一批物理存在的外键给出互相矛盾的名单），且各自的 diff
// 输出里连 SHOW CREATE TABLE 确认定义一致的外键都会被要求重建。
//
// 因此本脚本完全绕开 Prisma 内省：
//   1. `prisma migrate diff --from-empty --to-schema <合并后的单文件>` 生成理想 DDL
//      （不连库，纯 schema 解析，输出可信）；
//   2. mysql2 直连生产库查 INFORMATION_SCHEMA 得到实际对象集合（直查可信）；
//   3. 期望 − 实际 = 缺失，即拦截。
//
// 比对对象：外键、索引、表、列（按名字，不比类型/行为——那些内省不可靠）。
// 用法：node check-migration-drift.mjs check --web-dir apps/web（DATABASE_URL 从环境继承）
// 发现缺失时退出码 1。

import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

/**
 * 把目录形式的多文件 Prisma schema 合并成单文件文本。
 * 剥掉每个文件的 generator 块；datasource 只保留一份（migrate diff 需要它确定方言）。
 */
export function mergePrismaDirToString(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".prisma")).sort()
  if (files.length === 0) throw new Error(`no .prisma files under ${dir}`)
  let datasource = ""
  const models = files
    .map((f) => {
      const body = fs
        .readFileSync(path.join(dir, f), "utf8")
        .replace(/generator \w+ \{[^}]*\}\n?/g, "")
        .replace(/datasource \w+ \{[^}]*\}\n?/g, (m) => {
          datasource ||= m
          return ""
        })
        .trim()
      return `// ===== ${f} =====\n${body}`
    })
    .join("\n\n")
  return `${datasource}\n\n${models}\n`
}

const COLUMN_TYPE_RE =
  /^\s*`([^`]+)`\s+(?:VARCHAR|CHAR|TEXT|MEDIUMTEXT|LONGTEXT|TINYTEXT|INTEGER|INT|BIGINT|SMALLINT|TINYINT|BOOLEAN|BOOLEAN|DATETIME|DATE|TIME|JSON|DOUBLE|FLOAT|DECIMAL|NUMERIC|BLOB|LONGBLOB|MEDIUMBLOB|TINYBLOB|VARBINARY|BINARY|ENUM)/i

/**
 * 从 `prisma migrate diff --from-empty --to-schema ... --script` 的输出解析
 * schema 期望的对象集合。不连库，纯文本解析。
 */
export function extractExpectedObjects(idealDdl) {
  const foreignKeys = new Map() // name -> table
  const indexes = new Map() // name -> table
  const tables = new Set()
  const columns = new Set() // "table.column"

  for (const m of idealDdl.matchAll(/CREATE TABLE `([^`]+)`/g)) tables.add(m[1])
  for (const m of idealDdl.matchAll(/ALTER TABLE `([^`]+)` ADD CONSTRAINT `([^`]+)` FOREIGN KEY/g)) {
    foreignKeys.set(m[2], m[1])
  }
  for (const m of idealDdl.matchAll(/CREATE (?:UNIQUE )?INDEX `([^`]+)` ON `([^`]+)`/g)) {
    indexes.set(m[1], m[2])
  }
  for (const m of idealDdl.matchAll(/CREATE TABLE `([^`]+)` \([\s\S]*?\n\)/g)) {
    for (const line of m[0].split("\n")) {
      const col = line.match(COLUMN_TYPE_RE)
      if (col) columns.add(`${m[1]}.${col[1]}`)
    }
  }
  return { foreignKeys, indexes, tables, columns }
}

/**
 * 期望 − 实际 = 缺失。实际集合为 Map<name, table>（外键/索引）或 Set（表/列）。
 */
export function findMissing(expected, actualForeignKeys, actualIndexes, actualTables, actualColumns) {
  const missingForeignKeys = [...expected.foreignKeys]
    .filter(([name]) => !actualForeignKeys.has(name))
    .map(([name, table]) => `${table}.${name}`)
  const missingIndexes = [...expected.indexes]
    .filter(([name]) => !actualIndexes.has(name))
    .map(([name, table]) => `${table}.${name}`)
  const missingTables = [...expected.tables].filter((t) => !actualTables.has(t))
  const missingColumns = [...expected.columns].filter((c) => !actualColumns.has(c))
  return { missingForeignKeys, missingIndexes, missingTables, missingColumns }
}

export function formatDriftReport(result) {
  const lines = []
  if (result.missingTables.length > 0) lines.push(`缺失表: ${result.missingTables.join(", ")}`)
  if (result.missingColumns.length > 0) lines.push(`缺失列: ${result.missingColumns.join(", ")}`)
  if (result.missingForeignKeys.length > 0) lines.push(`缺失外键: ${result.missingForeignKeys.join(", ")}`)
  if (result.missingIndexes.length > 0) lines.push(`缺失索引: ${result.missingIndexes.join(", ")}`)
  return lines
}

function reportAndExit(result) {
  const findings = formatDriftReport(result)
  if (findings.length === 0) {
    console.log("schema-drift-ok 生产库具备 schema 声明的全部表/列/外键/索引")
    return
  }
  console.error("❌ schema 漂移：生产库缺少以下对象（通常是迁移被 resolve --applied 跳过所致）")
  for (const line of findings) console.error(`  ${line}`)
  console.error("  请核对 _prisma_migrations 中 applied_steps_count = 0 的迁移，补齐 DDL 后再发布。")
  process.exit(1)
}

async function queryActualObjects(webDir, databaseUrl) {
  // mysql2 是 apps/web 的依赖，从 webDir 解析而不是脚本自身位置
  const { createRequire } = await import("node:module")
  const webRequire = createRequire(path.resolve(webDir, "package.json"))
  const { createConnection } = webRequire("mysql2/promise")
  const url = new URL(databaseUrl)
  const conn = await createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
  })
  try {
    const [fks] = await conn.query(
      "SELECT TABLE_NAME, CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY'",
    )
    const [idx] = await conn.query(
      "SELECT DISTINCT TABLE_NAME, INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE()",
    )
    const [tables] = await conn.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()")
    const [cols] = await conn.query("SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE()")
    return {
      foreignKeys: new Map(fks.map((r) => [r.CONSTRAINT_NAME, r.TABLE_NAME])),
      indexes: new Map(idx.map((r) => [r.INDEX_NAME, r.TABLE_NAME])),
      tables: new Set(tables.map((r) => r.TABLE_NAME)),
      columns: new Set(cols.map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}`)),
    }
  } finally {
    await conn.end()
  }
}

// 全流程：合并 schema → from-empty 理想 DDL → INFORMATION_SCHEMA 实际集合 → 对比。
async function runCheck(webDir) {
  const schemaDir = path.resolve(webDir, "prisma")
  const merged = mergePrismaDirToString(schemaDir)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mingyuan-drift-"))
  const mergedFile = path.join(tmpDir, "schema.merged.prisma")
  fs.writeFileSync(mergedFile, merged)
  try {
    const diff = spawnSync(
      "corepack",
      ["pnpm", "exec", "prisma", "migrate", "diff", "--from-empty", "--to-schema", mergedFile, "--script"],
      { cwd: path.resolve(webDir), stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" },
    )
    if (diff.status !== 0 || !diff.stdout.trim()) {
      console.error("prisma migrate diff --from-empty 失败，无法生成期望 schema。")
      process.exit(1)
    }
    const expected = extractExpectedObjects(diff.stdout)
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
      console.error("DATABASE_URL 未设置，无法核对生产库。")
      process.exit(1)
    }
    const actual = await queryActualObjects(webDir, databaseUrl)
    reportAndExit(findMissing(expected, actual.foreignKeys, actual.indexes, actual.tables, actual.columns))
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

function main() {
  const [mode, ...rest] = process.argv.slice(2)
  if (mode !== "check") {
    console.error("用法: node check-migration-drift.mjs check --web-dir apps/web")
    process.exit(2)
  }
  const idx = rest.indexOf("--web-dir")
  runCheck(idx !== -1 ? rest[idx + 1] : "apps/web").catch((error) => {
    console.error(`漂移门禁执行失败：${error instanceof Error ? error.message : error}`)
    process.exit(1)
  })
}

// node --test 直接 import 时不应执行 CLI 分支
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))) main()
