export type TopicSource = { category: string; title: string; content: string }
const SUPPLEMENTAL_KNOWLEDGE_LIMIT = 4

function partitionBenchmarkKnowledge(sources: TopicSource[]) {
  const benchmark: TopicSource[] = []
  const other: TopicSource[] = []

  for (const source of sources) {
    if (source.category === "benchmark_reference") benchmark.push(source)
    else other.push(source)
  }

  return { benchmark, other }
}

/**
 * @description 构建projectsource
 * @param project - project
 * @returns TopicSource | null
 */
export function buildProjectSource(project: {
  name: string
  industry: string | null
  targetCustomer: string | null
  offer: string | null
  deliveryGoal: string | null
} | null): TopicSource | null {
  if (!project) return null
  const projectLines = [
    project.industry ? `行业：${project.industry}` : null,
    project.targetCustomer ? `目标客户：${project.targetCustomer}` : null,
    project.offer ? `产品/服务：${project.offer}` : null,
    project.deliveryGoal ? `交付目标：${project.deliveryGoal}` : null,
  ].filter(Boolean)

  if (projectLines.length === 0) return null
  return {
    category: "client_project",
    title: `IP操作方案基准线：${project.name}`,
    content: [
      "定位：这是全站选题策划的基准线，所有选题必须先对齐本项目全案。",
      ...projectLines,
    ].join("\n"),
  }
}

/**
 * @description 构建benchmarkaccountsources
 * @param accounts - accounts
 * @returns TopicSource[]
 */
export function buildBenchmarkAccountSources(
  accounts: Array<{ nickname: string | null; targetUrl: string; latestVideos: unknown; viralVideos: unknown }>,
): TopicSource[] {
  return accounts.flatMap((account) => {
    const viralVideos = Array.isArray(account.viralVideos) ? account.viralVideos : []
    const latestVideos = Array.isArray(account.latestVideos) ? account.latestVideos : []
    const seen = new Set<string>()
    const videos = [...viralVideos, ...latestVideos]
      .filter((video) => {
        const item = video as { videoId?: string; title?: string }
        const key = item.videoId || item.title || JSON.stringify(item)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 5)
    if (videos.length === 0) return []

    return [{
      category: "benchmark_reference",
      title: account.nickname || account.targetUrl,
      content: [
        "对标账号已验证内容信号：优先学习选题母题、开头钩子、用户痛点和互动结构，不照搬标题。",
        `来源账号：${account.targetUrl}`,
        ...videos.map((video, index) => {
          const item = video as { title?: string; likes?: number; comments?: number; shares?: number; collects?: number }
          return `${index + 1}. ${item.title || "无标题"}｜赞${item.likes ?? 0} 评${item.comments ?? 0} 转${item.shares ?? 0} 藏${item.collects ?? 0}`
        }),
      ].join("\n"),
    }]
  }).slice(0, 4)
}

function truncateText(value: string | null | undefined, limit = 180) {
  const text = value?.replace(/\s+/g, " ").trim() ?? ""
  return text.length > limit ? `${text.slice(0, limit)}...` : text
}

/**
 * @description 构建videocopyextractionsources
 * @param extractions - extractions
 * @returns TopicSource[]
 */
export function buildVideoCopyExtractionSources(
  extractions: Array<{ videoTitle: string | null; sourceUrl: string; transcript: string | null; analysisResult: unknown }>,
): TopicSource[] {
  return extractions.flatMap((record) => {
    const analysis = record.analysisResult ? truncateText(JSON.stringify(record.analysisResult), 360) : ""
    const transcript = truncateText(record.transcript, 180)
    if (!analysis && !transcript) return []
    return [{
      category: "benchmark_reference",
      title: record.videoTitle || record.sourceUrl,
      content: [
        "对标文案拆解信号：优先迁移钩子、结构节奏、情绪推进和转化设计，禁止照抄原句。",
        analysis ? `结构化拆解：${analysis}` : null,
        transcript ? `原文摘要：${transcript}` : null,
        `来源：${record.sourceUrl}`,
      ].filter(Boolean).join("\n"),
    }]
  }).slice(0, 4)
}

/**
 * @description 构建topicsources
 * @param input - 输入数据
 * @returns 无返回值
 */
export function buildTopicSources(input: {
  projectSource: TopicSource | null
  selectedKnowledge: TopicSource[]
  benchmarkSources: TopicSource[]
  videoCopySources: TopicSource[]
  hotTopicSources: TopicSource[]
}) {
  const { benchmark: selectedBenchmarkKnowledge, other: selectedNonBenchmarkKnowledge } =
    partitionBenchmarkKnowledge(input.selectedKnowledge)
  const hasPrioritySignals =
    input.benchmarkSources.length > 0
    || input.videoCopySources.length > 0
    || input.hotTopicSources.length > 0
  const supplementalKnowledge = hasPrioritySignals
    ? selectedNonBenchmarkKnowledge.slice(0, SUPPLEMENTAL_KNOWLEDGE_LIMIT)
    : selectedNonBenchmarkKnowledge

  return [
    ...(input.projectSource ? [input.projectSource] : []),
    ...input.benchmarkSources,
    ...input.videoCopySources,
    ...selectedBenchmarkKnowledge,
    ...supplementalKnowledge,
    ...input.hotTopicSources,
  ]
}
