/**
 * 发布包拼装（阶段 4 WP4.2）
 * 第一版：复制/导出文本，不自动外发平台。
 */

import type { ContentFormat } from "@/lib/aim-generator"
import { AIM_FORMAT_LABELS } from "@/lib/aim/workbench-display"
import { getCanonicalFromTaskSpec } from "@/lib/canonical-content-spec"
import { getContentPackageFromTaskSpec } from "@/lib/content-package-spec"
import type { TaskSpec } from "@/lib/task-spec"

export interface PublishPackInput {
  generationId: string
  topicTitle?: string | null
  taskSpec?: TaskSpec | null
  results: Array<{ format: ContentFormat; content: string }>
  publishPlatform?: string | null
  publishUrl?: string | null
  plannedAt?: string | null
  reviewNote?: string | null
}

export interface PublishPackSection {
  key: string
  title: string
  body: string
}

/**
 * @description 从交付物确定性拼装发布包各节
 */
export function buildPublishPackSections(input: PublishPackInput): PublishPackSection[] {
  const canonical = getCanonicalFromTaskSpec(input.taskSpec)
  const contentPackage = getContentPackageFromTaskSpec(input.taskSpec)
  const primary =
    input.results.find((item) => item.format === "video_script" || item.format === "koubo_script") ||
    input.results.find((item) => item.content.trim()) ||
    null
  const shooting = input.results.find((item) => item.format === "shooting_brief")
  const titleLine =
    input.topicTitle?.trim() ||
    canonical?.coreMessage?.trim() ||
    primary?.content.trim().split("\n").find(Boolean)?.slice(0, 40) ||
    "未命名内容"

  const sections: PublishPackSection[] = [
    {
      key: "meta",
      title: "发布信息",
      body: [
        `内容 ID：${input.generationId}`,
        `标题/封面建议：${titleLine}`,
        `发布平台：${input.publishPlatform?.trim() || "（待填）"}`,
        `计划/发布时间：${input.plannedAt?.trim() || "（待填）"}`,
        `发布链接：${input.publishUrl?.trim() || "（待填）"}`,
        `人工审核：${input.reviewNote?.trim() || (canonical?.status === "confirmed" ? "母内容已确认" : "待审核")}`,
      ].join("\n"),
    },
    {
      key: "final",
      title: "最终正文（主稿）",
      body: primary?.content.trim() || "（暂无主稿）",
    },
  ]

  if (canonical) {
    sections.push({
      key: "canonical",
      title: "母内容要点",
      body: [
        `核心观点：${canonical.coreMessage}`,
        `目标客户：${canonical.targetCustomer || "（待补）"}`,
        `真实问题：${canonical.realProblem || "（待补）"}`,
        `内容目标：${canonical.contentGoal || "（待补）"}`,
        `期望行动：${canonical.desiredAction}`,
        canonical.mustKeep.length ? `必须保留：${canonical.mustKeep.join("；")}` : "",
        canonical.avoid.length ? `禁区：${canonical.avoid.join("；")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    })
  }

  const platformSummaries = input.results
    .filter((item) => item.content.trim() && item.format !== "shooting_brief")
    .map((item) => {
      const label = AIM_FORMAT_LABELS[item.format] || item.format
      const firstLine =
        item.content
          .trim()
          .split("\n")
          .map((line) => line.trim())
          .find(Boolean)
          ?.slice(0, 80) || "（空）"
      return `- ${label}：${firstLine}${item.content.trim().length > 80 ? "…" : ""}`
    })
  if (platformSummaries.length > 0) {
    sections.push({
      key: "platform-summary",
      title: "多平台成稿摘要",
      body: platformSummaries.join("\n"),
    })
  }

  const risks: string[] = []
  if (!canonical || canonical.status !== "confirmed") risks.push("母内容尚未确认，跨平台事实可能漂移")
  if (canonical?.missingEvidence.length) {
    risks.push(`尚缺证据：${canonical.missingEvidence.slice(0, 3).join("；")}`)
  }
  if (contentPackage?.failedFormats.length) {
    risks.push(
      `内容包失败格式：${contentPackage.failedFormats.map((item) => item.format).join("、")}`,
    )
  }
  if (!input.publishPlatform?.trim()) risks.push("未填写发布平台")
  if (!input.publishUrl?.trim()) risks.push("发布链接位待填（发布后回填）")
  sections.push({
    key: "risk",
    title: "平台适配与风险",
    body: risks.length > 0 ? risks.map((item) => `- ${item}`).join("\n") : "- 未见阻断项，发布前仍建议人工通读",
  })

  sections.push({
    key: "review",
    title: "人工审核备注",
    body: input.reviewNote?.trim() || "（待填审核备注）",
  })

  sections.push({
    key: "publish-link",
    title: "发布链接位",
    body: [
      `平台：${input.publishPlatform?.trim() || "（待填）"}`,
      `链接：${input.publishUrl?.trim() || "（发布后回填）"}`,
      `计划/发布时间：${input.plannedAt?.trim() || "（待填）"}`,
    ].join("\n"),
  })

  if (shooting?.content.trim()) {
    sections.push({
      key: "shooting",
      title: "素材/拍摄交接",
      body: shooting.content.trim(),
    })
  }

  if (input.taskSpec?.production) {
    const production = input.taskSpec.production
    sections.push({
      key: "production",
      title: "生产执行",
      body: [
        `生产方式：${production.adapter === "manual" ? "人工交接" : "AIM 视频适配器"}`,
        `状态：${production.status}`,
        production.deliverableUrl ? `交付物：${production.deliverableUrl}` : "交付物：未产生可交付视频",
        production.evidenceRef ? `交接证据：${production.evidenceRef}` : "",
      ].filter(Boolean).join("\n"),
    })
  }

  for (const item of input.results) {
    if (item === primary || item.format === "shooting_brief") continue
    if (!item.content.trim()) continue
    sections.push({
      key: item.format,
      title: AIM_FORMAT_LABELS[item.format] || item.format,
      body: item.content.trim(),
    })
  }

  return sections
}

/**
 * @description 拼成可复制的纯文本发布包
 */
export function formatPublishPackText(input: PublishPackInput): string {
  const sections = buildPublishPackSections(input)
  return sections.map((section) => `【${section.title}】\n${section.body}`).join("\n\n")
}
