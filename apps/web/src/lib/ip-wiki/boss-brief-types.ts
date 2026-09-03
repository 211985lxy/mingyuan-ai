/**
 * IP 采访六维画像类型与渲染映射（老板说明书 · boss_brief 页数据源）。
 *
 * 由 AIM 采访技能在 6 轮结构化问答后产出 InterviewSixDim，
 * 再由 upsertBossBriefFromInterview() 落库为 ipWikiPage(boss_brief)
 * 并同步派生 assistant-persona / style-profile 片段。
 *
 * 本文件 ≤200 行，纯函数、无副作用。
 */

/** 采访六维画像（采访模式输出摘要） */
export interface InterviewSixDim {
  /** 做过什么：经历条目，每条一句话 */
  experiences: string[]
  /** 在做什么业务（一句话简介） */
  business: string
  /** 擅长与不擅长 */
  strengthsWeaknesses: {
    strengths: string[]
    weaknesses: string[]
  }
  /** 服务谁 / 谁不适合 */
  targetAudience: {
    suitable: string
    notSuitable: string
  }
  /** 表达习惯（原文照抄，用于风格档案） */
  expressionStyle: string
  /** 内容边界：禁谈 / 踩雷项条目 */
  contentBoundaries: string[]
}

/** 一份合理值校验：缺失或字段形状不符时抛信息型错误，便于调用方提示用户 */
export function validateInterviewSixDim(v: unknown): InterviewSixDim {
  if (!v || typeof v !== "object") {
    throw new Error("interviewResult: 不是合法对象")
  }
  const o = v as Record<string, unknown>
  const asArr = (x: unknown): string[] =>
    Array.isArray(x) ? x.filter((i): i is string => typeof i === "string") : []
  const asStr = (x: unknown): string => (typeof x === "string" ? x : "")

  const sw = o.strengthsWeaknesses
    && typeof o.strengthsWeaknesses === "object"
    ? o.strengthsWeaknesses as Record<string, unknown>
    : {}
  const ta = o.targetAudience
    && typeof o.targetAudience === "object"
    ? o.targetAudience as Record<string, unknown>
    : {}

  const result: InterviewSixDim = {
    experiences: asArr(o.experiences).slice(0, 20),
    business: asStr(o.business).slice(0, 300),
    strengthsWeaknesses: {
      strengths: asArr(sw.strengths).slice(0, 20),
      weaknesses: asArr(sw.weaknesses).slice(0, 20),
    },
    targetAudience: {
      suitable: asStr(ta.suitable).slice(0, 500),
      notSuitable: asStr(ta.notSuitable).slice(0, 500),
    },
    expressionStyle: asStr(o.expressionStyle).slice(0, 1000),
    contentBoundaries: asArr(o.contentBoundaries).slice(0, 30),
  }

  if (!result.business) throw new Error("interviewResult.business 不能为空")
  if (result.experiences.length === 0) throw new Error("interviewResult.experiences 不能为空")
  return result
}

const NL = "\n"

/** 渲染为 boss_brief 页 sections 文本（5 项结构，保留人工可编辑的 Markdown 节） */
export function renderBossBriefContent(d: InterviewSixDim): string {
  const bullets = (xs: string[]) => xs.map((x) => `- ${x}`).join(NL)
  const twoCol = (a: string[], b: string[]) =>
    `### 擅长${NL}${bullets(a)}${NL}${NL}### 不擅长 / 边界${NL}${bullets(b)}`

  const section1 = [
    "## ① 定位与经历",
    `**核心业务：** ${d.business}`,
    "",
    d.experiences.length ? "**过往经历：**" : "",
    d.experiences.length ? bullets(d.experiences) : "",
  ].filter(Boolean).join(NL)

  const section2 = [
    "",
    "## ② 擅长与不擅长",
    twoCol(d.strengthsWeaknesses.strengths, d.strengthsWeaknesses.weaknesses),
  ].join(NL)

  const section3 = [
    "",
    "## ③ 服务谁（明确适合 vs. 不适合）",
    `✅ **适合的客户 / 合作方：** ${d.targetAudience.suitable}`,
    "",
    `❌ **不适合的客户 / 合作方：** ${d.targetAudience.notSuitable}`,
  ].join(NL)

  const section4 = [
    "",
    "## ④ 表达习惯",
    `> ${d.expressionStyle || "（未填写）"}`,
  ].join(NL)

  const section5 = [
    "",
    "## ⑤ 内容边界（禁谈 / 踩雷）",
    bullets(d.contentBoundaries.length ? d.contentBoundaries : ["（暂无）"]),
  ].join(NL)

  return [section1, section2, section3, section4, section5].join(NL)
}

/** boss_brief frontmatter：机器可读的结构化六维字段（用于后续自动化派生） */
export function buildBossBriefFrontmatter(
  d: InterviewSixDim,
): Record<string, unknown> {
  return {
    schema: "boss_brief_v1",
    business: d.business,
    experiences: d.experiences,
    strengths: d.strengthsWeaknesses.strengths,
    weaknesses: d.strengthsWeaknesses.weaknesses,
    audienceSuitable: d.targetAudience.suitable,
    audienceNotSuitable: d.targetAudience.notSuitable,
    expressionStyle: d.expressionStyle,
    contentBoundaries: d.contentBoundaries,
  }
}
