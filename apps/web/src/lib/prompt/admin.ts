/**
 * Prompt 资产管理服务（Step① 治理闭环 P2）。
 *
 * 给管理界面/脚本提供：模板列表、新建草稿版本、按门禁升级（fixtureKey）。
 * 不变量：
 * - 新建版本一律 draft，版本号 = 该 key 下最大版本 + 1；未登记 key 的首个版本需提供 domain。
 * - 升级必须过 `checkPromptPromotion` 门禁（升 qualified 必须绑定 fixtureKey）。
 * - 同一 key 同时最多一个 active 版本：激活时其余 active 自动回落 qualified。
 * - 任何写操作成功后 `promptRegistry.refresh(key)`，改动即时热更（无需发版/重启）。
 *
 * 错误约定：规则违反抛 `ApiRequestError`（400/404/409），由管理路由的
 * auth 包装器统一转 JSON 响应。
 */

import { ApiRequestError } from "@/lib/api-contract"
import { prisma } from "@/lib/prisma"
import { promptRegistry } from "@/lib/prompt/registry"
import {
  checkPromptPromotion,
  type PromptPromotionCheck,
  type PromptStatus,
} from "@/lib/prompt/types"

/** prisma 委托的最小契约（测试可注入替身；结构与 PrismaClient 的 prompt 域一致）。 */
export interface PromptAdminPrisma {
  promptTemplate: {
    findUnique(args: { where: { key: string } }): Promise<{ key: string; domain: string; description: string | null } | null>
    upsert(args: {
      where: { key: string }
      create: { key: string; domain: string; description: string | null }
      update: { description?: string }
    }): Promise<unknown>
    findMany(args: {
      include: { versions: { orderBy: { version: "desc" } } }
      orderBy: { createdAt: "asc" }
      take: number
    }): Promise<PromptTemplateRow[]>
  }
  promptVersion: {
    findFirst(args: { where: { templateKey: string; version: number } }): Promise<PromptVersionRow | null>
    aggregate(args: { where: { templateKey: string }; _max: { version: true } }): Promise<{ _max: { version: number | null } }>
    create(args: {
      data: {
        templateKey: string
        version: number
        content: string
        type: string
        status: "draft"
        fixtureKey?: string | null
      }
    }): Promise<PromptVersionRow>
    update(args: { where: { id: string }; data: { status: PromptStatus } }): Promise<PromptVersionRow>
    updateMany(args: {
      where: { templateKey: string; status: "active"; id: { not: string } }
      data: { status: "qualified" }
    }): Promise<{ count: number }>
  }
}

export interface PromptVersionRow {
  id: string
  templateKey: string
  version: number
  content: string
  type: string
  status: PromptStatus
  fixtureKey: string | null
  createdAt: Date
}

export interface PromptTemplateRow {
  key: string
  domain: string
  description: string | null
  versions?: PromptVersionRow[]
}

function defaultPrisma(): PromptAdminPrisma {
  return prisma as unknown as PromptAdminPrisma
}

/** 单个 key 的写操作串行化：同 key 并发写按到达顺序排队，避免版本号竞态。 */
const keyWriteLocks = new Map<string, Promise<unknown>>()

async function withKeyLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = keyWriteLocks.get(key) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(task)
  keyWriteLocks.set(key, run.catch(() => undefined))
  return run
}

/**
 * @description 列出全部 prompt 模板及其版本（版本倒序；管理列表用）
 */
export async function listPromptTemplates(
  prismaClient: PromptAdminPrisma = defaultPrisma(),
): Promise<PromptTemplateRow[]> {
  return prismaClient.promptTemplate.findMany({
    include: { versions: { orderBy: { version: "desc" } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  })
}

/**
 * @description 新建草稿版本（版本号自增；未登记 key 的首个版本需提供 domain）
 */
export async function createPromptDraftVersion(
  input: {
    key: string
    content: string
    fixtureKey?: string | null
    domain?: string
    description?: string | null
  },
  prismaClient: PromptAdminPrisma = defaultPrisma(),
): Promise<PromptVersionRow> {
  return withKeyLock(input.key, async () => {
    const template = await prismaClient.promptTemplate.findUnique({ where: { key: input.key } })
    if (!template && !input.domain?.trim()) {
      throw new ApiRequestError(
        400,
        "PROMPT_TEMPLATE_UNKNOWN",
        `未登记的 prompt key：${input.key}（首个版本需提供 domain 归类）`,
      )
    }
    if (!template) {
      await prismaClient.promptTemplate.upsert({
        where: { key: input.key },
        create: {
          key: input.key,
          domain: input.domain!.trim(),
          description: input.description ?? null,
        },
        update: input.description ? { description: input.description } : {},
      })
    }

    const maxVersion = await prismaClient.promptVersion.aggregate({
      where: { templateKey: input.key },
      _max: { version: true },
    })
    const created = await prismaClient.promptVersion.create({
      data: {
        templateKey: input.key,
        version: (maxVersion._max.version ?? 0) + 1,
        content: input.content,
        type: "system",
        status: "draft",
        fixtureKey: input.fixtureKey ?? null,
      },
    })
    await promptRegistry.refresh(input.key)
    return created
  })
}

/**
 * @description 按门禁升级版本状态（fixtureKey 门禁 + active 唯一互斥 + 热更联动）
 */
export async function promotePromptVersion(
  input: { key: string; version: number; toStatus: "qualified" | "active" },
  prismaClient: PromptAdminPrisma = defaultPrisma(),
): Promise<{ version: PromptVersionRow; demoted: number; check: PromptPromotionCheck }> {
  return withKeyLock(input.key, async () => {
    const row = await prismaClient.promptVersion.findFirst({
      where: { templateKey: input.key, version: input.version },
    })
    if (!row) {
      throw new ApiRequestError(404, "PROMPT_VERSION_NOT_FOUND", `版本不存在：${input.key}@v${input.version}`)
    }

    const check = checkPromptPromotion({
      fromStatus: row.status,
      toStatus: input.toStatus,
      fixtureKey: row.fixtureKey,
    })
    if (!check.allowed) {
      throw new ApiRequestError(409, "PROMPT_PROMOTION_REJECTED", check.reason ?? "升级被门禁拒绝")
    }

    let demoted = 0
    if (input.toStatus === "active") {
      const demotedResult = await prismaClient.promptVersion.updateMany({
        where: { templateKey: input.key, status: "active", id: { not: row.id } },
        data: { status: "qualified" },
      })
      demoted = demotedResult.count
    }

    const updated = await prismaClient.promptVersion.update({
      where: { id: row.id },
      data: { status: input.toStatus },
    })
    await promptRegistry.refresh(input.key)
    return { version: updated, demoted, check }
  })
}
