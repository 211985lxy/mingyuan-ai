import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import jwt from "jsonwebtoken"
import { PATCH as PATCH_SCRIPT } from "@/app/api/scripts/[id]/route"
import { POST as GENERATE_SCRIPTS } from "@/app/api/scripts/generate/route"
import { buildIpProfilePromptSnapshot } from "./ip-profile-fixtures"
import {
  cleanDatabase,
  cleanRedis,
  createAdminUser,
  createTemplate,
  createVideoStructure,
  disconnectAll,
  json,
  prisma,
  req,
} from "./helpers"

let user: { id: string; email: string }
let token: string
let templateId: string
let structureId: string

function userReq(url: string, opts: { method?: string; body?: unknown } = {}) {
  return req(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}` },
  })
}

describe("Script Generation E2E", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()

    delete process.env.OPENAI_API_KEY

    const createdUser = await prisma.user.create({
      data: {
        email: "script-generation@e2e.com",
        password: "hashed",
        name: "Script Owner",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
    user = { id: createdUser.id, email: createdUser.email }
    token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" }
    )

    const admin = await createAdminUser({
      email: "script-admin@e2e.com",
    })

    const template = await createTemplate(admin.id, {
      name: "property-hook",
      displayName: "房产钩子模板",
      status: "published",
      publishedAt: new Date(),
      scriptTemplate:
        "在{{city}}买{{propertyType}}，最怕踩坑。今天我直接告诉你，为什么{{highlight}}会决定这套房值不值得下手。",
      variables: [
        {
          key: "city",
          label: "城市",
          placeholder: "如：深圳",
          required: true,
          type: "text",
        },
        {
          key: "propertyType",
          label: "房型",
          placeholder: "如：改善型三房",
          required: true,
          type: "text",
        },
        {
          key: "highlight",
          label: "关键亮点",
          placeholder: "如：地铁口+学区",
          required: true,
          type: "text",
        },
      ],
    })

    templateId = template.id

    const structure = await createVideoStructure({
      name: "script-generation-structure",
      displayName: "脚本生成结构",
    })
    structureId = structure.id
  })

  afterAll(async () => {
    await cleanDatabase()
    await disconnectAll()
  })

  beforeEach(async () => {
    await prisma.script.deleteMany({ where: { userId: user.id } })
    await prisma.contentGenerationRun.deleteMany({ where: { userId: user.id } })
    await prisma.ipProfile.deleteMany({ where: { userId: user.id } })
  })

  it("rejects unauthorized generation", async () => {
    const res = await GENERATE_SCRIPTS(
      req("/api/scripts/generate", {
        method: "POST",
        body: {
          templateId,
          structureId,
          inputs: { city: "深圳", propertyType: "改善型三房", highlight: "地铁口+学区" },
        },
      }),
      undefined as never
    )
    expect(res.status).toBe(401)
  })

  it("rejects generation when IP profile is missing", async () => {
    const res = await GENERATE_SCRIPTS(
      userReq("/api/scripts/generate", {
        method: "POST",
        body: {
          templateId,
          structureId,
          inputs: { city: "深圳", propertyType: "改善型三房", highlight: "地铁口+学区" },
        },
      }),
      undefined as never
    )

    expect(res.status).toBe(412)
    const body = await json(res)
    expect(body.error).toContain("IP profile")
    expect(body.data.isComplete).toBe(false)
  })

  it("rejects generation when template does not exist", async () => {
    const profileInput = {
      displayName: "老王说房",
      nickname: "老王",
      industry: "房产",
      primaryOffer: "帮助客户更快识别高性价比房源",
      targetAudience: "预算有限但想买到核心地段房子的家庭",
      ipTraits: "真诚、专业、懂成交",
      toneOfVoice: "干脆直接",
      proofPoints: "8年经验，服务300+家庭",
      callToAction: "评论区留言户型，我帮你判断值不值",
    }

    await prisma.ipProfile.create({
      data: {
        userId: user.id,
        ...profileInput,
        isComplete: true,
        isActive: true,
        promptSnapshot: buildIpProfilePromptSnapshot(profileInput),
      },
    })

    const res = await GENERATE_SCRIPTS(
      userReq("/api/scripts/generate", {
        method: "POST",
        body: {
          templateId: "missing-template",
          structureId,
          inputs: { city: "深圳", propertyType: "改善型三房", highlight: "地铁口+学区" },
        },
      }),
      undefined as never
    )

    expect(res.status).toBe(404)
  })

  it("creates a generation run and persists candidate scripts", async () => {
    const profileInput = {
      displayName: "老王说房",
      nickname: "老王",
      industry: "房产",
      primaryOffer: "帮助客户快速判断房源是否值得入手",
      targetAudience: "正在深圳寻找改善型住房的家庭",
      ipTraits: "真诚、专业、反套路",
      toneOfVoice: "像朋友一样直接说重点",
      proofPoints: "8年从业经验，服务300+买房客户",
      callToAction: "直接私信我，发你一份避坑清单",
    }

    const profile = await prisma.ipProfile.create({
      data: {
        userId: user.id,
        ...profileInput,
        isComplete: true,
        isActive: true,
        promptSnapshot: buildIpProfilePromptSnapshot(profileInput),
      },
    })

    const res = await GENERATE_SCRIPTS(
      userReq("/api/scripts/generate", {
        method: "POST",
        body: {
          templateId,
          structureId,
          hotTopic: "深圳楼市回暖",
          inputs: {
            city: "深圳",
            propertyType: "改善型三房",
            highlight: "地铁口+学区",
          },
        },
      }),
      undefined as never
    )

    expect(res.status).toBe(200)
    const body = await json(res)

    expect(body.data.run.templateId).toBe(templateId)
    expect(body.data.run.ipProfileId).toBe(profile.id)
    expect(["succeeded", "degraded"]).toContain(body.data.run.status)
    expect(body.data.run.promptText).toContain("个人IP档案")
    expect(body.data.scripts).toHaveLength(3)
    expect(body.data.scripts.every((script: { status: string }) => script.status === "candidate")).toBe(true)

    const storedRun = await prisma.contentGenerationRun.findUnique({
      where: { id: body.data.run.id },
    })
    expect(storedRun?.hotTopic).toBe("深圳楼市回暖")

    const storedScripts = await prisma.script.findMany({
      where: { generationRunId: body.data.run.id },
      orderBy: { createdAt: "asc" },
    })
    expect(storedScripts).toHaveLength(3)
    expect(storedScripts.every((script) => script.sourceTemplateId === templateId)).toBe(true)
    expect(storedScripts.every((script) => script.ipProfileId === profile.id)).toBe(true)
  })

  it("edits and switches the selected script inside one generation run", async () => {
    const profileInput = {
      displayName: "老王说房",
      nickname: "老王",
      industry: "房产",
      primaryOffer: "帮助客户快速判断房源是否值得入手",
      targetAudience: "正在深圳寻找改善型住房的家庭",
      ipTraits: "真诚、专业、反套路",
      toneOfVoice: "像朋友一样直接说重点",
      proofPoints: "8年从业经验，服务300+买房客户",
      callToAction: "直接私信我，发你一份避坑清单",
    }

    await prisma.ipProfile.create({
      data: {
        userId: user.id,
        ...profileInput,
        isComplete: true,
        isActive: true,
        promptSnapshot: buildIpProfilePromptSnapshot(profileInput),
      },
    })

    const generationRes = await GENERATE_SCRIPTS(
      userReq("/api/scripts/generate", {
        method: "POST",
        body: {
          templateId,
          structureId,
          inputs: {
            city: "深圳",
            propertyType: "改善型三房",
            highlight: "地铁口+学区",
          },
        },
      }),
      undefined as never
    )
    expect(generationRes.status).toBe(200)

    const generationBody = await json(generationRes)
    const scripts = generationBody.data.scripts as Array<{ id: string }>
    expect(scripts).toHaveLength(3)

    const firstSelect = await PATCH_SCRIPT(
      userReq(`/api/scripts/${scripts[0].id}`, {
        method: "PATCH",
        body: { status: "selected" },
      }),
      { params: Promise.resolve({ id: scripts[0].id }) }
    )
    expect(firstSelect.status).toBe(200)

    const secondSelect = await PATCH_SCRIPT(
      userReq(`/api/scripts/${scripts[1].id}`, {
        method: "PATCH",
        body: {
          status: "selected",
          content: "这是最终选中的改写版文案，会直接进入视频任务。",
        },
      }),
      { params: Promise.resolve({ id: scripts[1].id }) }
    )
    expect(secondSelect.status).toBe(200)

    const refreshed = await prisma.script.findMany({
      where: { generationRunId: generationBody.data.run.id },
      orderBy: { createdAt: "asc" },
    })

    expect(refreshed[0].status).toBe("candidate")
    expect(refreshed[0].selectedAt).toBeNull()
    expect(refreshed[1].status).toBe("selected")
    expect(refreshed[1].content).toContain("最终选中的改写版文案")
    expect(refreshed[1].selectedAt).not.toBeNull()
  })
})
