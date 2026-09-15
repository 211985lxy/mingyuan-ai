import { detectGoal, type AimContentGoal } from "@/lib/aim/content-goal"
import { parseProfileFromPages } from "@/lib/aim/ip-profile-form"
import { listIpWikiPages } from "@/lib/ip-wiki/repo"
import type { IpWikiPageType } from "@/lib/ip-wiki/types"
import type { KnowledgeCategory } from "@/lib/knowledge-categories"
import { prisma } from "@/lib/prisma"

/**
 * 绑定项目的 IP 档案兜底（档案里已写明的受众/目标不再重复追问）。
 *
 * 为什么档案可以当约束：能进 active 的档案页都是人工确认过的——手填表单直接落库；
 * 「定位方案 → 编译」那条路是「提议，待人工确认」，用户要在维基里逐页勾选确认才写入。
 * 所以档案页表达的是用户本人的表态，不是系统脑补的默认值——后者才是
 * 「用户指令唯一真源」要禁止的东西。
 *
 * 优先级：本轮原话 > 本任务已确认回答 > 档案页。
 *
 * 实践提醒：线上档案基本都来自编译那条路，页里**没有**「## 我服务谁 / ## 内容目标」
 * 小节标题（那是表单形态），内容是陈述句，首句才是受众本体、后面常跟痛点映射表。
 * 所以受众取首句；内容目标在档案里没有专门栏目，故按页型顺序扫目标词，
 * 仍找不到时才退到知识库的定位/卖点两类材料。受众只从档案取——档案页是
 * 「这个账号服务谁」的正式声明，从原材料里倒推受众容易把成稿写给错的人。
 */

/** 兜底读三页：受众取目标人群页，内容目标在定位主张 / 内容策略底盘里搜 */
const SEED_PAGE_TYPES: IpWikiPageType[] = ["audience", "positioning", "content_strategy"]

/** 目标候选的阅读顺序：定位主张先说清这个 IP 要什么，内容策略底盘其次 */
const GOAL_CANDIDATE_PAGE_TYPES: IpWikiPageType[] = ["positioning", "content_strategy"]

/** 受众一句话上限：与语义理解产出的受众截断长度对齐 */
const AUDIENCE_MAX_CHARS = 80

/**
 * 档案没提目标时退到知识库，且只取「这个账号定位是什么 / 卖什么」两类材料。
 * 案例、对标、灵感是原材料，里面出现「获客」等词不代表账号目标，
 * 取进来会把目标判歪——这是接知识库最容易踩的坑。
 */
const GOAL_FALLBACK_CATEGORIES: KnowledgeCategory[] = ["positioning_material", "product_usp"]
const GOAL_FALLBACK_MAX_ENTRIES = 20

export interface IpProfileSeed {
  /** 「我服务谁」原文，已取首句并限长（最长 AUDIENCE_MAX_CHARS） */
  audience?: string
  /** 内容目标，已判定成枚举；档案与知识库都没说目标时为空 */
  goal?: AimContentGoal
  /** 命中目标词的那段原文，供 trace 与排查溯源 */
  goalText?: string
  /** 目标来自哪里（page:positioning / profile_field / knowledge:product_usp） */
  goalSource?: string
}

export interface IpProfileSeedPage {
  pageType: IpWikiPageType
  content: string
}

/** 知识库候选条目（只用到分类与正文） */
export interface IpProfileKnowledgeEntry {
  category: string
  content: string
}

/** 取首句并压平空白：避免把档案里的清单/映射表带进意图行 */
function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim()
  const stop = flat.indexOf("。")
  const sentence = stop >= 0 ? flat.slice(0, stop) : flat
  return sentence.trim().slice(0, AUDIENCE_MAX_CHARS)
}

/** 同页型取最新一版：listIpWikiPages 按 updatedAt desc 返回，首个即最新 */
function newestByPageType(pages: readonly IpProfileSeedPage[]): Map<IpWikiPageType, IpProfileSeedPage> {
  const newest = new Map<IpWikiPageType, IpProfileSeedPage>()
  for (const page of pages) {
    if (!newest.has(page.pageType)) newest.set(page.pageType, page)
  }
  return newest
}

/**
 * 纯函数：从档案页裁出兜底种子（不依赖 Prisma，便于单测）。
 * 表单形态靠 parseProfileFromPages 按小节标题取值；编译形态没有小节时，
 * 它会把整页内容回填到该页第一栏，正好当作原始候选。
 */
export function profileSeedFromPages(pages: readonly IpProfileSeedPage[]): IpProfileSeed {
  const newest = newestByPageType(pages)
  const form = parseProfileFromPages([...newest.values()])

  const audience = form.audience ? firstSentence(form.audience) : undefined
  const archiveGoal = findArchiveGoal(form, newest)

  return {
    ...(audience ? { audience } : {}),
    ...(archiveGoal ?? {}),
  }
}

/**
 * 搜档案里的目标：表单填的「## 内容目标」小节优先，其次按页型顺序扫整页。
 * 编译档案没有目标栏，只能靠页内目标词命中；命中即止，避免多页拼出互相矛盾的目标。
 */
function findArchiveGoal(
  form: ReturnType<typeof parseProfileFromPages>,
  newest: Map<IpWikiPageType, IpProfileSeedPage>,
): { goal: AimContentGoal; goalText: string; goalSource: string } | undefined {
  const candidates = [
    ...(form.goal ? [{ text: form.goal, source: "profile_field" }] : []),
    ...GOAL_CANDIDATE_PAGE_TYPES.map((pageType) => ({
      text: newest.get(pageType)?.content ?? "",
      source: `page:${pageType}`,
    })),
  ]
  for (const candidate of candidates) {
    const text = candidate.text.trim()
    if (!text) continue
    const goal = detectGoal(text)
    if (goal) return { goal, goalText: text, goalSource: candidate.source }
  }
  return undefined
}

/** 纯函数：在知识库材料里找第一个能判定出目标的条目 */
export function goalFromKnowledgeEntries(
  entries: readonly IpProfileKnowledgeEntry[],
): { goal: AimContentGoal; goalText: string; goalSource: string } | undefined {
  for (const entry of entries) {
    const text = entry.content?.trim()
    if (!text) continue
    const goal = detectGoal(text)
    if (goal) return { goal, goalText: text, goalSource: `knowledge:${entry.category}` }
  }
  return undefined
}

async function listKnowledgeGoalEntries(projectId: string): Promise<IpProfileKnowledgeEntry[]> {
  return prisma.knowledgeEntry.findMany({
    where: { projectId, status: "active", category: { in: GOAL_FALLBACK_CATEGORIES } },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    take: GOAL_FALLBACK_MAX_ENTRIES,
    select: { category: true, content: true },
  })
}

/**
 * 读取绑定项目的档案兜底种子。读取失败不阻塞主流程：
 * 退回空种子，行为与本改动之前一致（照常追问）。
 * 知识库只在档案没给出目标时才查——多一次查询只在真需要时付。
 */
export async function loadIpProfileSeed(input: { projectId?: string }): Promise<IpProfileSeed> {
  if (!input.projectId) return {}
  try {
    const pages = await listIpWikiPages({ projectId: input.projectId, pageTypes: SEED_PAGE_TYPES })
    const seed = profileSeedFromPages(pages)
    if (seed.goal) return seed
    const fromKnowledge = goalFromKnowledgeEntries(await listKnowledgeGoalEntries(input.projectId))
    return fromKnowledge ? { ...seed, ...fromKnowledge } : seed
  } catch (error) {
    console.warn("[aim-profile-seed] 档案兜底读取失败，本轮照常追问", error)
    return {}
  }
}
