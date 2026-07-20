/**
 * @description 清洗视频文案分析 Markdown，移除多余加粗标记和无关行
 * @param markdown - 原始 Markdown 文本
 * @returns 清洗后的 Markdown 文本
 */
export function cleanVideoCopyAnalysisMarkdown(markdown: string): string {
  return markdown
    .replace(/\*\*([^*\n：:]{2,24})\*\*([：:])/g, "$1$2")
    .replace(/\*\*/g, "")
    .split("\n")
    .filter((line) => !/^\s*[-•]?\s*(心理作用|迁移保留点)[：:]/.test(line))
    .map((line) => line.replace(/^(#{3,6})\s*正文[-—\s]*(?:\d+|[一二三四五六七八九十]+)[：:]\s*/, "$1 "))
    .join("\n")
    .trim()
}

export interface VideoCopyAnalysisNode {
  title: string
  original: string
  structureEffect: string
}

export interface VideoCopyAnalysisDisplay {
  nodes: VideoCopyAnalysisNode[]
  supplementalMarkdown: string
}

/**
 * @description 解析视频文案分析 Markdown 为结构化展示数据（拆解节点 + 补充内容）
 * @param markdown - 视频文案分析的 Markdown 文本
 * @returns 结构化展示对象，包含拆解节点数组和补充 Markdown
 */
export function parseVideoCopyAnalysisDisplay(markdown: string): VideoCopyAnalysisDisplay {
  const cleaned = cleanVideoCopyAnalysisMarkdown(markdown)
  const lines = cleaned.split("\n")
  const nodes: VideoCopyAnalysisNode[] = []
  const supplemental: string[] = []
  let inStructure = false
  let current: { title: string; lines: string[] } | null = null

  function flushCurrent() {
    if (!current) return
    const original: string[] = []
    const structureEffect: string[] = []
    let currentField: "original" | "structureEffect" | null = null

    for (const line of current.lines) {
      const originalMatch = line.match(/^\s*[-•]?\s*原文片段[：:]\s*(.*)$/)
      if (originalMatch) {
        currentField = "original"
        original.push(originalMatch[1].trim())
        continue
      }
      const effectMatch = line.match(/^\s*[-•]?\s*结构作用[：:]\s*(.*)$/)
      if (effectMatch) {
        currentField = "structureEffect"
        structureEffect.push(effectMatch[1].trim())
        continue
      }
      if (currentField === "original") {
        original.push(line.trim())
      }
      if (currentField === "structureEffect") {
        structureEffect.push(line.trim())
      }
    }

    const originalText = original.filter(Boolean).join("\n")
    const structureEffectText = structureEffect.filter(Boolean).join("\n")
    if (originalText || structureEffectText) {
      nodes.push({
        title: current.title,
        original: originalText,
        structureEffect: structureEffectText,
      })
    }
    current = null
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^##\s+结构拆解/.test(trimmed)) {
      flushCurrent()
      inStructure = true
      continue
    }
    if (/^##\s+/.test(trimmed)) {
      flushCurrent()
      inStructure = false
      supplemental.push(line)
      continue
    }
    if (inStructure && /^###\s+/.test(trimmed)) {
      flushCurrent()
      current = { title: trimmed.replace(/^###\s+/, ""), lines: [] }
      continue
    }
    if (inStructure && current) {
      current.lines.push(line)
      continue
    }
    if (trimmed) supplemental.push(line)
  }

  flushCurrent()

  return {
    nodes,
    supplementalMarkdown: supplemental.join("\n").trim(),
  }
}
