/**
 * Prompt Registry 幂等 seed 脚本（Step① 主线 / 对应 prisma/prompt.prisma）。
 *
 * 用法（tsx 直接跑，不需要 Next 运行时）：
 *   DATABASE_URL=... npx tsx prisma/seed-prompt-registry.ts          # 幂等写入 draft v1
 *   DATABASE_URL=... npx tsx prisma/seed-prompt-registry.ts --export # DB → JSON 反向导出
 *   DATABASE_URL=... npx tsx prisma/seed-prompt-registry.ts --export --out=./prompts.json
 *
 * 幂等语义：**仅当 DB 里该 key 没有任何版本时**才写入 draft v1；
 * 已有版本（哪怕是人工改过的 draft/qualified/active）一律不动，绝不覆盖线上 prompt。
 *
 * 若要挂到全量 seed：在 prisma/seed.ts 里加两行即可（本改动刻意不改 seed.ts）：
 *   import { seedPromptRegistry } from "./seed-prompt-registry"
 *   await seedPromptRegistry(prisma)
 */

import { PROMPT_SEEDS } from "../src/lib/prompt/seeds"
import type { PromptSeed } from "../src/lib/prompt/types"

/** 本脚本只需要这几个 delegate，用结构类型避免依赖生成产物的完整类型。 */
interface PromptTemplateDelegate {
  upsert(args: {
    where: { key: string }
    create: { key: string; domain: string; description?: string | null }
    update: Record<string, never>
  }): Promise<unknown>
}

interface PromptVersionRow {
  templateKey: string
  version: number
  content: string
  type: string
  status: string
  fixtureKey?: string | null
}

interface PromptVersionDelegate {
  findMany(args: {
    where: { templateKey?: string; templateKeyIn?: string[] }
    orderBy?: { version: "asc" | "desc" }
    take?: number
  }): Promise<PromptVersionRow[]>
  create(args: {
    data: {
      templateKey: string
      version: number
      content: string
      type: string
      status: string
      fixtureKey?: string | null
    }
  }): Promise<PromptVersionRow>
}

export interface PromptRegistryPrisma {
  promptTemplate: PromptTemplateDelegate
  promptVersion: PromptVersionDelegate
}

/**
 * 幂等写入：模板 upsert，版本仅在该 key 无任何版本时补 draft v1。
 * @param prisma - Prisma 客户端（注入，便于复用连接）
 * @returns 写入统计 { templates, created, skipped }
 */
export async function seedPromptRegistry(prisma: PromptRegistryPrisma): Promise<{
  templates: number
  created: number
  skipped: number
}> {
  let created = 0
  let skipped = 0

  for (const seed of PROMPT_SEEDS) {
    await prisma.promptTemplate.upsert({
      where: { key: seed.key },
      create: {
        key: seed.key,
        domain: seed.domain,
        description: seed.description ?? null,
      },
      update: {},
    })

    const existing = await prisma.promptVersion.findMany({
      where: { templateKey: seed.key },
      take: 1,
    })
    if (existing.length > 0) {
      skipped += 1
      continue
    }

    await prisma.promptVersion.create({
      data: {
        templateKey: seed.key,
        version: seed.version,
        content: seed.content,
        type: seed.type,
        status: "draft",
        fixtureKey: seed.fixtureKey ?? null,
      },
    })
    created += 1
  }

  return { templates: PROMPT_SEEDS.length, created, skipped }
}

/** 反向导出：DB → { key: content }（每个 key 取版本号最大的一条）。 */
export async function exportPromptRegistry(
  prisma: PromptRegistryPrisma,
): Promise<Record<string, string>> {
  const rows = await prisma.promptVersion.findMany({
    where: {},
    orderBy: { version: "desc" },
  })
  const latest = new Map<string, PromptVersionRow>()
  for (const row of rows) {
    const prev = latest.get(row.templateKey)
    if (!prev || row.version > prev.version) latest.set(row.templateKey, row)
  }
  const out: Record<string, string> = {}
  for (const [key, row] of latest) out[key] = row.content
  return out
}

/** 直接运行时自建客户端（与 prisma/seed.ts 同款 mariadb adapter）。 */
async function createStandaloneClient(): Promise<PromptRegistryPrisma> {
  const { PrismaClient } = await import("../src/generated/prisma/client")
  const { PrismaMariaDb } = await import("@prisma/adapter-mariadb")
  const url = new URL((process.env.DATABASE_URL ?? "").replace(/^mysql:\/\//, "mariadb://"))
  const client = new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: parseInt(url.port || "3306", 10),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
    }),
  })
  return client as unknown as PromptRegistryPrisma
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const isExport = args.includes("--export")
  const outArg = args.find((a) => a.startsWith("--out="))
  const prisma = await createStandaloneClient()

  try {
    if (isExport) {
      const exported = await exportPromptRegistry(prisma)
      const json = JSON.stringify(exported, null, 2)
      if (outArg) {
        const { writeFile } = await import("node:fs/promises")
        await writeFile(outArg.slice("--out=".length), json, "utf8")
        console.log(`✅ 已导出 ${Object.keys(exported).length} 条 prompt`)
      } else {
        console.log(json)
      }
      return
    }

    const result = await seedPromptRegistry(prisma)
    console.log(
      `🌱 Prompt Registry seed 完成：模板 ${result.templates} / 新建版本 ${result.created} / 跳过（已存在）${result.skipped}`,
    )
  } finally {
    const disconnectable = prisma as unknown as { $disconnect?: () => Promise<void> }
    if (typeof disconnectable.$disconnect === "function") await disconnectable.$disconnect()
  }
}

const isDirectRun = (process.argv[1] ?? "").includes("seed-prompt-registry")
if (isDirectRun) {
  main().catch((error) => {
    console.error("Prompt Registry seed 失败：", error)
    process.exit(1)
  })
}

/** 便于外部复用 seed 列表（例如做漂移检查）。 */
export const PROMPT_REGISTRY_SEEDS: readonly PromptSeed[] = PROMPT_SEEDS
