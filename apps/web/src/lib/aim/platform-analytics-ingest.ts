/**
 * 复盘粘贴进数：解析平台导出文档 → 校验目标内容 → upsert ContentOutcome。
 * 未选目标内容时不写库。
 */

import type { ContentOutcomeInput } from "@/lib/api/projects"
import {
  parsePlatformAnalyticsText,
  type ParsedPlatformAnalytics,
} from "@/lib/aim/platform-analytics-parse"

export type AnalyticsIngestResult =
  | {
      status: "ready"
      parsed: ParsedPlatformAnalytics
      body: ContentOutcomeInput
      generationId: string
    }
  | {
      status: "need_target"
      parsed: ParsedPlatformAnalytics
      message: string
    }
  | {
      status: "parse_failed"
      parsed: ParsedPlatformAnalytics
      message: string
    }

/**
 * 只做解析与门闩判断，不写库。调用方负责 upsert。
 */
export function prepareAnalyticsIngest(input: {
  text: string
  generationId?: string | null
}): AnalyticsIngestResult {
  const parsed = parsePlatformAnalyticsText(input.text)
  if (!parsed.ok) {
    return {
      status: "parse_failed",
      parsed,
      message: parsed.summary,
    }
  }

  const generationId = input.generationId?.trim()
  if (!generationId) {
    return {
      status: "need_target",
      parsed,
      message: "已识别发布数据，请先在复盘列表里选中要挂靠的那条内容，再发送。不会写库、不会编数字。",
    }
  }

  const body: ContentOutcomeInput = {
    collectWindowDay: parsed.collectWindowDay,
    ...(parsed.platform ? { platform: parsed.platform } : {}),
    ...parsed.fields,
  }

  return {
    status: "ready",
    parsed,
    generationId,
    body,
  }
}
