/**
 * 演示数据 Seed —— 内容闭环端到端客户演示
 *
 * 创建一套"通用示例企业"完整数据，让前端各页面（首页/全案/创作台/质检/结果）全部有内容可展示：
 *   1. 演示用户（前台 User，可一键登录）
 *   2. 一个 ToB 示例企业全案（ClientProject）
 *   3. 五盒知识资产（让资产健康度五盒全绿）
 *   4. 历史文案生成记录（published + draft，让首页数字非零、质检可导入）
 *   5. 一条已发布内容的结果回填（ContentOutcome）
 *
 * 幂等：基于固定 email / 固定 companyName 判断，重复执行只更新不重复创建。
 *
 * 用法：
 *   npm run seed:demo
 *   # 等价于: DOTENV_CONFIG_PATH=.demo-env NODE_OPTIONS='-r dotenv/config' tsx prisma/seed-demo.ts
 *   # 连接串取自 DATABASE_URL；若未设置，则用 .demo-env 中的 CLIPFLOW_DB_PASSWORD
 *   # 自动拼装演示库连接 mysql://clipflow:<pwd>@127.0.0.1:13306/clipflow
 */

import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import bcrypt from "bcryptjs"

function createPrismaClient() {
  // 优先用 DATABASE_URL；缺失时用 .demo-env 的密码拼装演示库连接
  let databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    const pwd = process.env.CLIPFLOW_DB_PASSWORD
    if (!pwd) {
      throw new Error(
        "缺少 DATABASE_URL 或 CLIPFLOW_DB_PASSWORD，请用 npm run seed:demo（依赖 .demo-env）",
      )
    }
    databaseUrl = `mysql://clipflow:${encodeURIComponent(pwd)}@127.0.0.1:13306/clipflow`
  }
  const url = new URL(databaseUrl.replace(/^mysql:\/\//, "mariadb://"))
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: parseInt(url.port || "3306", 10),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
    }),
  })
}

const DEMO_EMAIL = "demo@mingyuan.ai"
const DEMO_PASSWORD = "demo123456"
const DEMO_PROJECT_NAME = "星河智能科技（示例）"

async function main() {
  const prisma = createPrismaClient()
  console.log("🌱 演示数据 seeding...")

  // ── 1. 演示用户（设远期 expiresAt 使 subscriptionStatus=active，免激活码） ──
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)
  const oneYearLater = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { password: passwordHash, name: "明动演示官", plan: "pro", expiresAt: oneYearLater },
    create: {
      email: DEMO_EMAIL,
      password: passwordHash,
      name: "明动演示官",
      plan: "pro",
      expiresAt: oneYearLater,
    },
  })
  console.log(`  ✓ 用户: ${user.email} (${user.id}) 已激活`)

  // ── 2. 示例企业全案 ──────────────────────────────────────
  const project = await prisma.clientProject.upsert({
    where: { id: await getProjectId(prisma, user.id) },
    update: {},
    create: {
      userId: user.id,
      name: DEMO_PROJECT_NAME,
      companyName: "星河智能科技有限公司",
      industry: "企业 AI 解决方案 / ToB",
      targetCustomer:
        "年营收 1 亿以上、有内容获客需求但缺乏内容团队的 B2B 企业创始人/市场负责人，集中在 SaaS、企服、咨询、制造业品牌升级领域，决策周期 1-3 个月，最怕 AI 内容'假大空'和'AI 味'。",
      offer:
        "帮企业 30 天搭建可自我运转的 AI 内容增长闭环：从客户洞察、选题、爆款文案到结果回填，每个环节可审计、有人审、结果可沉淀为资产。交付的是'内容增长能力'而非一堆稿子。",
      deliveryGoal:
        "客户 90 天内：内容接受率 ≥70%，单条爆款内容带来 ≥3 条合格线索，内容团队人均产能提升 5 倍。",
      status: "active",
      notes: "演示示例数据 —— 用于内容闭环端到端演示。",
    },
  })
  console.log(`  ✓ 全案: ${project.name} (${project.id})`)

  // ── 3. 五盒知识资产（每盒至少 1-2 条，让健康度全绿） ────
  const knowledgeEntries = buildKnowledgeEntries(user.id, project.id)
  for (const entry of knowledgeEntries) {
    await prisma.knowledgeEntry.upsert({
      where: { id: entry.id },
      update: { content: entry.content, tags: entry.tags, valueGrade: entry.valueGrade },
      create: entry,
    })
  }
  console.log(`  ✓ 知识资产: ${knowledgeEntries.length} 条（五盒 + 动态池）`)

  // ── 4. 历史文案生成记录（published + draft） ─────────────
  const generations = buildGenerations(user.id, project.id)
  for (const gen of generations) {
    await prisma.aimGeneration.upsert({
      where: { id: gen.id },
      update: {},
      create: gen,
    })
  }
  console.log(`  ✓ 历史生成: ${generations.length} 条（published/draft）`)

  // ── 5. 已发布内容的结果回填 ──────────────────────────────
  const publishedGen = generations.find((g) => g.workflowStatus === "published")!
  const outcome = await prisma.contentOutcome.upsert({
    where: {
      userId_generationId_collectWindowDay: {
        userId: user.id,
        generationId: publishedGen.id,
        collectWindowDay: 7,
      },
    },
    update: {},
    create: {
      userId: user.id,
      generationId: publishedGen.id,
      projectId: project.id,
      platform: "wechat",
      publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      collectWindowDay: 7,
      views: 8420,
      likes: 312,
      comments: 47,
      saves: 189,
      shares: 56,
      qualifiedCommentCount: 23,
      dmCount: 34,
      qualifiedLeadCount: 11,
      appointmentCount: 6,
      dealCount: 2,
      revenue: 68000,
      verdictCode: "effective",
      audienceFeedback: "评论区很多人问'我们公司也能用吗'，说明痛点切中了；私信里 3 个创始人直接问价格和周期。",
      userVerdict: "选题方向对了，但开头钩子可以更尖锐。",
    },
  })
  console.log(`  ✓ 结果回填: 1 条（${outcome.collectWindowDay}天窗口，verdict=${outcome.verdictCode}）`)

  console.log("\n🌱 演示数据 seeding 完成！")
  console.log(`   演示登录: ${DEMO_EMAIL}`)
  console.log(`   演示全案: ${DEMO_PROJECT_NAME}`)
  await prisma.$disconnect()
}

async function getProjectId(prisma: PrismaClient, userId: string): Promise<string> {
  const existing = await prisma.clientProject.findFirst({
    where: { userId, name: DEMO_PROJECT_NAME },
    select: { id: true },
  })
  return existing?.id ?? `demo-proj-${userId.slice(-8)}`
}

// 用确定性的 cuid-like id，保证幂等
function kid(n: number) {
  return `demo-ke-${String(n).padStart(3, "0")}`
}
function gid(n: number) {
  return `demo-gen-${String(n).padStart(3, "0")}`
}

interface KnowledgeSeed {
  id: string
  userId: string
  projectId: string
  category: string
  title: string
  content: string
  tags: any
  valueGrade: string
  sortOrder: number
}

function buildKnowledgeEntries(userId: string, projectId: string): KnowledgeSeed[] {
  const base = { userId, projectId, tags: [] as string[] }
  return [
    // ── 盒1 who_am_i: boss_experience + positioning_material + writing_style_profile
    {
      ...base,
      id: kid(1),
      category: "boss_experience",
      title: "创始人背景：从大厂到帮企业做内容",
      content:
        "创始人曾在头部互联网公司带过 200 人的增长团队，亲手从 0 做到过百万粉账号。离开大厂后，发现 90% 的中小企业不是缺内容创意，而是缺'一套能稳定产出、又能持续进化'的内容体系。这是创办星河智能的初心——把大厂的内容增长方法论，降维成中小团队用得起的闭环。",
      valueGrade: "S",
      sortOrder: 1,
    },
    {
      ...base,
      id: kid(2),
      category: "positioning_material",
      title: "账号定位一句话：帮企业把内容做成增长引擎",
      content:
        "我们不接'代写文案'，也不卖'AI 写作工具'。我们交付的是'内容增长能力本身'——让企业在 30 天后，即使脱离我们，内容团队也能自己运转、自己进化。一句话定位：'不卖稿子，卖增长能力'。",
      valueGrade: "S",
      sortOrder: 2,
    },
    {
      ...base,
      id: kid(3),
      category: "writing_style_profile",
      title: "表达风格：说人话、讲真事、不端着",
      content:
        "1. 永远用'你'开头，不用'广大用户'。2. 先讲一个真实的客户翻车故事，再给方法。3. 禁止'赋能、抓手、闭环、生态'这类 AI 味词。4. 每篇至少有一个具体数字（时间/金额/转化率）。5. 结尾必须给一个'明天就能做'的动作，而不是空喊口号。",
      valueGrade: "S",
      sortOrder: 3,
    },
    // ── 盒2 what_i_sell: product_usp
    {
      ...base,
      id: kid(4),
      category: "product_usp",
      title: "核心卖点：可审计的内容增长闭环",
      content:
        "市面上 AI 写作工具产出的是'稿子'，我们产出的是'可追溯的增长链路'。每一条内容都绑定：选题来源、引用的客户证据、质检分数、人工审核记录、发布后的真实结果。内容不再是一锤子买卖，而是能持续沉淀、持续进化的企业资产。",
      valueGrade: "A",
      sortOrder: 4,
    },
    // ── 盒3 why_trust_me: project_case
    {
      ...base,
      id: kid(5),
      category: "project_case",
      title: "标杆案例：某 SaaS 公司 60 天内容获客",
      content:
        "客户背景：一家做 HR SaaS 的公司，过去靠电销获客，单条线索成本 800 元。合作后用我们的内容闭环，60 天内公众号 + 视频号产出 40 条内容，带来 127 条合格线索，成交 9 单，单条线索成本降到 210 元，内容团队从 3 人减到 1 人。关键动作：每条内容都绑定一个真实客户场景，质检卡掉 AI 味，发布后强制 7 天结果回填。",
      tags: ["confidence:confirmed"],
      valueGrade: "A",
      sortOrder: 5,
    },
    // ── 盒4 customer_thinking: customer_pain + customer_qa
    {
      ...base,
      id: kid(6),
      category: "customer_pain",
      title: "客户核心痛点：内容团队'有想法、没产能'",
      content:
        "客户最常说的三句话：1.'我知道要做什么内容，但团队写不出来、写不好。' 2.'AI 写的东西一股 AI 味，客户一看就反感。' 3.'内容发了就石沉大海，不知道哪条有效、为什么有效。' 核心痛点不是缺创意，而是缺'稳定产出 + 质量可控 + 结果可测'的体系。",
      valueGrade: "S",
      sortOrder: 6,
    },
    {
      ...base,
      id: kid(7),
      category: "customer_qa",
      title: "高频异议：AI 内容会不会反而拉低品牌？",
      content:
        "客户问：'用了 AI，内容会不会变得廉价？' 标准回答：'廉价的不是 AI，是没有审核的 AI。' 我们的闭环里，AI 负责初稿和扩写，但发布前必须经过四维质检（编辑质量/AI味/吸引力/逻辑）+ 人工主编终审。AI 是产能放大器，人是质量守门员。这也是为什么我们的内容接受率能做到 70% 以上。",
      valueGrade: "A",
      sortOrder: 7,
    },
    // ── 盒5 how_i_convert: private_domain_material
    {
      ...base,
      id: kid(8),
      category: "private_domain_material",
      title: "转化承接：内容到私域的标准动作",
      content:
        "内容发布后的标准承接链路：1. 评论区用'我也遇到过这个问题'引发共鸣，引导私信。2. 私信不直接卖，先发一份'行业内容增长诊断清单'换取企业信息。3. 诊断后给出 1 个免费建议 + 邀约 30 分钟语音。4. 语音诊断后，70% 的客户会主动问方案。关键：内容是入口，诊断是信任，方案是成交。",
      valueGrade: "A",
      sortOrder: 8,
    },
    // ── 动态池: benchmark_reference + daily_inspiration
    {
      ...base,
      id: kid(9),
      category: "benchmark_reference",
      title: "对标账号：某 ToB 内容增长博主",
      content:
        "对标账号特点：每条内容都是'一个真实客户的踩坑故事 + 一句洞察 + 一个动作'。3 个月涨粉 5 万，商单转化率 8%。值得借鉴的是'故事真实度'和'结尾的可执行性'。",
      valueGrade: "B",
      sortOrder: 9,
    },
  ]
}

function buildGenerations(userId: string, projectId: string) {
  const now = new Date()
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000)

  return [
    // ── 已发布 + 有结果回填的内容（核心展示） ───────────────
    {
      id: gid(1),
      userId,
      projectId,
      agentId: "content_producer",
      rawInput:
        "针对 B2B 企业市场负责人，写一篇关于'AI 内容团队有想法没产能'痛点的公众号文章。要求：开头讲一个真实翻车故事，给具体数字，禁用 AI 味词，结尾给一个明天就能做的动作。",
      inputSource: "text",
      formatsRequested: JSON.stringify(["wechat"]),
      wechatArticle: `# 你的内容团队，是不是"有想法、没产能"？

上周接待了一位做 HR SaaS 的市场总监，她跟我吐槽：

"我知道每篇该写什么，团队也知道。但一坐到电脑前，就是写不出来。好不容易憋出一篇，读起来像 AI 写的，老板说'没那个味'，删了重写。"

她团队 3 个人，一个月产出 4 篇内容，全部石沉大海。

## 问题不在创意，在"体系"

我看过她团队的选题库，想法其实很好。真正卡住他们的，是三件事：

1. **没有标准**：什么样的稿子算"合格"？没人说得清，于是反复改、反复废。
2. **没有质检**：AI 味、逻辑断层、开头不抓人——这些本可以提前卡掉。
3. **没有回填**：内容发了不知道哪条有效，自然也不知道怎么进化。

## 一个"明天就能做"的动作

今天回去，做一件事：

把你最近 10 篇内容，按"开头是否抓人、是否有真实故事、是否有具体数字、结尾是否有动作"四个维度打分。

你会发现，60% 的内容都死在第一句话。

而这一句话，恰恰是 AI 最擅长、又最需要人审的地方。

这就是我们说的：**AI 是产能放大器，人是质量守门员。**`,
      knowledgeUsed: JSON.stringify([
        { shortId: "KE-006", label: "客户核心痛点：内容团队'有想法、没产能'", category: "customer_pain" },
        { shortId: "KE-007", label: "高频异议：AI 内容会不会反而拉低品牌？", category: "customer_qa" },
        { shortId: "KE-003", label: "表达风格：说人话、讲真事、不端着", category: "writing_style_profile" },
      ]),
      topicTitle: `B2B 内容团队的「产能困境」：有想法，写不出来`,
      topicSelectionId: null,
      selectedTopicIndex: 0,
      qualityScores: JSON.stringify({
        editorial: { score: 8, passed: true, feedback: "结构完整，故事-痛点-方法-动作四段清晰，可读性强。" },
        aiTaste: { score: 8, passed: true, feedback: "无禁词，口语化自然，句式丰富。", details: "禁词命中: 0 个，句式命中: 1 个" },
        attraction: { score: 8, passed: true, feedback: "开头真实故事强钩子，留人能力好。" },
        logic: { score: 8, passed: true, feedback: "痛点与论据匹配，结尾动作可执行。" },
        overall: { score: 8, passed: true, needsRewrite: false },
        rewriteCount: 0,
      }),
      workflowStatus: "published",
      publishedAt: daysAgo(7),
      publishPlatform: "wechat",
      model: "anthropic/claude-sonnet-4.6",
      totalTokens: 3200,
      status: "completed",
      createdAt: daysAgo(8),
    },
    // ── 草稿（展示创作台历史） ───────────────────────────────
    {
      id: gid(2),
      userId,
      projectId,
      agentId: "content_producer",
      rawInput:
        "写一条短视频口播脚本：主题是'为什么你的 AI 内容没人看'。30 秒，开头 3 秒必须留人。",
      inputSource: "text",
      formatsRequested: JSON.stringify(["video_script"]),
      videoScript: `【开头 3 秒·强钩子】
你知道为什么你用 AI 写的内容，一发出去就石沉大海吗？

【10 秒·抛痛点】
不是 AI 不行。是你把它当成了"写完就发"的工具。

【15 秒·给方法】
真正能爆的内容，AI 只负责初稿。
后面还有三道关：第一道卡 AI 味，第二道卡逻辑，第三道是人审。
缺一道，内容就是废稿。

【结尾 2 秒·留动作】
想知道这三道关怎么搭？评论区扣 1。`,
      knowledgeUsed: JSON.stringify([
        { shortId: "KE-004", label: "核心卖点：可审计的内容增长闭环", category: "product_usp" },
      ]),
      topicTitle: "为什么你的 AI 内容没人看",
      topicSelectionId: null,
      selectedTopicIndex: 0,
      qualityScores: JSON.stringify({
        editorial: { score: 7, passed: true, feedback: "口播节奏紧凑，符合短视频结构。" },
        aiTaste: { score: 7, passed: true, feedback: "口语化，无明显 AI 味。", details: "禁词命中: 0 个，句式命中: 0 个" },
        attraction: { score: 8, passed: true, feedback: "3 秒钩子有力，抛问留人。" },
        logic: { score: 7, passed: true, feedback: "痛点-方法-动作闭环完整。" },
        overall: { score: 7, passed: true, needsRewrite: false },
        rewriteCount: 0,
      }),
      workflowStatus: "draft",
      model: "gpt-5.5",
      totalTokens: 1800,
      status: "completed",
      createdAt: daysAgo(2),
    },
    // ── 待审核（展示审核环节） ───────────────────────────────
    {
      id: gid(3),
      userId,
      projectId,
      agentId: "content_producer",
      rawInput:
        "写一篇朋友圈：分享一个客户的真实成交故事，目标是引发同行咨询。要有数字、有反差。",
      inputSource: "text",
      formatsRequested: JSON.stringify(["moments"]),
      momentsPost: `帮一家做 HR SaaS 的客户，60 天做了一件事：
内容获客单条线索成本从 800 降到 210。

不是用了什么黑科技。
就是老老实实搭了一条"内容-质检-回填"的闭环。

最反差的是：
他们内容团队，从 3 个人，减到了 1 个。

不是裁员，是这个人 + AI 的产能，顶过去 5 个。

很多人问我 AI 到底怎么用。
我说：别想着用它替你写。
想着用它，把你的"标准"变成产能。

（这条如果有启发，欢迎来聊聊你们的内容瓶颈）`,
      knowledgeUsed: JSON.stringify([
        { shortId: "KE-005", label: "标杆案例：某 SaaS 公司 60 天内容获客", category: "project_case" },
        { shortId: "KE-008", label: "转化承接：内容到私域的标准动作", category: "private_domain_material" },
      ]),
      topicTitle: "客户真实成交故事：线索成本降 70%",
      topicSelectionId: null,
      selectedTopicIndex: 0,
      qualityScores: JSON.stringify({
        editorial: { score: 8, passed: true, feedback: "朋友圈短平快，反差数据有力。" },
        aiTaste: { score: 9, passed: true, feedback: "极其口语化，像真人手写。", details: "禁词命中: 0 个，句式命中: 0 个" },
        attraction: { score: 8, passed: true, feedback: "数字反差开头抓眼球。" },
        logic: { score: 7, passed: true, feedback: "故事-洞察-引导闭环完整。" },
        overall: { score: 8, passed: true, needsRewrite: false },
        rewriteCount: 0,
      }),
      workflowStatus: "pending_review",
      model: "anthropic/claude-sonnet-4.6",
      totalTokens: 950,
      status: "completed",
      createdAt: daysAgo(1),
    },
  ]
}

main().catch((e) => {
  console.error("演示 seed 失败:", e)
  process.exit(1)
})
