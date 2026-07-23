import type { AimRuntimeTask } from "@/lib/aim-knowledge-strategy"
import type { ContentFormat } from "@/lib/aim-generator"

/**
 * 轻量 few-shot：每个高频场景一组好例/坏例（合计 ≤400 字）。
 * 仅在 new_copy / rewrite_copy 注入；light_edit 不注入以免干扰局部改。
 */
const FEWSHOTS: Partial<Record<ContentFormat, string>> = {
  video_script: `【对照示例·口播】
坏例：今天给大家分享一个干货，很多人不知道如何获客，赋能闭环很重要，欢迎私信咨询。
好例：上周三个老板问我同一句——「内容天天发，为什么没人询盘？」不是你不够努力，是你只在讲自己，没有先戳中对方正在亏钱的那个点。接着我会用一个可验证的判断标准，帮你对照自己的账号。`,

  xiaohongshu_post: `【对照示例·小红书种草】
坏例：超好用！强烈安利这个服务，闭眼入不踩雷，姐妹们冲。
好例：标题先给具体反差（「花了 2 万投放仍 0 咨询后，我改了这 1 步」）。正文用场景痛点→一个可执行方法→边界说明（适合谁/不适合谁）→轻 CTA（收藏或评论关键词），禁止空泛安利词。`,

  moments_post: `【对照示例·朋友圈】
坏例：感恩遇见，持续输出价值，有需要的朋友欢迎咨询～
好例：今天又遇到「素材很多但发不出」的老板。不是不会写，是缺少一句能让客户立刻对号入座的开头。你现在发的内容，读者三秒内能认出自己吗？认不出就先改这一句。`,
}

/**
 * @description 按 runtimeTask 与目标格式选择 few-shot 块
 */
export function buildPromptFewshotBlock(
  runtimeTask: AimRuntimeTask | undefined,
  targetFormats: ContentFormat[] | undefined,
): string {
  if (!runtimeTask || runtimeTask === "light_edit" || runtimeTask === "quality_review") return ""
  if (runtimeTask !== "new_copy" && runtimeTask !== "rewrite_copy") return ""

  const formats = targetFormats?.length ? targetFormats : []
  const picked: string[] = []
  for (const format of formats) {
    const block = FEWSHOTS[format]
    if (block) picked.push(block)
    if (picked.length >= 2) break
  }
  if (!picked.length && FEWSHOTS.video_script) picked.push(FEWSHOTS.video_script)
  const text = picked.join("\n\n")
  return text.length > 400 ? `${text.slice(0, 380)}\n（示例已截断）` : text
}
