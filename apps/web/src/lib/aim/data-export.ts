/**
 * 数据主权 L0（WP-A6）：项目数据一键导出的纯序列化逻辑。
 *
 * 边界：只导出账号绑定项目自己的数据（内容生成、知识条目、效果数据），
 * 绝不跨项目。导出是"退出带走"承诺的兑现，格式md/json 都要能脱离 AIM 独立阅读。
 * 行数上限防误操作把大库一次性拉爆；真实全量迁移走运维通道。
 */

export const EXPORT_PER_TYPE_LIMIT = 2000

export interface ExportedGeneration {
  id: string
  topicTitle: string | null
  workflowStatus: string
  publishPlatform: string | null
  publishUrl: string | null
  publishedAt: string | null
  createdAt: string
  rawInput: string
  videoScript: string | null
  wechatArticle: string | null
  momentsPost: string | null
  shootingBrief: string | null
  rawCopy: string | null
  qualityScores: unknown
}

export interface ExportedKnowledgeEntry {
  id: string
  category: string
  title: string
  content: string
  tags: unknown
  valueGrade: string | null
  status: string
  createdAt: string
}

export interface ExportedContentOutcome {
  id: string
  generationId: string
  collectWindowDay: number
  views: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  shares: number | null
  qualifiedLeadCount: number | null
  appointmentCount: number | null
  dealCount: number | null
  revenue: string | null
  verdictCode: string | null
  collectedAt: string
}

export interface ProjectExportBundle {
  format: "aim-project-export"
  version: 1
  exportedAt: string
  project: { id: string; name: string }
  truncated: { generations: boolean; knowledgeEntries: boolean; contentOutcomes: boolean }
  counts: { generations: number; knowledgeEntries: number; contentOutcomes: number }
  generations: ExportedGeneration[]
  knowledgeEntries: ExportedKnowledgeEntry[]
  contentOutcomes: ExportedContentOutcome[]
}

export interface ProjectExportInput {
  exportedAt: Date
  project: { id: string; name: string }
  generations: ExportedGeneration[]
  knowledgeEntries: ExportedKnowledgeEntry[]
  contentOutcomes: ExportedContentOutcome[]
}

export function buildProjectExportBundle(input: ProjectExportInput): ProjectExportBundle {
  return {
    format: "aim-project-export",
    version: 1,
    exportedAt: input.exportedAt.toISOString(),
    project: input.project,
    truncated: {
      generations: input.generations.length >= EXPORT_PER_TYPE_LIMIT,
      knowledgeEntries: input.knowledgeEntries.length >= EXPORT_PER_TYPE_LIMIT,
      contentOutcomes: input.contentOutcomes.length >= EXPORT_PER_TYPE_LIMIT,
    },
    counts: {
      generations: input.generations.length,
      knowledgeEntries: input.knowledgeEntries.length,
      contentOutcomes: input.contentOutcomes.length,
    },
    generations: input.generations,
    knowledgeEntries: input.knowledgeEntries,
    contentOutcomes: input.contentOutcomes,
  }
}

function iso(value: string | null): string {
  return value ?? "未发布"
}

function markdownHeader(bundle: ProjectExportBundle): string[] {
  const lines: string[] = []
  lines.push(`# AIM 项目数据导出：${bundle.project.name}`)
  lines.push("")
  lines.push(`- 导出时间：${bundle.exportedAt}`)
  lines.push(
    `- 数量：内容生成 ${bundle.counts.generations} · 知识条目 ${bundle.counts.knowledgeEntries} · 效果数据 ${bundle.counts.contentOutcomes}`,
  )
  const truncatedSections = Object.entries(bundle.truncated)
    .filter(([, hit]) => hit)
    .map(([key]) => key)
  if (truncatedSections.length > 0) {
    lines.push(`- 注意：以下分节达到单次导出上限（${EXPORT_PER_TYPE_LIMIT} 条），全量导出请联系管理员：${truncatedSections.join("、")}`)
  }
  lines.push("")
  lines.push("本文件由 AIM 数据主权导出功能生成，数据归属项目方；脱离 AIM 后仍可独立阅读。")
  lines.push("")
  return lines
}

function markdownGenerationSection(generations: ExportedGeneration[]): string[] {
  const lines: string[] = []
  lines.push(`## 内容生成（${generations.length}）`)
  lines.push("")
  for (const generation of generations) {
    lines.push(`### ${generation.topicTitle ?? "（无标题）"}（${generation.id}）`)
    lines.push("")
    lines.push(
      `- 状态：${generation.workflowStatus} · 发布：${iso(generation.publishPlatform)} ${generation.publishedAt ? new Date(generation.publishedAt).toISOString() : ""} ${generation.publishUrl ?? ""}`.trimEnd(),
    )
    lines.push(`- 创建：${generation.createdAt}`)
    appendGenerationBodies(lines, generation)
    lines.push("")
  }
  return lines
}

const GENERATION_BODY_FIELDS: Array<{ key: "videoScript" | "wechatArticle" | "momentsPost" | "shootingBrief" | "rawCopy"; label: string }> = [
  { key: "videoScript", label: "口播稿" },
  { key: "wechatArticle", label: "公众号文章" },
  { key: "momentsPost", label: "朋友圈文案" },
  { key: "shootingBrief", label: "拍摄脚本" },
  { key: "rawCopy", label: "原始文案" },
]

function appendGenerationBodies(lines: string[], generation: ExportedGeneration): void {
  if (generation.rawInput) {
    lines.push("", "**输入**", "", generation.rawInput)
  }
  for (const field of GENERATION_BODY_FIELDS) {
    const value = generation[field.key]
    if (value) {
      lines.push("", `**${field.label}**`, "", value)
    }
  }
}

function markdownKnowledgeSection(entries: ExportedKnowledgeEntry[]): string[] {
  const lines: string[] = []
  lines.push(`## 知识条目（${entries.length}）`)
  lines.push("")
  for (const entry of entries) {
    lines.push(`### [${entry.category}${entry.valueGrade ? `/${entry.valueGrade}` : ""}] ${entry.title}`)
    lines.push("")
    lines.push(entry.content)
    lines.push("")
  }
  return lines
}

function markdownOutcomeSection(outcomes: ExportedContentOutcome[]): string[] {
  const lines: string[] = []
  lines.push(`## 效果数据（${outcomes.length}）`)
  lines.push("")
  lines.push("| 生成ID | 窗口 | 播放 | 点赞 | 评论 | 收藏 | 转发 | 线索 | 预约 | 成交 | 回款 | 判定 |")
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
  for (const outcome of outcomes) {
    lines.push(
      `| ${outcome.generationId} | ${outcome.collectWindowDay}天 | ${outcome.views ?? "—"} | ${outcome.likes ?? "—"} | ${outcome.comments ?? "—"} | ${outcome.saves ?? "—"} | ${outcome.shares ?? "—"} | ${outcome.qualifiedLeadCount ?? "—"} | ${outcome.appointmentCount ?? "—"} | ${outcome.dealCount ?? "—"} | ${outcome.revenue ?? "—"} | ${outcome.verdictCode ?? "未知"} |`,
    )
  }
  lines.push("")
  return lines
}

export function toMarkdownExport(bundle: ProjectExportBundle): string {
  const lines: string[] = [
    ...markdownHeader(bundle),
    ...markdownGenerationSection(bundle.generations),
    ...markdownKnowledgeSection(bundle.knowledgeEntries),
    ...markdownOutcomeSection(bundle.contentOutcomes),
  ]
  return lines.join("\n")
}

export const DATA_SOVEREIGNTY_STATEMENT = {
  ownership: "项目内全部内容、知识条目与效果数据归属项目方，AIM 仅按授权处理。",
  isolation: "数据按项目隔离：一个 AIM 账号绑定一个 IP 项目，项目之间互不可见，采集来的公开对标数据单独标注为共享。",
  exit: "随时可一键导出本项目数据（JSON / Markdown）；退出后数据仍归项目方所有。",
} as const
