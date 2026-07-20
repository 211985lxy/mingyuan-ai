export type ImageGenerateKind = "raw" | "xhs-card" | "cover"

/**
 * @description 标准化imagegeneratekind
 * @param value - 值
 * @returns ImageGenerateKind
 */
export function normalizeImageGenerateKind(value: unknown): ImageGenerateKind {
  return value === "xhs-card" || value === "cover" ? value : "raw"
}

/**
 * @description 构建imagegenerateprompt
 * @param input - 输入数据
 * @returns 无返回值
 */
export function buildImageGeneratePrompt(input: {
  prompt: string
  kind: ImageGenerateKind
  style?: unknown
  layout?: unknown
}) {
  const style = typeof input.style === "string" ? input.style : "auto"
  const layout = typeof input.layout === "string" ? input.layout : "auto"

  if (input.kind === "xhs-card") {
    return [
      "小红书图文卡片生成。参考 baoyu-xhs-images / guizang-social-card-skill 的结构，但重写成明远 AIM 自有风格。",
      "画幅：竖版 3:4 或小红书封面友好构图；一眼能读懂；手机端缩略图仍清晰。",
      "内容策略：只表达一个核心观点；大标题抓人；副标题少字；最多 3 个信息点；不要做成 PPT 课件。",
      "视觉策略：社交媒体信息图卡片；标题区、主体视觉、证据/标签区层次明确；留足安全边距。",
      "文字要求：中文短句，避免密密麻麻；如果模型无法稳定生成文字，优先保留干净标题区。",
      `风格：${style}；布局：${layout}。`,
      `用户需求：${input.prompt}`,
    ].join("\n")
  }

  if (input.kind === "cover") {
    return [
      "封面图生成。参考 baoyu-cover-image 的封面结构，但重写成明远 AIM 自有风格。",
      "画面目标：强钩子、强视觉中心、可承载标题；适合文章/短视频/小红书首图。",
      "构图要求：主体明确，标题区域留白，背景有质感但不抢字。",
      "文字要求：少字大标题；如果模型无法稳定生成文字，优先留出无字标题区。",
      `风格：${style}；布局：${layout}。`,
      `用户需求：${input.prompt}`,
    ].join("\n")
  }

  return input.prompt
}
