/**
 * 把徐沪生创作方法论的 compiledPrompt 灌入 MethodologyProfile。
 *
 * ADR-002。版本化语义（严格遵守）：
 *   - 若 slug 对应的 Profile 不存在 → 创建 Profile + published 的 v1。
 *   - 若 Profile 已存在 → 读取 compiledPrompt，计算 checksum；
 *     checksum 与最新版本相同则跳过（内容未变，不重复建版本）；
 *     checksum 不同则新建 version+1 的 published 版本（旧版本保留，不可原地改）。
 *
 * compiledPrompt 来源（按优先级）：
 *   1. --file=<path> 参数指定的文件；
 *   2. 默认 docs/methodologies/xuhusheng-content-creation-compiled.md 中首尾 --- 之间的主体。
 *      找不到文件则回退到脚本内的骨架占位（便于首次空库跑通）。
 *
 * 运行示例：
 *   DOTENV_CONFIG_PATH=.env.local NODE_OPTIONS='-r dotenv/config' npx tsx scripts/seed-methodology-profile.ts
 *   DOTENV_CONFIG_PATH=.env.local NODE_OPTIONS='-r dotenv/config' npx tsx scripts/seed-methodology-profile.ts --file=./docs/methodologies/xuhusheng-content-creation-compiled.md
 */
import { createHash } from "crypto"
import { readFileSync, existsSync } from "fs"
import { resolve, isAbsolute } from "path"

import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../src/generated/prisma/client"

const SLUG = "xuhusheng-content-creation"

/**
 * 解析 compiledPrompt 文件路径。优先级：
 *   1. --file=<path> 参数（支持相对 cwd 或绝对路径）；
 *   2. 仓库根 docs/methodologies/xuhusheng-content-creation-compiled.md（尝试 cwd 与 cwd/../.. 两种形态）。
 * 返回第一个存在的路径；都不存在返回 null（脚本回退到骨架占位）。
 */
function resolveCompiledPromptFile(): string | null {
  const arg = process.argv.find((a) => a.startsWith("--file="))
  if (arg) {
    const p = arg.slice("--file=".length)
    return resolve(isAbsolute(p) ? p : resolve(process.cwd(), p))
  }
  const candidates = [
    resolve(process.cwd(), "docs/methodologies/xuhusheng-content-creation-compiled.md"),
    resolve(process.cwd(), "../../docs/methodologies/xuhusheng-content-creation-compiled.md"),
  ]
  return candidates.find((p) => existsSync(p)) ?? null
}

/**
 * 从 markdown 文件提取 compiledPrompt 主体。
 * 文件结构约定：标题 + 前言说明在前，最后一个 `---` 分隔线之后为实际进 prompt 的 compiledPrompt。
 * 若文件不含 `---`，则去掉首个 `#` 标题行后取全文兜底。
 */
function loadCompiledPrompt(filePath: string): string {
  const raw = readFileSync(filePath, "utf8")
  const lines = raw.split("\n")
  const sepIndices = lines
    .map((l, i) => (l.trim() === "---" ? i : -1))
    .filter((i) => i >= 0)
  if (sepIndices.length > 0) {
    const lastSep = sepIndices[sepIndices.length - 1]
    return lines.slice(lastSep + 1).join("\n").trim()
  }
  // 兜底：去掉首行标题
  const start = lines[0]?.startsWith("#") ? 1 : 0
  return lines.slice(start).join("\n").trim()
}

// 兜底骨架（找不到 compiledPrompt 文件时使用，便于空库首次跑通）
const FALLBACK_PROMPT = `# 徐沪生创作方法论（骨架占位）

借鉴其方法与框架，不模仿作者身份与语言口吻。任何人物、业务、产品案例与假设均不得覆盖当前项目真实资料与用户本次明确要求。

## 核心主张
（待替换：从 docs/methodologies/xuhusheng-content-creation-compiled.md 读取真实内容）

## 输出自检清单
- [ ] 这条内容负责破圈还是转化？

## 项目适配（创作时按本项目回答）
- 本项目的目标用户是谁？这一稿服务漏斗哪一层？`

function buildClient() {
  const rawUrl = (process.env.DATABASE_URL ?? "").replace(/^mysql:\/\//, "mariadb://")
  if (!rawUrl) throw new Error("DATABASE_URL is required")
  const url = new URL(rawUrl)
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: parseInt(url.port || "3306"),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    charset: "utf8mb4",
    connectionLimit: 5,
  })
  return new PrismaClient({ adapter })
}

async function main() {
  const filePath = resolveCompiledPromptFile()
  let compiledPrompt: string
  if (filePath) {
    try {
      compiledPrompt = loadCompiledPrompt(filePath)
      console.log(`[src] 从文件读取 compiledPrompt：${filePath}`)
      if (!compiledPrompt) throw new Error("提取到的主体为空")
    } catch (error) {
      console.warn(`[warn] 读取/解析文件失败（${filePath}）：${(error as Error).message}`)
      console.warn(`[warn] 回退到脚本内骨架占位。请确认 compiledPrompt 文件路径后再重跑。`)
      compiledPrompt = FALLBACK_PROMPT
    }
  } else {
    compiledPrompt = FALLBACK_PROMPT
  }

  const checksum = createHash("sha256").update(compiledPrompt, "utf8").digest("hex")
  const prisma = buildClient()
  try {
    const existing = await prisma.methodologyProfile.findUnique({
      where: { slug: SLUG },
      include: {
        versions: {
          where: { status: "published" },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    })

    // —— 已存在：按 checksum 决定是否新建版本 ——
    if (existing) {
      const latest = existing.versions[0]
      if (latest && latest.checksum === checksum) {
        console.log(`[skip] 内容未变化（checksum 一致）：${existing.name} v${latest.version}`)
        return
      }
      const nextVersion = (latest?.version ?? 0) + 1
      const created = await prisma.methodologyProfileVersion.create({
        data: {
          profileId: existing.id,
          version: nextVersion,
          contentMarkdown: compiledPrompt,
          compiledPrompt,
          sourceRefs: [],
          checksum,
          status: "published",
          publishedAt: new Date(),
        },
      })
      console.log(`[ok] 新建版本：${existing.name} v${nextVersion} (id=${created.id})`)
      console.log(`     checksum=${checksum.slice(0, 16)}…`)
      return
    }

    // —— 不存在：创建 Profile + v1 ——
    const profile = await prisma.methodologyProfile.create({
      data: {
        name: "徐沪生创作方法论",
        slug: SLUG,
        originatorName: "徐沪生",
        aliases: ["徐沪生方法论", "徐沪生创作方法", "做号方法论", "《做号》方法论"],
        methodologyType: "content_creation",
        scope: "global",
        description: "徐沪生《做号：个人IP创作手册》内容创作方法论蒸馏（专业个人IP、账号即杂志、内容漏斗、选题与脚本规则）。",
        // deep_copywriter 已隐藏并入 content_producer，故不再单列
        applicableAgents: ["content_producer"],
        applicableTasks: ["new_copy", "rewrite_copy", "positioning_topic"],
        priority: 100,
        status: "active",
      },
    })
    const version = await prisma.methodologyProfileVersion.create({
      data: {
        profileId: profile.id,
        version: 1,
        contentMarkdown: compiledPrompt,
        compiledPrompt,
        sourceRefs: [],
        checksum,
        status: "published",
        publishedAt: new Date(),
      },
    })
    console.log(`[ok] 已创建方法论：${profile.name} (id=${profile.id})，v1 (id=${version.id})`)
    console.log(`     checksum=${checksum.slice(0, 16)}…`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error("[error] 灌入失败：", error)
  process.exit(1)
})
