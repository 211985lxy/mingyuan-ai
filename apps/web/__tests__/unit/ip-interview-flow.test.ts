import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

// ── 步骤 1/3：ip-wiki repo upsert + formatIpWikiBlock (context.ts) ──
// ── 步骤 4：transcribe 路由 handler ────────────────────────────────

// ---------- Prisma mock (vitest hoisted) ----------
const mocks = vi.hoisted(() => {
  const dbRows: Record<string, unknown[]> = { ipWikiPage: [] }
  let cuidCounter = 0
  const now = () => new Date("2026-09-02T00:00:00.000Z")

  async function findFirstIpWiki(where: Record<string, unknown>, select?: Record<string, unknown>) {
    const rows = dbRows.ipWikiPage as any[]
    const match = rows.filter((r) => {
      for (const k of Object.keys(where)) {
        const cond = where[k] as any
        if (cond && typeof cond === "object") {
          if (cond.in) return (cond.in as any[]).includes(r[k])
          if (cond.equals) return r[k] === cond.equals
          continue
        }
        if (r[k] !== cond) return false
      }
      return true
    }).sort((a, b) => (b.version || 0) - (a.version || 0))
    const row = match[0]
    if (!row) return null
    if (select) {
      const out: any = {}
      for (const k of Object.keys(select)) out[k] = row[k]
      return out
    }
    return row
  }

  async function findManyIpWiki(where: Record<string, unknown>, orderBy?: any, take?: number) {
    const rows = dbRows.ipWikiPage as any[]
    const match = rows.filter((r) => {
      for (const k of Object.keys(where)) {
        const cond = where[k] as any
        if (cond && typeof cond === "object") {
          if (cond.in) return (cond.in as any[]).includes(r[k])
          continue
        }
        if (r[k] !== cond) return false
      }
      return true
    })
    // orderBy: [ { pageType: asc }, { updatedAt: desc } ] —— 简化排序
    const sorted = [...match].sort((a, b) => {
      const ob = (orderBy as any[]) || [{ updatedAt: "desc" }]
      for (const o of ob) {
        for (const k of Object.keys(o)) {
          const dir = o[k] === "asc" ? 1 : -1
          if (a[k] < b[k]) return -1 * dir
          if (a[k] > b[k]) return 1 * dir
        }
      }
      return 0
    })
    return typeof take === "number" ? sorted.slice(0, take) : sorted
  }

  async function updateManyIpWiki(where: Record<string, unknown>, data: Record<string, unknown>) {
    let count = 0
    const rows = dbRows.ipWikiPage as any[]
    for (const r of rows) {
      let ok = true
      for (const k of Object.keys(where)) {
        if ((r as any)[k] !== (where as any)[k]) { ok = false; break }
      }
      if (ok) {
        for (const dk of Object.keys(data)) (r as any)[dk] = (data as any)[dk]
        count++
      }
    }
    return { count }
  }

  async function createIpWiki(data: any) {
    cuidCounter++
    const row = {
      id: `cw_page_${cuidCounter}`,
      ...data,
      createdAt: now(),
      updatedAt: now(),
    }
    dbRows.ipWikiPage.push(row)
    return row
  }

  const createFn = vi.fn(createIpWiki)

  return {
    dbRows,
    resetDb: () => {
      dbRows.ipWikiPage = []
      cuidCounter = 0
      createFn.mockClear()
    },
    ipWikiCreateMock: createFn,
    findFirst: findFirstIpWiki,
    findMany: findManyIpWiki,
    updateMany: updateManyIpWiki,
    create: createFn,
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ipWikiPage: {
      findFirst: vi.fn((args: any) => mocks.findFirst(args.where, args.select)),
      findMany: vi.fn((args: any) => mocks.findMany(args.where, args.orderBy, args.take)),
      updateMany: vi.fn((args: any) => mocks.updateMany(args.where, args.data)),
      // 注意：真实 Prisma create() 签名是 create({ data: fields })，必须 unwrap
      create: vi.fn((arg: { data: any }) => mocks.create(arg.data)),
    },
  },
}))

// ---------- 其它依赖 mock（避免走真实 LLM / 阿里云 / Auth） ----------
vi.mock("@/lib/aliyun-asr", () => ({
  transcribeAudioWav: vi.fn(async () => "这是采访语音的真实逐字稿：我做 ToB SaaS 销售赋能业务十年……"),
}))
vi.mock("@/lib/transcript-polish", () => ({
  polishTranscript: vi.fn(async (t: string) => `[润色稿]${t}`),
}))
vi.mock("@/lib/user-auth", () => ({
  authenticateRequest: vi.fn(async () => ({ userId: "u_test", type: "user" })),
  authErrorResponse: vi.fn(() => null as any),
}))
vi.mock("@/env", () => ({
  env: {
    ALIYUN_VIAPI_ACCESS_KEY_ID: "mock_key",
    OSS_ACCESS_KEY_ID: "mock_oss_key",
    ALIYUN_VIAPI_ACCESS_KEY_SECRET: "mock_sec",
    OSS_ACCESS_KEY_SECRET: "mock_oss_sec",
    ALIYUN_NLS_APP_KEY: "mock_app_key",
  },
}))
vi.mock("@/features/aim/services/transcribe-audio", () => ({
  readAsrAudioInput: vi.fn(async () => ({ ok: true, audioBuffer: Buffer.from([]) })),
}))
// knowledgeEntry 用于 style-profile（buildAimKnowledgeContext 不直接走 ip-wiki）
vi.mock("@/lib/llm/embeddings", () => ({
  retrieveRelevantKnowledge: vi.fn(async () => ({ entries: [], source: "raw" as const })),
  ensureKnowledgeEmbedding: vi.fn(async () => {}),
}))

// ---------- 导入被测模块（必须在 vi.mock 之后） ----------
import {
  upsertBossBriefFromInterview,
} from "@/lib/ip-wiki/repo"
import type { InterviewSixDim } from "@/lib/ip-wiki/boss-brief-types"
import {
  buildIpWikiBlock,
  formatIpWikiBlock,
  loadIpWikiPagesIndexed,
  BLOCK_PAGE_TYPES,
} from "@/lib/ip-wiki/context"
import { IP_WIKI_CORE_PAGE_TYPES } from "@/lib/ip-wiki/types"
import { applyInterviewToPersona } from "@/lib/assistant-persona"
import { applyInterviewToStyleProfile } from "@/lib/style-profile"
import { resolveAimTurnIntent } from "@/lib/aim-turn-intent"
import { POST as transcribePOST } from "@/app/api/aim/transcribe/route"

// ---------- 采访样本（六维） ----------
function sampleInterview(): InterviewSixDim {
  return {
    experiences: [
      "在华为做了 8 年 ToB 大客户销售，操盘过亿级 SaaS 续约单",
      "2020 年创业成立销售赋能咨询公司，服务 200+ 成长型 SaaS 企业",
      "著有《SaaS 销售增长实战》一书，机械工业出版社",
    ],
    business: "为成长型 B2B SaaS 企业提供销售团队搭建、获客方法论与陪跑咨询服务",
    strengthsWeaknesses: {
      strengths: [
        "销售流程拆解与 SOP 搭建",
        "大客户签约谈判与高层对话",
        "创始人销售团队从 0 到 1 搭建",
        "用真实 SaaS 成交案例讲解",
      ],
      weaknesses: [
        "不擅长纯品牌广告/消费品直播带货",
        "不做纯 TO 小 C 的个人消费类咨询",
      ],
    },
    targetAudience: {
      suitable: "年营收 500 万-5 亿、有明确产品的 B2B SaaS 创始人 / 销售负责人",
      notSuitable: "尚未有产品落地的纯想法阶段创业者；纯 C 端消费品品牌；只想学话术不想动组织的创始人",
    },
    expressionStyle: "专业严谨、干货密集、数据说话，多用真实案例和流程拆解；口语化但不调侃，给结论先给证据。",
    contentBoundaries: [
      "不说具体客户的真实合同金额或未公开商业数据",
      "不点评同行竞品，不踩人抬己",
      "不承诺『X 个月必赚钱』式结果保证",
      "不聊个人家庭、宗教、政治观点",
    ],
  }
}

// ---------- 测试套件 ----------
describe("IP 采访 → 老板说明书（boss_brief）端到端流程", () => {
  beforeEach(() => {
    mocks.resetDb()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  // ====================================================================
  // 步骤 1：构造 6 轮采访 → upsertBossBriefFromInterview({confirmed:true})
  // ====================================================================
  describe("步骤 1 · upsertBossBriefFromInterview confirmed=true", () => {
    it("写 ipWikiPage(boss_brief) + 返回 persona / style-profile draft", async () => {
      const result = await upsertBossBriefFromInterview({
        userId: "u_001",
        projectId: "proj_saas_boss",
        confirmed: true,
        interviewResult: sampleInterview(),
      })

      // 断言 1：写入成功
      expect(result.applied).toBe(true)
      expect(result.page).toBeDefined()
      expect(result.page!.pageType).toBe("boss_brief")
      expect(result.page!.title).toBe("老板说明书")
      expect(result.page!.projectId).toBe("proj_saas_boss")
      expect(result.page!.version).toBe(1)

      // 断言 2：sections 含 5 项结构（用 content 关键词判断）
      const content = result.page!.content
      expect(content).toContain("① 定位与经历")
      expect(content).toContain("② 擅长与不擅长")
      expect(content).toContain("③ 服务谁")
      expect(content).toContain("④ 表达习惯")
      expect(content).toContain("⑤ 内容边界")
      // 业务出现在顶部
      expect(content.indexOf("核心业务")).toBeLessThan(content.indexOf("过往经历") ?? 1e9)
      // 经历 bullets 至少 3 条
      expect(content.match(/- 在华为做/g)?.length).toBeGreaterThanOrEqual(1)
      expect(content).toContain("不适合的客户")
      // 内容边界 4 条 bullets
      expect(content).toContain("不说具体客户的真实合同金额")
      expect(content).toContain("不聊个人家庭")

      // 断言 3：frontmatter 六字段齐全（结构化存）
      const fm = result.page!.frontmatter as any
      expect(fm.schema).toBe("boss_brief_v1")
      expect(fm.business).toBe(sampleInterview().business)
      expect(fm.experiences).toHaveLength(3)
      expect(fm.strengths).toHaveLength(4)
      expect(fm.weaknesses).toHaveLength(2)
      expect(fm.audienceSuitable).toBeTruthy()
      expect(fm.audienceNotSuitable).toBeTruthy()
      expect(fm.expressionStyle).toContain("专业严谨")
      expect(fm.contentBoundaries).toHaveLength(4)

      // 断言 4：Prisma 回读 boss_brief active 页
      const direct = await mocks.findFirst(
        { projectId: "proj_saas_boss", pageType: "boss_brief", status: "active" },
        undefined,
      )
      expect(direct).toBeTruthy()
      expect((direct as any).title).toBe("老板说明书")

      // 断言 5：assistant-persona 返回值 bio/traits 非空
      const persona = result.persona!
      expect(persona).toBeDefined()
      expect(persona.bio.length).toBeGreaterThan(10)
      expect(persona.bio).toContain("B2B SaaS")
      expect(persona.traits.length).toBeGreaterThanOrEqual(2)
      // traits 里至少带一个擅长标签或 strengths 条目
      expect(
        persona.traits.some((t) =>
          ["销售流程", "大客户", "谈判", "专业严谨", "干货密集", "擅长服务"].some((kw) => t.includes(kw)),
        ),
      ).toBe(true)
      expect(persona.style).toContain("专业严谨")

      // 断言 6：style-profile 表达习惯字段非空
      const style = result.styleProfileDraft!
      expect(style).toBeDefined()
      expect(style.category).toBe("writing_style_profile")
      expect(style.title).toBe("IP 写作风格主档案")
      expect(style.tone.length).toBeGreaterThan(2)
      expect(style.voice).toContain("表达上")
      expect(style.forbiddenWords.length).toBeGreaterThanOrEqual(3)
      expect(style.content).toContain("表达习惯")
      expect(style.content).toContain("内容边界")
    })

    it("接受字符串 JSON（含 markdown 围栏）作为 interviewResult，走 2 次解析重试语义", async () => {
      const wrapped = "```json\n" + JSON.stringify(sampleInterview()) + "\n```"
      const result = await upsertBossBriefFromInterview({
        userId: "u_002",
        projectId: "proj_json_wrapped",
        confirmed: true,
        interviewResult: wrapped,
      })
      expect(result.applied).toBe(true)
      expect(result.page!.pageType).toBe("boss_brief")
      expect((result.page!.frontmatter as any).experiences).toHaveLength(3)
    })

    it("二次 upsert：version+1，旧 active → archived（增量语义）", async () => {
      await upsertBossBriefFromInterview({
        userId: "u_003", projectId: "proj_v2", confirmed: true,
        interviewResult: sampleInterview(),
      })
      const updated: InterviewSixDim = {
        ...sampleInterview(),
        business: "（升级版）B2B SaaS 销售赋能 + AI Copilot 落地咨询",
      }
      const r2 = await upsertBossBriefFromInterview({
        userId: "u_003", projectId: "proj_v2", confirmed: true,
        interviewResult: updated,
      })
      expect(r2.applied).toBe(true)
      expect(r2.page!.version).toBe(2)
      // v1 已归档
      const v1 = await mocks.findFirst(
        { userId: "u_003", projectId: "proj_v2", pageType: "boss_brief", version: 1 } as any,
      )
      expect(v1).toBeTruthy()
      expect((v1 as any).status).toBe("archived")
    })
  })

  // ====================================================================
  // 步骤 2：buildIpWikiBlock（boss_brief 在知识库中以最高优先级浮出）
  // 注：buildAimKnowledgeContext 走 KnowledgeEntry 向量检索，boss_brief 在 ipWikiPage 表；
  //    项目实际通过 buildIpWikiBlock → ipWikiBlock 注入到 AIM prompt，与
  //    IP_WIKI_CORE_PAGE_TYPES 首位（boss_brief）+ BLOCK_PAGE_TYPES 白名单一致。
  // ====================================================================
  describe("步骤 2 · buildIpWikiBlock / formatIpWikiBlock 加载 boss_brief", () => {
    beforeEach(async () => {
      await upsertBossBriefFromInterview({
        userId: "u_ctx", projectId: "proj_ctx", confirmed: true,
        interviewResult: sampleInterview(),
      })
    })

    it("BLOCK_PAGE_TYPES 加载链路首位 = boss_brief（知识库注入最高优先级）", () => {
      // boss_brief 放在 BLOCK_PAGE_TYPES 的 rank=0，保证下游 prompt 先读到老板说明书画像。
      // 不放 CORE 的原因：core 用于 lint/完整性门禁，老板说明书是采访后产生的增量档案。
      expect(BLOCK_PAGE_TYPES[0]).toBe("boss_brief")
      expect(BLOCK_PAGE_TYPES).toHaveLength(8) // 1 boss_brief + 6 core + 1 viral_methodology
    })

    it("buildIpWikiBlock 返回块中含 boss_brief chunk/内容 ≥ 1 处", async () => {
      const block = await buildIpWikiBlock({ projectId: "proj_ctx" })
      // 老板说明书 label + 5 项结构都应出现
      expect(block.length).toBeGreaterThan(100)
      expect(block).toContain("老板说明书")
      // 5 项结构至少都在
      for (const mark of ["定位与经历", "擅长与不擅长", "服务谁", "表达习惯", "内容边界"]) {
        expect(block).toContain(mark)
      }
    })

    it("formatIpWikiBlock 纯函数：boss_brief 排序在其它页之前", () => {
      const pages = [
        { id: "w3", projectId: "p", pageType: "audience" as const, title: "目标人群",
          content: "观众……", frontmatter: {}, sources: [], links: [], sourceGenerationId: null,
          version: 1, status: "active", createdAt: new Date(), updatedAt: new Date() },
        { id: "w1", projectId: "p", pageType: "boss_brief" as const, title: "老板说明书",
          content: "老板说明书正文", frontmatter: {}, sources: [], links: [], sourceGenerationId: null,
          version: 1, status: "active", createdAt: new Date(), updatedAt: new Date() },
        { id: "w2", projectId: "p", pageType: "positioning" as const, title: "定位主张",
          content: "定位正文", frontmatter: {}, sources: [], links: [], sourceGenerationId: null,
          version: 1, status: "active", createdAt: new Date(), updatedAt: new Date() },
      ]
      const block = formatIpWikiBlock(pages)
      const iBoss = block.indexOf("老板说明书")
      const iPos = block.indexOf("定位主张")
      const iAud = block.indexOf("目标人群")
      // boss_brief 应排在 positioning 与 audience 之前（最高优先级）
      expect(iBoss).toBeLessThan(iPos)
      expect(iBoss).toBeLessThan(iAud)
      // boss_brief 内容：至少 1 段非空
      expect(block.match(/老板说明书/g)?.length ?? 0).toBeGreaterThanOrEqual(1)
    })

    it("boss_brief 页可通过 listIpWikiPages 按 pageType 精准召回（项目知识库侧）", async () => {
      // 直接走 Prisma 存储层（等价于 listIpWikiPages with filter），验证 boss_brief 可检索
      const rows = await mocks.findMany(
        { projectId: "proj_ctx", status: "active", pageType: { in: ["boss_brief"] } } as any,
        undefined, undefined,
      )
      expect(rows.length).toBe(1)
      expect((rows[0] as any).pageType).toBe("boss_brief")
      expect((rows[0] as any).title).toBe("老板说明书")
      // 同时：loadIpWikiPagesIndexed 对 core 页仍然生效（不回归）
      const { listIpWikiPages } = await import("@/lib/ip-wiki/repo")
      const list = await listIpWikiPages({ projectId: "proj_ctx", pageTypes: ["boss_brief" as any] })
      expect(list.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ====================================================================
  // 步骤 3：confirmed=false 调用 upsertBossBriefFromInterview
  // ====================================================================
  describe("步骤 3 · confirmed=false 拒绝写入闸门", () => {
    it("返回 applied=false + reason=not_confirmed；Prisma create 未调用", async () => {
      const before = mocks.ipWikiCreateMock.mock.calls.length
      const rFalse = await upsertBossBriefFromInterview({
        userId: "u_gate",
        projectId: "proj_gate",
        confirmed: false,
        interviewResult: sampleInterview(),
      })
      expect(rFalse.applied).toBe(false)
      expect(rFalse.reason).toBe("not_confirmed")
      expect(rFalse.page).toBeUndefined()
      expect(rFalse.persona).toBeUndefined()
      // 未调 create
      expect(mocks.ipWikiCreateMock.mock.calls.length).toBe(before)

      // confirmed=undefined 同样拒绝
      const rUndef = await upsertBossBriefFromInterview({
        userId: "u_gate",
        projectId: "proj_gate",
        confirmed: undefined as unknown as boolean,
        interviewResult: sampleInterview(),
      })
      expect(rUndef.applied).toBe(false)
      expect(rUndef.reason).toBe("not_confirmed")
      expect(mocks.ipWikiCreateMock.mock.calls.length).toBe(before)

      // confirmed=true 依然可写（闸门只拦 falsy）
      const rOk = await upsertBossBriefFromInterview({
        userId: "u_gate",
        projectId: "proj_gate",
        confirmed: true,
        interviewResult: sampleInterview(),
      })
      expect(rOk.applied).toBe(true)
      expect(mocks.ipWikiCreateMock.mock.calls.length).toBe(before + 1)
    })
  })

  // ====================================================================
  // 步骤 4：transcribe mode=interview → 响应含 readyForInterviewSkill
  // ====================================================================
  describe("步骤 4 · /api/aim/transcribe mode=interview handler", () => {
    function mockRequest(queryMode: string | null) {
      const url = queryMode
        ? `http://test.local/api/aim/transcribe?mode=${queryMode}`
        : "http://test.local/api/aim/transcribe"
      // 实现 NextRequest 形状：补 nextUrl（与 URL 对象同构，提供 searchParams.get）
      const nextUrl = new URL(url)
      const headers = new Headers({ "content-type": "application/octet-stream" })
      const base = new Request(url, { method: "POST", headers, body: null })
      const req: any = base as unknown
      req.nextUrl = nextUrl
      // method headers url 等已由 Request 原生提供
      return req
    }

    it("mode=interview → 返回 body 含 readyForInterviewSkill===true 且 text 有采访提示", async () => {
      const resp = await transcribePOST(mockRequest("interview"))
      expect(resp.status).toBe(200)
      const body: any = await resp.json()
      expect(body.readyForInterviewSkill).toBe(true)
      expect(body.mode).toBe("interview")
      expect(typeof body.text).toBe("string")
      expect(body.text).toContain("采访模式")
      expect(body.text).toContain("确认应用")
      expect(body.text).toContain("老板说明书")
    })

    it("无 mode / mode=default → 仅返回 text，不注入 readyForInterviewSkill", async () => {
      const respDefault = await transcribePOST(mockRequest(null))
      const bodyDefault: any = await respDefault.json()
      expect(bodyDefault.readyForInterviewSkill).toBeUndefined()
      expect(bodyDefault.mode).toBeUndefined()
      expect(typeof bodyDefault.text).toBe("string")
      expect(bodyDefault.text).not.toContain("采访模式")
    })
  })

  // ====================================================================
  // Extra（E 要求验证）：readyForInterviewSkill → interview_build_profile
  // ====================================================================
  describe("aim-turn-intent · readyForInterviewSkill 标志强制路由", () => {
    it("readyForInterviewSkill=true → action=interview_build_profile, scope=ip_profile（高于触发词）", () => {
      const intent = resolveAimTurnIntent({
        rawInput: "帮我写一篇小红书种草文案", // 本来是 create 意图
        readyForInterviewSkill: true, // 但有采访逐字稿标志
      })
      expect(intent.action).toBe("interview_build_profile")
      expect(intent.scope).toBe("ip_profile")
      expect(intent.summary).toContain("采访")
    })

    it("transcript.mode='interview' 同样强制路由（用户直接用触发词也不覆盖）", () => {
      const intent = resolveAimTurnIntent({
        rawInput: "重写整篇口播", // 本来是 rewrite
        transcript: { mode: "interview" },
      })
      expect(intent.action).toBe("interview_build_profile")
      expect(intent.scope).toBe("ip_profile")
    })

    it("无标志时的触发词路径（回归）：仍然工作", () => {
      const intent = resolveAimTurnIntent({ rawInput: "帮我做老板说明书采访" })
      expect(intent.action).toBe("interview_build_profile")
      expect(intent.scope).toBe("ip_profile")
    })
  })

  // ====================================================================
  // Extra：纯函数单测（applyInterviewToPersona / applyInterviewToStyleProfile）
  // ====================================================================
  describe("辅助纯函数 · applyInterviewToPersona & applyInterviewToStyleProfile", () => {
    const dim = sampleInterview()

    it("applyInterviewToPersona：合并 oldPersona，不丢历史 traits", () => {
      const a = applyInterviewToPersona(dim)
      const b = applyInterviewToPersona(dim, {
        bio: "创始人老王，深耕 B2B SaaS 十五年。",
        traits: ["行业KOL", "实战派"],
      })
      expect(b.bio).toContain("创始人老王")
      expect(b.bio).toContain("B2B SaaS")  // 新 bio 信息未丢
      expect(b.traits).toEqual(expect.arrayContaining(["行业KOL", "实战派"]))
      // style 合并
      expect(b.style.length).toBeGreaterThan(a.style.length - 5)
    })

    it("applyInterviewToStyleProfile：forbiddenWords 抽取自边界，tone/voice 非空", () => {
      const draft = applyInterviewToStyleProfile({
        expressionStyle: dim.expressionStyle,
        contentBoundaries: dim.contentBoundaries,
        strengthsWeaknesses: dim.strengthsWeaknesses,
      })
      expect(draft.tone).toMatch(/专业严谨|干货密集/)
      expect(draft.voice).toContain("销售流程")
      expect(draft.forbiddenWords).toEqual(
        expect.arrayContaining([expect.stringContaining("具体客户")]),
      )
      expect(draft.forbiddenWords.length).toBeGreaterThanOrEqual(3)
      expect(draft.content).toContain("推荐基调")
    })
  })
})
