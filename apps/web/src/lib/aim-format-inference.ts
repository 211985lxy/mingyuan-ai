import type { ContentFormat } from "@/lib/aim-generator"

/**
 * 从自然语言推断目标内容格式。
 * 仅在调用方未显式指定 targetFormats 时使用，避免覆盖 UI 选择。
 */
export function inferContentFormatsFromRawInput(rawInput: string): ContentFormat[] {
  const text = (rawInput || "").trim()
  if (!text) return []

  const formats: ContentFormat[] = []
  const push = (format: ContentFormat) => {
    if (!formats.includes(format)) formats.push(format)
  }

  if (/(小红书|种草文|种草图文)/.test(text)) push("xiaohongshu_post")
  if (/(朋友圈)/.test(text)) push("moments_post")
  if (/(公众号|长文)/.test(text) && !/(小红书)/.test(text)) push("wechat_article")
  if (/(社群|微信群|企微群)/.test(text)) push("community_message")
  if (/(拍摄交接|分镜|必拍镜头)/.test(text)) push("shooting_brief")
  if (/(口播|短视频脚本|视频脚本|抖音文案|视频号文案)/.test(text)) push("video_script")

  return formats
}

/** 把推断格式映射为 TaskSpec.outputFormat 可读标签 */
export function formatLabelForTaskSpec(format: ContentFormat): string {
  const labels: Partial<Record<ContentFormat, string>> = {
    xiaohongshu_post: "小红书图文",
    moments_post: "朋友圈文案",
    wechat_article: "公众号文章",
    community_message: "社群运营文案",
    shooting_brief: "拍摄交接单",
    video_script: "口播脚本",
    koubo_script: "口播脚本",
    raw_copy: "原始文案",
  }
  return labels[format] || format
}
