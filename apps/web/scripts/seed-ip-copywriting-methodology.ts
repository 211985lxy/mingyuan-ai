/**
 * 把「明动 AIM 天命·资产 IP 操盘方法论」灌入 AgentMethodology(key="ip_copywriting")。
 *
 * 为什么需要这个脚本：
 *   getMethodologyBlock("ip_copywriting") 是 DB 优先 —— 只要 DB 里有内容，
 *   文件 ip-copywriting-methodology-core.md 改了也不会生效（播种时 update:{} 不覆盖）。
 *   所以替换方法论必须同时更新 DB 行，才能让线上即时切换到新方法论。
 *
 * 语义（与 updateMethodologyContent 等价）：create-or-overwrite content + title。
 *   - 已存在 → 覆盖 content/title/updatedBy（用户此前的后台编辑会被这次替换覆盖，符合「替换」意图）。
 *   - 不存在 → 创建。
 *
 * 用法（在 apps/web 下）：
 *   DOTENV_CONFIG_PATH=.env.local NODE_OPTIONS='-r dotenv/config' npx tsx scripts/seed-ip-copywriting-methodology.ts
 *
 * 可选参数 --file=<path> 指定其它方法论文本（默认读 docs 下的 ip-copywriting-methodology-core.md）。
 */
import { readFileSync, existsSync } from "fs"
import { resolve, isAbsolute } from "path"

import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"

const KEY = "ip_copywriting"
const TITLE = "IP 操盘方法论"
const FILE_PATH = "mingyuan/docs/methodologies/ip-copywriting-methodology-core.md"

function createPrismaClient() {
  const url = new URL(
    (process.env.DATABASE_URL ?? "").replace(/^mysql:\/\//, "mariadb://"),
  )

  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: parseInt(url.port || "3306", 10),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
    }),
  })
}

/** 解析方法论文本文件路径：--file 参数 > 仓库内默认文件（cwd 与 cwd/../.. 两种形态）。 */
function resolveMethodologyFile(): string | null {
  const arg = process.argv.find((a) => a.startsWith("--file="))
  if (arg) {
    const p = arg.slice("--file=".length)
    return resolve(isAbsolute(p) ? p : resolve(process.cwd(), p))
  }
  const candidates = [
    resolve(process.cwd(), "docs/methodologies/ip-copywriting-methodology-core.md"),
    resolve(process.cwd(), "../../docs/methodologies/ip-copywriting-methodology-core.md"),
  ]
  return candidates.find((p) => existsSync(p)) ?? null
}

async function main() {
  const file = resolveMethodologyFile()
  if (!file) {
    console.error(`[seed-ip-copywriting-methodology] 找不到方法论文本文件（--file 或 ${FILE_PATH}）`)
    process.exit(1)
  }

  // 文件已是剥离 frontmatter 后的正文（由 Obsidian 源文件生成时处理）。
  const content = readFileSync(file, "utf8").trim()
  if (!content) {
    console.error(`[seed-ip-copywriting-methodology] 文件内容为空：${file}`)
    process.exit(1)
  }

  const prisma = createPrismaClient()
  try {
    const before = await prisma.agentMethodology.findUnique({ where: { key: KEY } })
    const row = await prisma.agentMethodology.upsert({
      where: { key: KEY },
      create: {
        key: KEY,
        title: TITLE,
        content,
        filePath: FILE_PATH,
        updatedBy: "seed-ip-copywriting-methodology",
      },
      update: {
        title: TITLE,
        content,
        filePath: FILE_PATH,
        updatedBy: "seed-ip-copywriting-methodology",
      },
    })

    console.log(`✅ 已${before ? "覆盖更新" : "新建"} AgentMethodology(key=${KEY})`)
    console.log(`   来源文件：${file}`)
    console.log(`   正文长度：${content.length} 字符 / ${content.split("\n").length} 行`)
    console.log(`   title：${row.title}`)
    console.log(`   updatedAt：${row.updatedAt.toISOString()}`)
    console.log("")
    console.log("⚠️  注：运行时内存缓存在进程重启后自动失效；")
    console.log("   若需立即对长驻进程生效，请在后台再保存一次该方法论（触发 invalidateMethodologyCache）。")
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error("[seed-ip-copywriting-methodology] 失败：", err)
  process.exit(1)
})
