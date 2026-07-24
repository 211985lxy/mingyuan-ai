/**
 * 目标达成度轻量质检：按 businessGoal 检查正文信号，失败则给出重写指令。
 */

import type { ContentFormat } from "@/lib/aim-generator"
import type { CopyMethodologyPlan } from "@/lib/methodology/resolve-copy-methodology-plan"
import {
  getMethodologyCardById,
  type MethodologyBusinessGoal,
} from "@/lib/methodology/ip-copywriting-cards"

export interface GoalVerifyIssue {
  goal: MethodologyBusinessGoal
  format?: ContentFormat
  reason: string
  mustFix: string
}

export interface GoalVerifyResult {
  ok: boolean
  issues: GoalVerifyIssue[]
  summary: string
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text))
}

function countCtaSignals(text: string): number {
  const patterns = [
    /私信/,
    /评论区?(打|留|回|写)?/,
    /预约/,
    /诊断/,
    /领取/,
    /扫码/,
    /加微/,
    /报名/,
    /购买/,
    /下单/,
    /关注/,
  ]
  return patterns.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0)
}

function verifyLead(text: string, format?: ContentFormat): GoalVerifyIssue[] {
  const issues: GoalVerifyIssue[] = []
  const hasCostOrMistake = hasAny(text, [
    /代价|损失|浪费|踩坑|误判|误区|以为|其实|不是/,
  ])
  const hasFilterOrStandard = hasAny(text, [
    /适合|不适合|判断|标准|自检|清单|如果你|真正想/,
  ])
  const cta = countCtaSignals(text)
  const playOnly = hasAny(text, [/播放量|涨粉|爆款就完事|刷到就算/]) && cta === 0

  if (!hasCostOrMistake) {
    issues.push({
      goal: "lead",
      format,
      reason: "缺少客户代价或常见误判信号",
      mustFix: "补「代价提醒」或「误区纠偏」模块，写清用户现在付出的真实代价",
    })
  }
  if (!hasFilterOrStandard) {
    issues.push({
      goal: "lead",
      format,
      reason: "缺少筛人或小切口判断标准",
      mustFix: "补判断标准/自检：谁适合、谁不适合，或给出可执行小标准",
    })
  }
  if (cta === 0) {
    issues.push({
      goal: "lead",
      format,
      reason: "缺少单一低摩擦 CTA（评论词/私信/诊断等）",
      mustFix: "结尾只留一个轻行动：评论关键词、私信、领取清单或预约诊断，并说明行动后能得到什么",
    })
  } else if (cta >= 3) {
    issues.push({
      goal: "lead",
      format,
      reason: "CTA 过多，摩擦过高",
      mustFix: "删到只保留一个行动引导",
    })
  }
  if (playOnly) {
    issues.push({
      goal: "lead",
      format,
      reason: "偏纯播放量话术，不符合线索获客",
      mustFix: "去掉纯流量收尾，改为线索承接动作",
    })
  }
  return issues
}

function verifyConvert(text: string, format?: ContentFormat): GoalVerifyIssue[] {
  const issues: GoalVerifyIssue[] = []
  if (!hasAny(text, [/适合|不适合|如果你|真正需要/])) {
    issues.push({
      goal: "convert",
      format,
      reason: "未写清适不适合",
      mustFix: "明确适合谁、不适合谁",
    })
  }
  if (!hasAny(text, [/结果|变成|从.+到|案例|客户|学员|之后/])) {
    issues.push({
      goal: "convert",
      format,
      reason: "缺少结果路径或案例证据",
      mustFix: "补一条结果路径或可验证变化",
    })
  }
  if (countCtaSignals(text) === 0) {
    issues.push({
      goal: "convert",
      format,
      reason: "缺少单一行动",
      mustFix: "结尾给一个低摩擦行动路径（报名/预约/购买其一）",
    })
  }
  return issues
}

function verifyTraffic(text: string, format?: ContentFormat): GoalVerifyIssue[] {
  const issues: GoalVerifyIssue[] = []
  const opening = text.slice(0, Math.min(80, text.length))
  if (!hasAny(opening, [/为什么|别再|其实|最贵|一不小心|如果你还|停一下|先别/])) {
    // soft: also accept question/exclamation density
    if (!/[？?]/.test(opening) && opening.length > 10) {
      issues.push({
        goal: "traffic",
        format,
        reason: "开头停留感不足",
        mustFix: "重写开头：好奇/痛点/反差/利益，制造强停留",
      })
    }
  }
  if (!hasAny(text, [/但是|可是|其实|真正|反过来|不是.+而是/])) {
    issues.push({
      goal: "traffic",
      format,
      reason: "中段缺少断裂感",
      mustFix: "中段加反转或判断断裂，避免平铺",
    })
  }
  if (!hasAny(text, [/关注|评论|你怎么看|扣|留言/])) {
    issues.push({
      goal: "traffic",
      format,
      reason: "结尾缺少关注/评论点",
      mustFix: "结尾留评论点或关注理由",
    })
  }
  return issues
}

function verifyTrust(text: string, format?: ContentFormat): GoalVerifyIssue[] {
  const issues: GoalVerifyIssue[] = []
  if (!hasAny(text, [/那次|当时|有个|客户|现场|后来|我发现|我踩过|曾经/])) {
    issues.push({
      goal: "trust",
      format,
      reason: "缺少真实场景或经历痕迹",
      mustFix: "用具体场景/经历切入，不要堆履历",
    })
  }
  if (hasAny(text, [/大家好我是|深耕\d+年|赋能|致力于/])) {
    issues.push({
      goal: "trust",
      format,
      reason: "出现履历堆砌或宣传片腔",
      mustFix: "删自我介绍式开场，改写为处境+判断",
    })
  }
  if (!hasAny(text, [/判断|标准|我坚持|我相信|所以我/])) {
    issues.push({
      goal: "trust",
      format,
      reason: "缺少稳定判断/价值观收束",
      mustFix: "补一句稳定判断或站队收束",
    })
  }
  return issues
}

function verifyBrand(text: string, format?: ContentFormat): GoalVerifyIssue[] {
  // brand 复用 traffic 主信号，略放宽 CTA
  return verifyTraffic(text, format).map((issue) => ({ ...issue, goal: "brand" as const }))
}

/**
 * 按 plan.businessGoal 检查各格式正文。
 */
export function verifyMethodologyGoal(
  plan: CopyMethodologyPlan,
  drafts: Array<{ format: ContentFormat; content: string }>,
): GoalVerifyResult {
  if (plan.businessGoal === "unclear") {
    return {
      ok: true,
      issues: [],
      summary: "目标 unclear，跳过目标达成度硬质检",
    }
  }

  const issues: GoalVerifyIssue[] = []
  for (const draft of drafts) {
    const text = String(draft.content || "").trim()
    if (!text) continue
    // METHOD_NOTE / 元数据段不参与正文质检
    const body = text.replace(/\[\[AIM_METHOD_NOTE\]\][\s\S]*?\[\[\/AIM_METHOD_NOTE\]\]/g, "").trim()
    if (!body) continue

    switch (plan.businessGoal) {
      case "lead":
        issues.push(...verifyLead(body, draft.format))
        break
      case "convert":
        issues.push(...verifyConvert(body, draft.format))
        break
      case "traffic":
        issues.push(...verifyTraffic(body, draft.format))
        break
      case "trust":
        issues.push(...verifyTrust(body, draft.format))
        break
      case "brand":
        issues.push(...verifyBrand(body, draft.format))
        break
      default:
        break
    }
  }

  // 结构模块软检查：只看业务目标卡的模块，避免路由卡叠加导致误杀
  if (
    (plan.businessGoal === "lead" || plan.businessGoal === "convert") &&
    plan.cardIds.length > 0
  ) {
    const bizCard = plan.cardIds
      .map((id) => getMethodologyCardById(id))
      .find((card) => card?.kind === "business_goal")
    const modules = bizCard?.structureModules ?? []
    if (modules.length >= 3) {
      const joined = drafts.map((d) => d.content).join("\n")
      const moduleHits = modules.filter((mod) => {
        const chars = mod.replace(/[^\u4e00-\u9fa5]/g, "")
        if (chars.length < 2) return joined.includes(mod)
        for (let i = 0; i <= chars.length - 2; i += 1) {
          if (joined.includes(chars.slice(i, i + 2))) return true
        }
        return false
      }).length
      if (moduleHits < Math.ceil(modules.length * 0.5)) {
        issues.push({
          goal: plan.businessGoal,
          reason: "正文难以对应 structureModules",
          mustFix: `按序补齐结构模块：${modules.join(" → ")}`,
        })
      }
    }
  }

  const ok = issues.length === 0
  return {
    ok,
    issues,
    summary: ok
      ? `目标 ${plan.businessGoal} 达成度检查通过`
      : `目标 ${plan.businessGoal} 未达标：${issues.map((i) => i.reason).join("；")}`,
  }
}

/** 生成失败时追加到 user prompt 的重写指令 */
export function buildGoalRewritePromptAppendix(
  plan: CopyMethodologyPlan,
  result: GoalVerifyResult,
  previousOutput: string,
): string {
  const fixes = result.issues.map((i, idx) => `${idx + 1}. ${i.mustFix}`).join("\n")
  return `
【目标达成度质检未通过】
本轮目标：${plan.businessGoal}；路由：${plan.contentRoute}；卡片：${plan.cardIds.join(", ")}
结构模块须按序写满：${plan.structureModules.join(" → ")}
未达标原因与必须补的模块：
${fixes}

请重写全部请求格式：成稿正文保持可发布、禁止方法论说明书腔；在 [[AIM_METHOD_NOTE]] 中增加「目标匹配度 / 优化点」说明本轮如何补齐。

上一版输出：
${previousOutput}`
}
