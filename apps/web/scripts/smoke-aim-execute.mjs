#!/usr/bin/env node
/**
 * AIM 统一入口线上冒烟脚本（用户指令唯一真源整改后验证）
 *
 * 用法：
 *   SMOKE_BASE_URL=https://mingyuan-ai.cn \
 *   SMOKE_COOKIE='（浏览器登录后的整串 Cookie，含 user 会话）' \
 *   node scripts/smoke-aim-execute.mjs
 *
 * 验证三个核心场景：
 *   A. 泛化请求 → 一次性编号追问（≤3 问，且不问篇幅）
 *   B. 894 字原稿 +「请优化修改，直接给可发布终稿」→ 零追问直出，
 *      正文可发布纯净（无思考依据/字数话术），思考依据独立字段
 *   C. 明确「2 分钟、400 到 550 字」→ 正常交付（长度只进提示词，代码不设卡）
 */

const BASE_URL = (process.env.SMOKE_BASE_URL || "https://mingyuan-ai.cn").replace(/\/$/, "")
const COOKIE = process.env.SMOKE_COOKIE || ""

if (!COOKIE) {
  console.error("✗ 缺少 SMOKE_COOKIE（浏览器登录后复制整串 Cookie）")
  process.exit(2)
}

const results = []

async function execute(body, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE_URL}/api/aim/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: COOKIE,
        Origin: BASE_URL,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const json = await res.json().catch(() => ({}))
    return { status: res.status, json }
  } finally {
    clearTimeout(timer)
  }
}

function record(name, passed, detail) {
  results.push({ name, passed, detail })
  console.log(`${passed ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`)
}

async function scenarioA() {
  const { status, json } = await execute({
    agentId: "content_producer",
    sourceEnvelope: { currentUserRequest: "帮我写个文案", relevantConversation: [], referenceMaterials: [] },
    targetFormats: ["video_script"],
  }, 60_000)
  const ok = status === 200 && json.kind === "clarification" && Array.isArray(json.questions) && json.questions.length >= 1 && json.questions.length <= 3
  const asksLength = /篇幅|多长|字数/.test(json.question || "")
  record("A 泛化请求 → 编号追问", ok && !asksLength,
    `status=${status} kind=${json.kind} 问数=${(json.questions || []).length}${asksLength ? "（误问篇幅！）" : ""}`)
}

async function scenarioB() {
  const para = "很多老板做内容做不起来，不是不会写，而是每天在想写什么。选题一停，更新就停，更新一停，账号就凉。我们做企业IP陪跑这两年，见过太多这样的案例：老板本人很专业，讲东西也有干货，但就是卡在选题这一关。后来我们把选题这件事标准化了，每个月一次选题会，把客户业务里的问题、客户常问的问题、行业里的新变化，全部列出来，一次定三十条选题。从那之后，客户再也不用每天纠结写什么，只需要按着选题日历执行。内容这件事，拼的不是灵感，是流程。你要是把选题也变成流程，你的内容产能至少翻一倍。"
  const material = para.repeat(4).slice(0, 894)
  const { status, json } = await execute({
    agentId: "content_producer",
    sourceEnvelope: {
      currentUserRequest: "请优化修改，直接给可发布终稿",
      relevantConversation: [],
      referenceMaterials: [{ title: "用户参考原文", content: material }],
    },
    targetFormats: ["video_script"],
  }, 240_000)
  if (status !== 200 || json.kind !== "deliverable") {
    record("B 894字润色 → 直出可发布终稿", false, `status=${status} kind=${json.kind} error=${json.error || ""}`)
    return
  }
  const r = json.results[0] || {}
  const content = r.content || ""
  const forbidden = ["AIM_METHOD_NOTE", "两分钟", "400-500", "任务分析", "自检", "===FORMAT"]
  const hits = forbidden.filter((word) => content.includes(word))
  const clean = hits.length === 0
  const countOk = r.wordCount === content.length
  const hasReasoning = Boolean(r.reasoningSummary)
  record("B 894字润色 → 直出可发布终稿", clean && countOk && hasReasoning,
    `字数=${r.wordCount} 正文纯净=${clean ? "是" : `否(${hits.join("/")})`} 思考依据=${hasReasoning ? "独立" : "缺失"} 字数一致=${countOk}`)
}

async function scenarioC() {
  const { status, json } = await execute({
    agentId: "content_producer",
    sourceEnvelope: {
      currentUserRequest: "写一条2分钟、400到550字的口播终稿，讲老板做内容卡在选题，面向实体店老板，目标是引流获客",
      relevantConversation: [],
      referenceMaterials: [],
    },
    targetFormats: ["video_script"],
  }, 240_000)
  const ok = status === 200 && json.kind === "deliverable"
  const r = (json.results || [])[0] || {}
  record("C 明确时长字数 → 正常交付（长度只进提示词）", ok,
    `status=${status} kind=${json.kind} 字数=${r.wordCount ?? "-"}`)
}

async function main() {
  console.log(`==> AIM 冒烟 · ${BASE_URL}`)
  await scenarioA()
  await scenarioB()
  await scenarioC()
  const failed = results.filter((item) => !item.passed)
  console.log("")
  console.log(failed.length === 0 ? "✓ 全部通过" : `✗ ${failed.length}/${results.length} 项失败`)
  process.exit(failed.length === 0 ? 0 : 1)
}

await main()
