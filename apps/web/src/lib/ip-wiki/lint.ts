import { prisma } from "@/lib/prisma"
import { listIpWikiPages, type IpWikiPageRow } from "@/lib/ip-wiki/repo"
import {
  IP_WIKI_CORE_PAGE_TYPES,
  IP_WIKI_PAGE_TYPE_LABELS,
  type IpWikiPageType,
} from "@/lib/ip-wiki/types"

/**
 * IP 定位维基 · Lint 体检层
 *
 * Karpathy LLM-Wiki 模式的「Lint」步骤：按 schema 规则对某 IP 全案的 active 维基页
 * 做确定性体检——死链、底盘字段缺失、来源过时、策略比例失衡——产出可执行的修复清单。
 *
 * 这是确定性规则（非 LLM 判定），结果稳定可测；语义级矛盾留待后续扩展。
 */

export type IpWikiLintSeverity = "error" | "warning"

export interface IpWikiLintFinding {
  severity: IpWikiLintSeverity
  /** 机器可读规则码：missing_core_page | missing_chassis_field | dead_link | stale_source | strategy_sum */
  rule: string
  pageType?: IpWikiPageType
  pageId?: string
  message: string
}

export interface IpWikiLintOptions {
  /** 已知的定位方案 AimGeneration id 集合，用于检测过时来源；不传则跳过该规则 */
  existingGenerationIds?: Set<string>
}

export interface IpWikiLintReport {
  totalPages: number
  findings: IpWikiLintFinding[]
  errorCount: number
  warningCount: number
  /** 无 error 即视为通过（warning 不阻断） */
  passed: boolean
}

const CONTENT_STRATEGY_REQUIRED_FIELDS: Array<{ key: string; label: string }> = [
  { key: "topicDistribution", label: "话题分布" },
  { key: "contentFormats", label: "内容形式" },
  { key: "hookPatterns", label: "钩子模式" },
  { key: "postingFrequency", label: "发布频率" },
  { key: "bestPostingTimes", label: "最佳时段" },
  { key: "viralFormula", label: "爆款公式" },
]

/** 话题分布 / 内容形式比例合计允许偏离 100% 的阈值 */
const PERCENT_SUM_TOLERANCE = 15

function asFrontmatter(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function hasStrategyField(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === "string") return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function checkPercentSum(
  value: unknown,
  label: string,
  page: IpWikiPageRow,
  findings: IpWikiLintFinding[]
): void {
  if (!Array.isArray(value) || value.length === 0) return // 缺字段由 missing_chassis_field 兜底
  const pcts: number[] = []
  for (const item of value) {
    const r = asFrontmatter(item)
    if (typeof r.percentage === "number") pcts.push(r.percentage)
  }
  if (pcts.length === 0) return
  const sum = pcts.reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 100) > PERCENT_SUM_TOLERANCE) {
    findings.push({
      severity: "warning",
      rule: "strategy_sum",
      pageType: page.pageType,
      pageId: page.id,
      message: `${label}比例合计 ${sum}%，偏离 100% 较多，建议校准`,
    })
  }
}

/**
 * 纯函数体检：不依赖 Prisma，导出以便单测。
 * 入参为某 IP 全案的全部 active 维基页。
 */
export function lintIpWikiPages(pages: IpWikiPageRow[], options: IpWikiLintOptions = {}): IpWikiLintReport {
  const findings: IpWikiLintFinding[] = []
  const activeTitles = new Set(pages.map((p) => p.title.trim()).filter(Boolean))
  const byType = new Map<IpWikiPageType, IpWikiPageRow[]>()
  for (const p of pages) {
    const bucket = byType.get(p.pageType)
    if (bucket) bucket.push(p)
    else byType.set(p.pageType, [p])
  }

  // 1. 缺失核心页（定位底盘不完整）
  for (const t of IP_WIKI_CORE_PAGE_TYPES) {
    if (!byType.has(t)) {
      findings.push({
        severity: "warning",
        rule: "missing_core_page",
        pageType: t,
        message: `缺少核心页「${IP_WIKI_PAGE_TYPE_LABELS[t]}」，定位底盘不完整`,
      })
    }
  }

  for (const page of pages) {
    // 2. 底盘字段缺失（仅 content_strategy，因下游注入依赖这六个字段）
    if (page.pageType === "content_strategy") {
      const fm = asFrontmatter(page.frontmatter)
      const missing = CONTENT_STRATEGY_REQUIRED_FIELDS.filter((f) => !hasStrategyField(fm[f.key]))
      for (const f of missing) {
        findings.push({
          severity: "error",
          rule: "missing_chassis_field",
          pageType: page.pageType,
          pageId: page.id,
          message: `内容策略底盘缺失必填字段「${f.label}」(${f.key})，下游注入会缺关键策略`,
        })
      }
      // 3. 策略比例失衡（话题分布 / 内容形式）
      checkPercentSum(fm.topicDistribution, "话题分布", page, findings)
      checkPercentSum(fm.contentFormats, "内容形式", page, findings)
    }

    // 4. 死链：links 指向的 title 在当前 active 页中不存在
    if (Array.isArray(page.links)) {
      for (const link of page.links) {
        const target = typeof link === "string" ? link.trim() : ""
        if (target && !activeTitles.has(target)) {
          findings.push({
            severity: "warning",
            rule: "dead_link",
            pageType: page.pageType,
            pageId: page.id,
            message: `双向链接「${target}」找不到对应维基页（死链）`,
          })
        }
      }
    }

    // 5. 过时来源：sources 里的 aim_generation id 已不在库
    if (options.existingGenerationIds && Array.isArray(page.sources)) {
      for (const src of page.sources) {
        const s = asFrontmatter(src)
        if (s.kind === "aim_generation" && typeof s.id === "string" && s.id) {
          if (!options.existingGenerationIds.has(s.id)) {
            findings.push({
              severity: "warning",
              rule: "stale_source",
              pageType: page.pageType,
              pageId: page.id,
              message: `来源定位方案 ${s.id} 已不存在，该页可能过时`,
            })
          }
        }
      }
    }
  }

  const errorCount = findings.filter((f) => f.severity === "error").length
  const warningCount = findings.filter((f) => f.severity === "warning").length
  return {
    totalPages: pages.length,
    findings,
    errorCount,
    warningCount,
    passed: errorCount === 0,
  }
}

/**
 * 加载某 IP 全案的 active 维基页并体检。
 * 会顺带查 sources 引用的定位方案是否仍在库，用于「过时」检测。
 */
export async function runIpWikiLint(input: {
  projectId: string
}): Promise<IpWikiLintReport & { projectId: string }> {
  const pages = await listIpWikiPages({ projectId: input.projectId })

  const genIds = new Set<string>()
  for (const p of pages) {
    if (Array.isArray(p.sources)) {
      for (const s of p.sources) {
        const r = asFrontmatter(s)
        if (r.kind === "aim_generation" && typeof r.id === "string" && r.id) genIds.add(r.id)
      }
    }
  }

  let existingGenerationIds: Set<string> | undefined
  if (genIds.size > 0) {
    const rows = await prisma.aimGeneration.findMany({
      where: { id: { in: [...genIds] } },
      select: { id: true },
    })
    existingGenerationIds = new Set(rows.map((r) => r.id))
  }

  const report = lintIpWikiPages(pages, { existingGenerationIds })
  return { projectId: input.projectId, ...report }
}
