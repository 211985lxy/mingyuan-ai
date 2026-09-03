import { prisma } from "@/lib/prisma"
import type { IpWikiPageType, IpWikiSourceRef } from "@/lib/ip-wiki/types"

/**
 * IP 定位维基 · 数据访问
 *
 * 增量语义（Karpathy「更新而非重复」）：保存某类型的页时，归档该类型旧的 active 页，
 * 新页 version 递增。历史页以 archived 保留，可溯源；查询只取 active。
 */

export interface SaveIpWikiPageInput {
  pageType: IpWikiPageType
  title: string
  content: string
  frontmatter: Record<string, unknown>
  sources: IpWikiSourceRef[]
  links: string[]
}

export interface IpWikiPageRow {
  id: string
  projectId: string
  pageType: IpWikiPageType
  title: string
  content: string
  frontmatter: Record<string, unknown>
  sources: IpWikiSourceRef[]
  links: string[]
  sourceGenerationId: string | null
  version: number
  status: string
  createdAt: Date
  updatedAt: Date
}

/**
 * @description 列出ipwikipages
 * @param options - 配置选项
 * @returns Promise<IpWikiPageRow[]>
 */
export async function listIpWikiPages(options: {
  projectId: string
  status?: string
  pageTypes?: IpWikiPageType[]
}): Promise<IpWikiPageRow[]> {
  const status = options.status ?? "active"
  const where: {
    projectId: string
    status: string
    pageType?: { in: string[] }
  } = { projectId: options.projectId, status }
  if (options.pageTypes && options.pageTypes.length > 0) {
    where.pageType = { in: options.pageTypes }
  }

  return prisma.ipWikiPage.findMany({
    where,
    orderBy: [{ pageType: "asc" }, { updatedAt: "desc" }],
    take: 200,
  }) as unknown as Promise<IpWikiPageRow[]>
}

/**
 * 保存一批确认后的维基页。同类型旧 active 页归档，新页 version+1。
 */
/**
 * @description saveipwikipagebatch
 * @param input - 输入数据
 * @returns Promise<IpWikiPageRow[]>
 */
export async function saveIpWikiPageBatch(input: {
  userId: string
  projectId: string
  sourceGenerationId?: string
  pages: SaveIpWikiPageInput[]
}): Promise<IpWikiPageRow[]> {
  const saved: IpWikiPageRow[] = []

  for (const page of input.pages) {
    const latest = await prisma.ipWikiPage.findFirst({
      where: { projectId: input.projectId, pageType: page.pageType, status: "active" },
      orderBy: { version: "desc" },
      select: { version: true },
    })

    if (latest) {
      await prisma.ipWikiPage.updateMany({
        where: {
          projectId: input.projectId,
          pageType: page.pageType,
          status: "active",
        },
        data: { status: "archived" },
      })
    }

    const row = await prisma.ipWikiPage.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        pageType: page.pageType,
        title: page.title,
        content: page.content,
        frontmatter: (page.frontmatter ?? {}) as object,
        sources: (page.sources ?? []) as object,
        links: (page.links ?? []) as object,
        sourceGenerationId: input.sourceGenerationId ?? null,
        version: (latest?.version ?? 0) + 1,
        status: "active",
      },
    })
    saved.push(row as unknown as IpWikiPageRow)
  }

  return saved
}

/**
 * 单页编辑：人工自助编辑某 active 维基页的可变字段（title/content/frontmatter/links）。
 *
 * 与 saveIpWikiPageBatch 同样的归档语义——同 (projectId, pageType) 的旧 active 页归档，
 * 新建 version+1 的 active 页——保持单一 active 不变量与完整审计轨迹；pageType/sources/
 * sourceGenerationId 不可变（编辑不改类型、不改来源溯源）。
 *
 * 鉴权：按 (id, projectId, userId, status:"active") 锁定目标页，找不到返回 null（route 404）。
 * 仅更新传入的 patch 字段；未传的 frontmatter/links 保留原页值。
 */
export async function updateIpWikiPage(input: {
  userId: string
  projectId: string
  id: string
  patch: {
    title?: string
    content?: string
    frontmatter?: Record<string, unknown>
    links?: string[]
  }
}): Promise<IpWikiPageRow | null> {
  const current = await prisma.ipWikiPage.findFirst({
    where: { id: input.id, projectId: input.projectId, userId: input.userId, status: "active" },
    select: {
      id: true,
      pageType: true,
      version: true,
      title: true,
      content: true,
      frontmatter: true,
      sources: true,
      links: true,
      sourceGenerationId: true,
    },
  })
  if (!current) return null

  const pageType = current.pageType as IpWikiPageType

  // 归档同类型旧 active（与 batch 写入一致：保证同一 pageType 只剩一条 active）
  await prisma.ipWikiPage.updateMany({
    where: { projectId: input.projectId, pageType, status: "active" },
    data: { status: "archived" },
  })

  const title =
    typeof input.patch.title === "string"
      ? input.patch.title.trim().slice(0, 120)
      : current.title
  const content =
    typeof input.patch.content === "string" ? input.patch.content.slice(0, 8000) : current.content
  const frontmatter =
    input.patch.frontmatter && typeof input.patch.frontmatter === "object"
      ? (input.patch.frontmatter as Record<string, unknown>)
      : (current.frontmatter as Record<string, unknown>)
  const links = Array.isArray(input.patch.links)
    ? input.patch.links
    : (current.links as string[])

  const row = await prisma.ipWikiPage.create({
    data: {
      userId: input.userId,
      projectId: input.projectId,
      pageType,
      title,
      content,
      frontmatter: frontmatter as object,
      // 来源溯源不可变：编辑只改内容，不改来源指向（sources / sourceGenerationId 沿用原页）
      sources: (current.sources ?? []) as object,
      links: links as object,
      sourceGenerationId: current.sourceGenerationId ?? null,
      version: (current.version ?? 0) + 1,
      status: "active",
    },
  })
  return row as unknown as IpWikiPageRow
}


// ═══════════════════════════════════════════════════════════
// 老板说明书 · 采访 → ipWikiPage(boss_brief) 入库
// ═══════════════════════════════════════════════════════════

import {
  validateInterviewSixDim,
  renderBossBriefContent,
  buildBossBriefFrontmatter,
  type InterviewSixDim,
} from "@/lib/ip-wiki/boss-brief-types"
import { applyInterviewToPersona, type InterviewPersona } from "@/lib/assistant-persona"
import { applyInterviewToStyleProfile } from "@/lib/style-profile"

export interface UpsertBossBriefResult {
  applied: boolean
  /** applied=false 时给出原因 */
  reason?: "not_confirmed" | "invalid_input" | "error"
  /** 错误详情 */
  errorDetail?: string
  /** 成功写入的 ipWikiPage row（applied=true 时非空） */
  page?: IpWikiPageRow
  /** 同步派生的 assistant persona 对象（供调用方自行落库 / 使用） */
  persona?: InterviewPersona
  /** 同步派生的 style profile draft（供调用方自行落库 / 使用） */
  styleProfileDraft?: ReturnType<typeof applyInterviewToStyleProfile>
}

/** 类似 llm-json-retry 的 2 次尝试：裸 JSON → 去 markdown 围栏后再 JSON，都失败抛错。 */
function parseInterviewRaw(raw: string): unknown {
  let data: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const cleaned = attempt === 0
        ? raw
        : raw
            .replace(/^\s*```(?:json)?\s*\n?/i, "")
            .replace(/\n?```\s*$/i, "")
            .trim()
      data = JSON.parse(cleaned)
      return data
    } catch {
      // 第二轮再试
    }
  }
  throw new Error("interviewResult JSON 解析失败（已重试去 markdown 围栏）")
}

/**
 * 将采访六维画像 upsert 成 ipWikiPage(boss_brief) 记录，并同步派生
 * persona 与 style-profile 的纯函数结果（不越权写其它表）。
 *
 * 写入权限门槛：必须显式传 confirmed=true，否则拒绝写入。
 * 这是为了防止 AI 自动越权写入老板说明书。
 *
 * @param input.userId     写入人（与 project 所属 user 一致，由调用方校验）
 * @param input.projectId  即任务描述中的 ipProfileId —— 当前项目使用 projectId 命名。
 * @param input.confirmed  必须为 true 才写入。
 * @param input.interviewResult  已解析对象或采访模式输出的原始 JSON 字符串。
 * @param input.oldPersona       可选，传给 applyInterviewToPersona 做合并。
 * @param input.oldStyleContent  可选，传给 applyInterviewToStyleProfile 做合并。
 */
export async function upsertBossBriefFromInterview(input: {
  userId: string
  projectId: string
  confirmed: boolean
  interviewResult: InterviewSixDim | string
  sourceGenerationId?: string
  oldPersona?: Partial<InterviewPersona>
  oldStyleContent?: string | null
}): Promise<UpsertBossBriefResult> {
  // ── 权限闸门 ────────────────────────────────────────────────
  if (input.confirmed !== true) {
    return { applied: false, reason: "not_confirmed" }
  }

  const { userId, projectId } = input
  if (!userId || !projectId) {
    return {
      applied: false,
      reason: "invalid_input",
      errorDetail: "userId 与 projectId 均不能为空",
    }
  }

  try {
    // ── 解析 + 校验（复用 llm-json-retry 的 2 次尝试语义） ───
    const rawObj =
      typeof input.interviewResult === "string"
        ? parseInterviewRaw(input.interviewResult)
        : input.interviewResult
    const dim = validateInterviewSixDim(rawObj)

    // ── 派生 persona / style（纯函数，不落库） ───────────────
    const persona = applyInterviewToPersona(dim, input.oldPersona)
    const styleProfileDraft = applyInterviewToStyleProfile({
      expressionStyle: dim.expressionStyle,
      contentBoundaries: dim.contentBoundaries,
      strengthsWeaknesses: dim.strengthsWeaknesses,
      oldContent: input.oldStyleContent ?? null,
    })

    // ── Upsert IpWikiPage：归档旧 active(boss_brief) → 新建 version+1 ──
    const latest = await prisma.ipWikiPage.findFirst({
      where: {
        projectId,
        userId,
        pageType: "boss_brief",
        status: "active",
      },
      orderBy: { version: "desc" },
      select: { version: true },
    })
    if (latest) {
      await prisma.ipWikiPage.updateMany({
        where: { projectId, userId, pageType: "boss_brief", status: "active" },
        data: { status: "archived" },
      })
    }

    const content = renderBossBriefContent(dim)
    const frontmatter = buildBossBriefFrontmatter(dim)

    const row = await prisma.ipWikiPage.create({
      data: {
        userId,
        projectId,
        pageType: "boss_brief",
        title: "老板说明书",
        content,
        frontmatter: frontmatter as object,
        sources: [
          {
            kind: "aim_generation" as const,
            id: input.sourceGenerationId ?? "interview_build_profile",
            label: "老板说明书采访六维摘要",
          },
        ] as object,
        links: ["定位主张", "人设", "内容策略底盘", "目标人群"] as object,
        sourceGenerationId: input.sourceGenerationId ?? null,
        version: (latest?.version ?? 0) + 1,
        status: "active",
      },
    })

    return {
      applied: true,
      page: row as unknown as IpWikiPageRow,
      persona,
      styleProfileDraft,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      applied: false,
      reason: "error",
      errorDetail: msg,
    }
  }
}
