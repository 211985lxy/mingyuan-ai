/**
 * 解析 Codex / WorkBuddy / 千问等外部 AI「关于你的记忆」粘贴文本。
 * 按常见小节拆成多条知识预览；认不出结构时整段原文入库，禁止瞎编。
 */

export type ExternalAiMemorySource = "workbuddy" | "codex" | "qwen" | "unknown"

export type ExternalAiMemoryDraft = {
  title: string
  content: string
  sectionKey: string
}

export type ParsedExternalAiMemory = {
  ok: boolean
  source: ExternalAiMemorySource
  confidence: "high" | "medium" | "low"
  summary: string
  drafts: ExternalAiMemoryDraft[]
}

const SECTION_SPECS: Array<{ key: string; labels: string[]; title: string }> = [
  {
    key: "work_background",
    labels: ["工作背景", "Work background", "Professional background"],
    title: "基础记忆·工作背景",
  },
  {
    key: "personal_background",
    labels: ["个人背景", "Personal background", "User preferences", "Preferences"],
    title: "基础记忆·个人背景",
  },
  {
    key: "current_focus",
    labels: ["当前关注", "Current focus", "Focus areas", "Current priorities"],
    title: "基础记忆·当前关注",
  },
  {
    key: "recent_activity",
    labels: ["近期动态", "Recent activity", "Recent updates", "Recent"],
    title: "基础记忆·近期动态",
  },
]

const SOURCE_HINTS: Array<{ source: ExternalAiMemorySource; patterns: RegExp[] }> = [
  {
    source: "workbuddy",
    patterns: [/关于你的记忆/, /来自对话的记忆/, /WorkBuddy/i],
  },
  {
    source: "codex",
    patterns: [/\bCodex\b/i, /AGENTS\.md/, /##\s*Memory\b/i, /User preferences/i],
  },
  {
    source: "qwen",
    patterns: [/通义千问/, /千问记忆/, /\bQwen\b/i, /阿里云百炼/],
  },
]

function normalizeText(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").trim()
}

function detectSource(text: string): ExternalAiMemorySource {
  for (const hint of SOURCE_HINTS) {
    if (hint.patterns.some((p) => p.test(text))) return hint.source
  }
  // WorkBuddy 样例常无四段中文标题且无来源字样
  const hasWorkBuddySections =
    /工作背景/.test(text) && /个人背景/.test(text) && (/当前关注/.test(text) || /近期动态/.test(text))
  if (hasWorkBuddySections) return "workbuddy"
  return "unknown"
}

function stripHeadingMarkers(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^[-*•]\s+/, "")
    .trim()
}

function matchSectionLabel(line: string): (typeof SECTION_SPECS)[number] | null {
  const normalized = stripHeadingMarkers(line)
  if (!normalized || normalized.length > 40) return null
  for (const spec of SECTION_SPECS) {
    if (spec.labels.some((label) => normalized === label || normalized.toLowerCase() === label.toLowerCase())) {
      return spec
    }
  }
  return null
}

function splitByKnownSections(text: string): ExternalAiMemoryDraft[] {
  const lines = text.split("\n")
  const drafts: ExternalAiMemoryDraft[] = []
  let current: { spec: (typeof SECTION_SPECS)[number]; body: string[] } | null = null

  const flush = () => {
    if (!current) return
    const content = current.body.join("\n").trim()
    if (content) {
      drafts.push({
        title: current.spec.title,
        content,
        sectionKey: current.spec.key,
      })
    }
    current = null
  }

  for (const line of lines) {
    const spec = matchSectionLabel(line)
    if (spec) {
      flush()
      current = { spec, body: [] }
      continue
    }
    // 跳过总标题行
    const plain = stripHeadingMarkers(line)
    if (!current && /^(关于你的记忆|Memory|你的记忆)$/i.test(plain)) continue
    if (current) current.body.push(line)
  }
  flush()
  return drafts
}

/**
 * 解析外部 AI 记忆粘贴文本，产出待入库草稿（不写库）。
 */
export function parseExternalAiMemoryText(raw: string): ParsedExternalAiMemory {
  const text = normalizeText(raw)
  if (!text) {
    return {
      ok: false,
      source: "unknown",
      confidence: "low",
      summary: "粘贴内容为空，请从 WorkBuddy / Codex / 千问复制「关于你的记忆」后再试。",
      drafts: [],
    }
  }

  const source = detectSource(text)
  const sectionDrafts = splitByKnownSections(text)

  if (sectionDrafts.length >= 2) {
    return {
      ok: true,
      source,
      confidence: sectionDrafts.length >= 3 ? "high" : "medium",
      summary: `已识别为${sourceLabel(source)}记忆，拆成 ${sectionDrafts.length} 条基础记忆。`,
      drafts: sectionDrafts,
    }
  }

  if (sectionDrafts.length === 1) {
    return {
      ok: true,
      source,
      confidence: "medium",
      summary: `已识别 1 个分段，将作为一条基础记忆入库。`,
      drafts: sectionDrafts,
    }
  }

  // 认不出结构：整段原文入库，不瞎拆
  return {
    ok: true,
    source,
    confidence: "low",
    summary: "未识别到常见分段标题，将整段原文作为一条基础记忆入库（不会改写内容）。",
    drafts: [
      {
        title: "基础记忆·外部AI原文",
        content: text,
        sectionKey: "full_text",
      },
    ],
  }
}

export function sourceLabel(source: ExternalAiMemorySource): string {
  switch (source) {
    case "workbuddy":
      return "WorkBuddy"
    case "codex":
      return "Codex"
    case "qwen":
      return "千问"
    default:
      return "外部 AI"
  }
}

export function buildExternalMemoryTags(source: ExternalAiMemorySource, sectionKey: string): string[] {
  return [
    "external_ai_memory",
    "base_memory",
    `source:${source}`,
    `section:${sectionKey}`,
  ]
}
