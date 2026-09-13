export const DATA_SOVEREIGNTY_COPY = {
  title: "数据主权承诺",
  ownership: "这个项目里的内容、知识、效果数据和素材引用，归你的机构所有。明动 AIM 只是帮你生产和管理，不把它们卖给第三方，也不拿去训练对外模型。",
  isolation: "隔离边界是项目：一个登录账号绑定一个 IP 项目。别的客户的原文进不了你的项目，你的原文也进不了别人的项目。",
  exit: "你可以随时把当前项目的数据导出带走。导出是只读快照，不会改库、不会取消服务。",
  notIncluded: "导出不含登录密钥、渠道密钥、向量检索底稿、激活码。素材文件本身仍在对象存储里，这里带走的是引用清单。",
}

export const PROJECT_EXPORT_LIMITS = {
  generations: 500,
  knowledge: 1000,
  outcomes: 1000,
  wikiPages: 200,
  assets: 500,
  contentChars: 8000,
}

export interface ProjectExportSource {
  project: {
    id: string
    name: string
    companyName: string | null
    industry: string | null
    targetCustomer: string | null
    offer: string | null
    deliveryGoal: string | null
  }
  generations: Array<{
    id: string
    topicTitle: string | null
    agentId: string | null
    workflowStatus: string
    publishedAt: Date | null
    publishPlatform: string | null
    publishUrl: string | null
    videoScript: string | null
    wechatArticle: string | null
    createdAt: Date
  }>
  knowledge: Array<{
    id: string
    category: string
    title: string
    content: string
    tags: unknown
    valueGrade: string | null
    createdAt: Date
  }>
  outcomes: Array<{
    id: string
    generationId: string
    platform: string | null
    collectWindowDay: number
    views: number | null
    likes: number | null
    comments: number | null
    saves: number | null
    shares: number | null
    collectedAt: Date
  }>
  wikiPages: Array<{
    id: string
    pageType: string
    title: string
    content: string
    updatedAt: Date
  }>
  assets: Array<{
    id: string
    name: string
    assetType: string
    url: string
    createdAt: Date
  }>
}

export interface ProjectDataExport {
  exportedAt: string
  project: ProjectExportSource["project"]
  sovereignty: typeof DATA_SOVEREIGNTY_COPY
  truncated: {
    generations: number
    knowledge: number
    outcomes: number
    wikiPages: number
    assets: number
  }
  counts: {
    generations: number
    knowledge: number
    outcomes: number
    wikiPages: number
    assets: number
  }
  contents: Array<{
    id: string
    topicTitle: string | null
    agentId: string | null
    workflowStatus: string
    publishedAt: string | null
    publishPlatform: string | null
    publishUrl: string | null
    excerpt: string
    createdAt: string
  }>
  knowledge: Array<{
    id: string
    category: string
    title: string
    content: string
    tags: unknown
    valueGrade: string | null
    createdAt: string
  }>
  outcomes: Array<{
    id: string
    generationId: string
    platform: string | null
    collectWindowDay: number
    views: number | null
    likes: number | null
    comments: number | null
    saves: number | null
    shares: number | null
    collectedAt: string
  }>
  wikiPages: Array<{
    id: string
    pageType: string
    title: string
    content: string
    updatedAt: string
  }>
  materialRefs: Array<{
    id: string
    name: string
    assetType: string
    url: string
    scope: "account"
    createdAt: string
  }>
}

function clip(text: string | null | undefined, max = PROJECT_EXPORT_LIMITS.contentChars): string {
  if (!text) return ""
  return text.length <= max ? text : `${text.slice(0, max)}\n…(已截断)`
}

function sliceWithTruncated<T>(rows: T[], limit: number): { items: T[]; truncated: number } {
  return { items: rows.slice(0, limit), truncated: Math.max(0, rows.length - limit) }
}

export function buildProjectDataExport(source: ProjectExportSource, exportedAt = new Date()): ProjectDataExport {
  const generations = sliceWithTruncated(source.generations, PROJECT_EXPORT_LIMITS.generations)
  const knowledge = sliceWithTruncated(source.knowledge, PROJECT_EXPORT_LIMITS.knowledge)
  const outcomes = sliceWithTruncated(source.outcomes, PROJECT_EXPORT_LIMITS.outcomes)
  const wikiPages = sliceWithTruncated(source.wikiPages, PROJECT_EXPORT_LIMITS.wikiPages)
  const assets = sliceWithTruncated(source.assets, PROJECT_EXPORT_LIMITS.assets)

  return {
    exportedAt: exportedAt.toISOString(),
    project: source.project,
    sovereignty: DATA_SOVEREIGNTY_COPY,
    truncated: {
      generations: generations.truncated,
      knowledge: knowledge.truncated,
      outcomes: outcomes.truncated,
      wikiPages: wikiPages.truncated,
      assets: assets.truncated,
    },
    counts: {
      generations: generations.items.length,
      knowledge: knowledge.items.length,
      outcomes: outcomes.items.length,
      wikiPages: wikiPages.items.length,
      assets: assets.items.length,
    },
    contents: generations.items.map((row) => ({
      id: row.id,
      topicTitle: row.topicTitle,
      agentId: row.agentId,
      workflowStatus: row.workflowStatus,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      publishPlatform: row.publishPlatform,
      publishUrl: row.publishUrl,
      excerpt: clip(row.videoScript || row.wechatArticle),
      createdAt: row.createdAt.toISOString(),
    })),
    knowledge: knowledge.items.map((row) => ({
      id: row.id,
      category: row.category,
      title: row.title,
      content: clip(row.content),
      tags: row.tags,
      valueGrade: row.valueGrade,
      createdAt: row.createdAt.toISOString(),
    })),
    outcomes: outcomes.items.map((row) => ({
      id: row.id,
      generationId: row.generationId,
      platform: row.platform,
      collectWindowDay: row.collectWindowDay,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      saves: row.saves,
      shares: row.shares,
      collectedAt: row.collectedAt.toISOString(),
    })),
    wikiPages: wikiPages.items.map((row) => ({
      id: row.id,
      pageType: row.pageType,
      title: row.title,
      content: clip(row.content),
      updatedAt: row.updatedAt.toISOString(),
    })),
    materialRefs: assets.items.map((row) => ({
      id: row.id,
      name: row.name,
      assetType: row.assetType,
      url: row.url,
      scope: "account" as const,
      createdAt: row.createdAt.toISOString(),
    })),
  }
}

export function renderProjectDataExportMarkdown(payload: ProjectDataExport): string {
  const lines = [
    `# ${payload.project.name} 数据导出`,
    "",
    `导出时间：${payload.exportedAt}`,
    `项目 ID：${payload.project.id}`,
    "",
    `## ${payload.sovereignty.title}`,
    "",
    payload.sovereignty.ownership,
    "",
    payload.sovereignty.isolation,
    "",
    payload.sovereignty.exit,
    "",
    payload.sovereignty.notIncluded,
    "",
    "## 内容",
    "",
  ]

  for (const item of payload.contents) {
    lines.push(`### ${item.topicTitle || "未标题内容"}`)
    lines.push(`状态：${item.workflowStatus} · ${item.createdAt}`)
    if (item.publishUrl) lines.push(`发布：${item.publishPlatform || "未标注"} ${item.publishUrl}`)
    if (item.excerpt) lines.push("", item.excerpt)
    lines.push("")
  }

  lines.push("## 知识条目", "")
  for (const item of payload.knowledge) {
    lines.push(`### ${item.title}`)
    lines.push(`${item.category}${item.valueGrade ? ` · ${item.valueGrade}` : ""}`)
    lines.push("", item.content, "")
  }

  lines.push("## 效果数据", "")
  for (const item of payload.outcomes) {
    lines.push(`- 作品 ${item.generationId} · ${item.collectWindowDay} 天窗 · 播放 ${item.views ?? "—"} / 赞 ${item.likes ?? "—"} / 评 ${item.comments ?? "—"}`)
  }

  lines.push("", "## 素材引用清单", "")
  lines.push("素材按账号存储，不是项目字段。下面只是引用，不含文件本体。", "")
  for (const item of payload.materialRefs) {
    lines.push(`- ${item.name}（${item.assetType}） ${item.url}`)
  }

  if (Object.values(payload.truncated).some((count) => count > 0)) {
    lines.push("", "## 截断说明", "")
    lines.push(`内容还剩 ${payload.truncated.generations} 条未导出；知识 ${payload.truncated.knowledge}；效果 ${payload.truncated.outcomes}；素材 ${payload.truncated.assets}。`)
  }

  return `${lines.join("\n")}\n`
}

export function exportFileName(projectName: string, format: "json" | "md", exportedAt: Date): string {
  const stamp = exportedAt.toISOString().slice(0, 10)
  const safeName = projectName.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "project"
  return `${safeName}-aim-export-${stamp}.${format}`
}
