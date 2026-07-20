import type { AimGeneration } from "@/lib/api/client"

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value
}

function sanitizeHistoryText(value: string) {
  return value
    .replace(/https?:\/\/\S+/gi, "[链接]")
    .replace(/【(?:本轮对话|本次生成输入)】/g, " ")
    .replace(/^(?:用户|助手)：/gm, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * @description 获取contentpreview
 * @param item - 条目
 * @returns 无返回值
 */
export function getContentPreview(item: AimGeneration) {
  return truncateText(sanitizeHistoryText(item.rawInput), 120)
}

/**
 * @description 获取contenttitle
 * @param item - 条目
 * @returns 无返回值
 */
export function getContentTitle(item: AimGeneration) {
  const title = sanitizeHistoryText(item.topicTitle || "") || getContentPreview(item)
  return truncateText(title, 42) || "未命名内容"
}
