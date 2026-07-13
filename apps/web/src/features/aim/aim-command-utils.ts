import type { AimChatContent } from "@/lib/api/client"
import { buildBenchmarkLengthRule, buildBenchmarkRecreationSopBlock } from "@/lib/aim-benchmark-length"
import { assessBenchmarkRewrite } from "@/lib/aim-benchmark-quality"
import type { AimChatToolAction, AimImageAttachment, ChatMessage } from "@/features/aim/aim-workbench-types"
import { extractBenchmarkOriginalText } from "@/features/aim/aim-text-utils"

export function detectLarkToolAction(text: string): AimChatToolAction | null {
  if (!/飞书/.test(text)) return null
  if (/同步.*选题|导入.*选题/.test(text)) return "import_lark_topics"
  if (/热点|竞品|优质账号|参考|数据/.test(text) && /导入|同步/.test(text)) return "import_lark_archive_data"
  if (/项目/.test(text) && /导入|同步/.test(text)) return "import_lark_project_data"
  if (/回写|同步到飞书|同步.*脚本|同步.*内容/.test(text)) return "export_lark_generation"
  return null
}

export function buildChatContent(text: string, images: AimImageAttachment[]): AimChatContent {
  if (images.length === 0) return text
  return [
    { type: "text", text: text.trim() || "请分析这张图片。" },
    ...images.map((image) => ({ type: "image_url" as const, image_url: { url: image.readUrl } })),
  ]
}

export function getOpeningSegment(text: string) {
  const trimmed = text.trimStart()
  const offset = text.length - trimmed.length
  const paragraphs = trimmed.split(/\n\s*\n/)
  const first = paragraphs[0]?.trim() || ""
  const second = paragraphs[1]?.trim() || ""
  const segment = first.length < 80 && second ? `${first}\n\n${second}` : first
  return { offset, segment }
}

export function buildBenchmarkRewriteInput(input: {
  sourceOriginalText: string
  messages: ChatMessage[]
  sourceAnalysisText: string
  currentDraft: string
}) {
  const original = input.sourceOriginalText.trim() || [...input.messages]
    .reverse()
    .map((message) => extractBenchmarkOriginalText(message.content))
    .find((content) => content.trim()) || ""

  if (!original) return null

  const lengthRule = buildBenchmarkLengthRule(original)
  return [
    "请按对标原文重新生成一版文案，直接输出最终稿。",
    "硬性要求：",
    buildBenchmarkRecreationSopBlock(),
    "1. 目标字数必须和对标原文基本一致，允许 95%-105% 波动。",
    "2. 整体至少 30% 可感知重写，不能只是替换少数字。",
    "3. 除专有名词外，不要连续沿用原文 12 个字以上。",
    lengthRule ? `4. ${lengthRule}` : null,
    input.sourceAnalysisText.trim() ? `已有拆解：\n${input.sourceAnalysisText.trim()}` : null,
    `对标原文：\n${original}`,
    input.currentDraft.trim() ? `我当前不满意的稿子：\n${input.currentDraft.trim()}` : null,
  ].filter(Boolean).join("\n\n")
}

export function buildBenchmarkQualityMessage(input: {
  sourceOriginalText: string
  messages: ChatMessage[]
  draft: string
}) {
  const original = input.sourceOriginalText.trim() || [...input.messages]
    .reverse()
    .map((message) => extractBenchmarkOriginalText(message.content))
    .find((content) => content.trim()) || ""

  if (!original || !input.draft) return null

  const report = assessBenchmarkRewrite(original, input.draft)
  const lengthRatio = report.lengthRatio == null ? "无法计算" : `${Math.round(report.lengthRatio * 100)}%`
  const lengthStatus = report.lengthPassed
    ? "通过"
    : report.outputChars < report.originalChars
      ? "偏短"
      : "偏长"
  const copyStatus = report.tooSimilar ? "风险高，需要继续重写" : "通过"

  return [
    "## 对标自检结果",
    `- 字数：当前 ${report.outputChars} 字 / 原文 ${report.originalChars} 字，比例 ${lengthRatio}，判定：${lengthStatus}。`,
    `- 12字连续复用：${Math.round(report.reuseRatio * 100)}%，判定：${copyStatus}。`,
    report.reusedSamples.length
      ? `- 复用片段示例：${report.reusedSamples.map((sample) => `「${sample}」`).join("、")}`
      : "- 复用片段示例：未发现明显连续复用。",
    report.lengthPassed && !report.tooSimilar
      ? "- 结论：这版在字数和照抄风险上基本合格，可以继续看表达质量。"
      : "- 结论：这版还不合格，优先按原文字数重写，并替换开头、案例、过渡句或行动引导。",
  ].join("\n\n")
}
