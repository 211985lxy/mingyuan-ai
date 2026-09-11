/**
 * 开发/演示环境漂移门禁（dev:sanity）。
 *
 * 背景（2026-09-11 选题链事故）：本地库从旧备份恢复后出现三类账实不符——
 * 迁移账本记失败但列已存在、迁移记已应用但列缺失、账号绑定指向已合并掉的项目——
 * 分别表现为流水线 500 / 选题生成 500 / 接口 409。这类漂移在代码层完全不可见，
 * 只能在数据/账本层校验。本脚本在启动开发或演示前跑一遍，漂移即失败退出。
 *
 * 检查项：
 *   1. prisma migrate status 干净（无未应用迁移、无失败迁移、无本地缺失迁移）
 *   2. 关键列/表存在（ProjectMember 表；TopicSelection/VideoStructure.projectId）
 *   3. 所有账号的 boundProjectId 都指向仍存在且 active 的项目
 *
 * Usage: pnpm --dir apps/web dev:sanity
 * 只读，不修改任何数据。
 */
import { execFileSync } from "node:child_process"

import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../src/generated/prisma/client"

function buildClient(): PrismaClient {
  // 与 scripts/audit-account-project-isolation.ts 相同的构造方式：
  // mariadb adapter 不吃连接串本身，要拆成 host/port/user/password/database。
  const rawUrl = (process.env.DATABASE_URL ?? "").replace(/^mysql:\/\//, "mariadb://")
  if (!rawUrl) throw new Error("DATABASE_URL is required")
  const url = new URL(rawUrl)
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: parseInt(url.port || "3306", 10),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      charset: "utf8mb4",
      connectionLimit: 5,
    }),
  })
}

const prisma = buildClient()

type Finding = { check: string; ok: boolean; detail: string }

async function checkMigrations(): Promise<Finding> {
  try {
    const output = execFileSync("npx", ["prisma", "migrate", "status"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    }).toString()
    const notApplied = output.includes("have not yet been applied")
    const notFoundLocally = output.includes("not found locally")
    const failed = /following migration\(s\) have failed/i.test(output)
    const ok = !notApplied && !notFoundLocally && !failed
    const problems = [
      notApplied ? "存在未应用迁移" : null,
      notFoundLocally ? "数据库有本地缺失的迁移" : null,
      failed ? "存在失败迁移" : null,
    ].filter(Boolean)
    return {
      check: "迁移账本一致",
      ok,
      detail: ok ? "prisma migrate status 干净" : problems.join("；") + "（跑 `npx prisma migrate status` 看明细）",
    }
  } catch (error) {
    return {
      check: "迁移账本一致",
      ok: false,
      detail: `prisma migrate status 执行失败：${error instanceof Error ? error.message.slice(0, 160) : String(error)}`,
    }
  }
}

async function checkCriticalColumns(): Promise<Finding> {
  const rows = await prisma.$queryRawUnsafe<Array<{ TABLE_NAME: string; COLUMN_NAME: string }>>(
    `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND ((TABLE_NAME = 'ProjectMember' AND COLUMN_NAME = 'projectId')
         OR (TABLE_NAME = 'TopicSelection' AND COLUMN_NAME = 'projectId')
         OR (TABLE_NAME = 'VideoStructure' AND COLUMN_NAME = 'projectId'))`,
  )
  const found = new Set(rows.map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}`))
  const expected = ["ProjectMember.projectId", "TopicSelection.projectId", "VideoStructure.projectId"]
  const missing = expected.filter((key) => !found.has(key))
  return {
    check: "关键列存在",
    ok: missing.length === 0,
    detail: missing.length === 0 ? "项目隔离相关列齐全" : `缺失：${missing.join("、")}`,
  }
}

async function checkBindings(): Promise<Finding> {
  const stale = await prisma.$queryRawUnsafe<Array<{ email: string }>>(
    `SELECT u.email FROM User u
     LEFT JOIN ClientProject p ON p.id = u.boundProjectId
     WHERE u.boundProjectId IS NOT NULL AND (p.id IS NULL OR p.status <> 'active')`,
  )
  return {
    check: "账号绑定有效",
    ok: stale.length === 0,
    detail:
      stale.length === 0
        ? "所有绑定都指向 active 项目"
        : `过期绑定账号：${stale.map((r) => r.email).join("、")}（项目已归档/删除/合并，需在项目上下文里重绑）`,
  }
}

async function main(): Promise<void> {
  const findings: Finding[] = []
  findings.push(await checkMigrations())
  findings.push(await checkCriticalColumns())
  findings.push(await checkBindings())
  await prisma.$disconnect()

  for (const f of findings) {
    console.info(`[dev:sanity] ${f.ok ? "✓" : "✗"} ${f.check} — ${f.detail}`)
  }
  const failed = findings.filter((f) => !f.ok)
  if (failed.length > 0) {
    console.error(`[dev:sanity] 环境漂移：${failed.length} 项不通过，先修复再启动/演示`)
    process.exit(1)
  }
  console.info("[dev:sanity] 全部通过")
}

void main()
