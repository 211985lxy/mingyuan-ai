import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const {
  mockGenerateUploadUrl,
  mockCloneFastAvatar,
  mockGenerateVirtualmanBroadcast,
} = vi.hoisted(() => ({
  mockGenerateUploadUrl: vi.fn(),
  mockCloneFastAvatar: vi.fn(),
  mockGenerateVirtualmanBroadcast: vi.fn(),
}))

vi.mock("@/lib/oss", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/oss")>()
  return {
    ...actual,
    generateUploadUrl: mockGenerateUploadUrl,
  }
})

vi.mock("@/lib/shanjian", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shanjian")>()
  return {
    ...actual,
    cloneFastAvatar: mockCloneFastAvatar,
    generateVirtualmanBroadcast: mockGenerateVirtualmanBroadcast,
  }
})

import { POST as REGISTER } from "@/app/api/auth/register/route"
import { POST as ACTIVATE } from "@/app/api/auth/activate/route"
import { POST as SAVE_AUTH_VIDEO } from "@/app/api/auth/auth-video/route"
import { PUT as UPSERT_IP_PROFILE } from "@/app/api/ip-profile/route"
import { POST as REQUEST_UPLOAD_URL } from "@/app/api/assets/upload-url/route"
import { POST as REGISTER_ASSET } from "@/app/api/assets/route"
import { POST as CREATE_AVATAR } from "@/app/api/avatars/route"
import { GET as GET_AVATAR } from "@/app/api/avatars/[id]/route"
import { POST as GENERATE_SCRIPTS } from "@/app/api/scripts/generate/route"
import { PATCH as PATCH_SCRIPT } from "@/app/api/scripts/[id]/route"
import { POST as CREATE_TASK } from "@/app/api/tasks/route"
import { GET as GET_TASK } from "@/app/api/tasks/[id]/route"
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

let templateId: string
let structureId: string
let adminId: string
let userSequence = 0

function authedReq(
  token: string,
  url: string,
  opts: { method?: string; body?: unknown } = {}
) {
  return req(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}` },
  })
}

async function registerUser(name: string) {
  userSequence += 1

  const res = await REGISTER(
    req("/api/auth/register", {
      method: "POST",
      body: {
        email: `flow-${userSequence}@e2e.com`,
        password: "Pass123!",
        name,
      },
    })
  )

  expect(res.status).toBe(201)
  return json(res) as Promise<{
    token: string
    user: { id: string; email: string; name: string }
  }>
}

async function activateSession(token: string, seed: number) {
  const code = `FLOW${String(seed).padStart(12, "0")}`

  await prisma.activationCode.create({
    data: {
      code,
      batchId: `flow-batch-${seed}`,
      durationDays: 30,
      createdBy: adminId,
    },
  })

  const res = await ACTIVATE(
    authedReq(token, "/api/auth/activate", {
      method: "POST",
      body: { code },
    }),
    undefined as never
  )

  expect(res.status).toBe(200)
}

describe("End-to-End Core Flows", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()

    const admin = await createAdminUser({
      email: "flow-admin@e2e.com",
    })
    adminId = admin.id

    const template = await createTemplate(admin.id, {
      name: "content-first-template",
      displayName: "内容优先模板",
      status: "published",
      publishedAt: new Date(),
      scriptTemplate:
        "如果你正在{{city}}考虑{{topic}}，先别急着下决定。今天我用最直白的话告诉你，为什么{{highlight}}才是你真正该盯住的点。",
      variables: [
        {
          key: "city",
          label: "城市",
          placeholder: "如：深圳",
          required: true,
          type: "text",
        },
        {
          key: "topic",
          label: "主题",
          placeholder: "如：买房",
          required: true,
          type: "text",
        },
        {
          key: "highlight",
          label: "关键点",
          placeholder: "如：地铁口和学区",
          required: true,
          type: "text",
        },
      ],
    })

    templateId = template.id

    const structure = await createVideoStructure({
      name: "content-first-structure",
      displayName: "内容优先结构",
    })
    structureId = structure.id
  })

  afterAll(async () => {
    await cleanDatabase()
    await disconnectAll()
  })

  beforeEach(() => {
    mockGenerateUploadUrl.mockReset()
    mockCloneFastAvatar.mockReset()
    mockGenerateVirtualmanBroadcast.mockReset()
  })

  it("walks the real asset chain from upload intent to ready avatar", async () => {
    mockGenerateUploadUrl
      .mockResolvedValueOnce({
        uploadUrl: "https://oss.example.com/upload/source-video",
        assetUrl: "https://oss.example.com/assets/source-video.mp4",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      })
      .mockResolvedValueOnce({
        uploadUrl: "https://oss.example.com/upload/auth-video",
        assetUrl: "https://oss.example.com/assets/auth-video.mp4",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      })
    mockCloneFastAvatar.mockResolvedValue("ext-avatar-task-1")

    const session = await registerUser("Asset Flow User")
    await activateSession(session.token, userSequence)

    const sourceUpload = await REQUEST_UPLOAD_URL(
      authedReq(session.token, "/api/assets/upload-url", {
        method: "POST",
        body: { fileName: "source.mp4", contentType: "video/mp4" },
      }),
      undefined as never
    )
    expect(sourceUpload.status).toBe(200)
    const sourceUploadBody = await json(sourceUpload)

    const authUpload = await REQUEST_UPLOAD_URL(
      authedReq(session.token, "/api/assets/upload-url", {
        method: "POST",
        body: { fileName: "auth.mp4", contentType: "video/mp4" },
      }),
      undefined as never
    )
    expect(authUpload.status).toBe(200)
    const authUploadBody = await json(authUpload)

    const sourceAssetRes = await REGISTER_ASSET(
      authedReq(session.token, "/api/assets", {
        method: "POST",
        body: {
          name: "数字人训练视频",
          assetType: "video",
          url: sourceUploadBody.data.assetUrl,
        },
      }),
      undefined as never
    )
    expect(sourceAssetRes.status).toBe(201)
    const sourceAssetBody = await json(sourceAssetRes)

    const authAssetRes = await REGISTER_ASSET(
      authedReq(session.token, "/api/assets", {
        method: "POST",
        body: {
          name: "授权视频",
          assetType: "video",
          url: authUploadBody.data.assetUrl,
        },
      }),
      undefined as never
    )
    expect(authAssetRes.status).toBe(201)
    const authAssetBody = await json(authAssetRes)

    const authVideoRes = await SAVE_AUTH_VIDEO(
      authedReq(session.token, "/api/auth/auth-video", {
        method: "POST",
        body: { authVideoUrl: authAssetBody.data.url },
      }),
      undefined as never
    )
    expect(authVideoRes.status).toBe(200)

    const avatarRes = await CREATE_AVATAR(
      authedReq(session.token, "/api/avatars", {
        method: "POST",
        body: {
          name: "销售数字人",
          cloneType: "fast",
          videoUrl: sourceAssetBody.data.url,
          authVideoUrl: authAssetBody.data.url,
          authText: "本人授权 明远AIM 使用该视频进行数字人克隆。",
        },
      }),
      undefined as never
    )
    expect(avatarRes.status).toBe(201)
    const avatarBody = await json(avatarRes)
    expect(avatarBody.data.status).toBe("cloning")

    await prisma.avatar.update({
      where: { id: avatarBody.data.id },
      data: {
        status: "ready",
        externalVirtualmanId: "vm-flow-1",
        externalSpeakerId: "sp-flow-1",
      },
    })

    const refreshedAvatarRes = await GET_AVATAR(
      authedReq(session.token, `/api/avatars/${avatarBody.data.id}`),
      { params: Promise.resolve({ id: avatarBody.data.id }) }
    )
    expect(refreshedAvatarRes.status).toBe(200)

    const refreshedAvatarBody = await json(refreshedAvatarRes)
    expect(refreshedAvatarBody.data.status).toBe("ready")
    expect(refreshedAvatarBody.data.externalVirtualmanId).toBe("vm-flow-1")
  })

  it("walks the content-first production chain from register to video task", async () => {
    mockGenerateUploadUrl
      .mockResolvedValueOnce({
        uploadUrl: "https://oss.example.com/upload/source-video-2",
        assetUrl: "https://oss.example.com/assets/source-video-2.mp4",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      })
      .mockResolvedValueOnce({
        uploadUrl: "https://oss.example.com/upload/auth-video-2",
        assetUrl: "https://oss.example.com/assets/auth-video-2.mp4",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      })
    mockCloneFastAvatar.mockResolvedValue("ext-avatar-task-2")
    mockGenerateVirtualmanBroadcast.mockResolvedValue({ taskId: "ext-video-task-1", payload: {} })

    const session = await registerUser("Core Flow User")
    await activateSession(session.token, userSequence)

    const profileRes = await UPSERT_IP_PROFILE(
      authedReq(session.token, "/api/ip-profile", {
        method: "PUT",
        body: {
          displayName: "老王说房",
          nickname: "老王",
          industry: "房产",
          primaryOffer: "帮助客户快速识别值得买的房源",
          targetAudience: "正在深圳买改善型住房的家庭",
          ipTraits: "真诚、专业、懂成交",
          toneOfVoice: "像懂行朋友一样讲重点",
          proofPoints: "8年经验，服务300+家庭",
          callToAction: "直接私信我，我给你发避坑清单",
        },
      }),
      undefined as never
    )
    expect(profileRes.status).toBe(200)
    const profileBody = await json(profileRes)
    expect(profileBody.data.isComplete).toBe(true)

    const sourceUpload = await REQUEST_UPLOAD_URL(
      authedReq(session.token, "/api/assets/upload-url", {
        method: "POST",
        body: { fileName: "source-2.mp4", contentType: "video/mp4" },
      }),
      undefined as never
    )
    const sourceUploadBody = await json(sourceUpload)

    const authUpload = await REQUEST_UPLOAD_URL(
      authedReq(session.token, "/api/assets/upload-url", {
        method: "POST",
        body: { fileName: "auth-2.mp4", contentType: "video/mp4" },
      }),
      undefined as never
    )
    const authUploadBody = await json(authUpload)

    const sourceAssetRes = await REGISTER_ASSET(
      authedReq(session.token, "/api/assets", {
        method: "POST",
        body: {
          name: "数字人训练视频",
          assetType: "video",
          url: sourceUploadBody.data.assetUrl,
        },
      }),
      undefined as never
    )
    const sourceAssetBody = await json(sourceAssetRes)

    const authAssetRes = await REGISTER_ASSET(
      authedReq(session.token, "/api/assets", {
        method: "POST",
        body: {
          name: "授权视频",
          assetType: "video",
          url: authUploadBody.data.assetUrl,
        },
      }),
      undefined as never
    )
    const authAssetBody = await json(authAssetRes)

    const authVideoRes = await SAVE_AUTH_VIDEO(
      authedReq(session.token, "/api/auth/auth-video", {
        method: "POST",
        body: { authVideoUrl: authAssetBody.data.url },
      }),
      undefined as never
    )
    expect(authVideoRes.status).toBe(200)

    const avatarRes = await CREATE_AVATAR(
      authedReq(session.token, "/api/avatars", {
        method: "POST",
        body: {
          name: "房产数字人",
          cloneType: "fast",
          videoUrl: sourceAssetBody.data.url,
          authVideoUrl: authAssetBody.data.url,
          authText: "本人授权 明远AIM 使用该视频进行数字人克隆。",
        },
      }),
      undefined as never
    )
    expect(avatarRes.status).toBe(201)
    const avatarBody = await json(avatarRes)

    await prisma.avatar.update({
      where: { id: avatarBody.data.id },
      data: {
        status: "ready",
        externalVirtualmanId: "vm-flow-2",
        externalSpeakerId: "sp-flow-2",
      },
    })

    const generateRes = await GENERATE_SCRIPTS(
      authedReq(session.token, "/api/scripts/generate", {
        method: "POST",
        body: {
          templateId,
          structureId,
          hotTopic: "深圳楼市回暖",
          inputs: {
            city: "深圳",
            topic: "买房",
            highlight: "地铁口和学区",
          },
        },
      }),
      undefined as never
    )
    expect(generateRes.status).toBe(200)
    const generateBody = await json(generateRes)
    expect(generateBody.data.scripts).toHaveLength(3)

    const selectedScriptRes = await PATCH_SCRIPT(
      authedReq(session.token, `/api/scripts/${generateBody.data.scripts[0].id}`, {
        method: "PATCH",
        body: {
          status: "selected",
          content: "这是最终确认的视频文案，会作为真实任务快照入库。",
        },
      }),
      { params: Promise.resolve({ id: generateBody.data.scripts[0].id }) }
    )
    expect(selectedScriptRes.status).toBe(200)
    const selectedScriptBody = await json(selectedScriptRes)

    const taskRes = await CREATE_TASK(
      authedReq(session.token, "/api/tasks", {
        method: "POST",
        body: {
          type: "virtualman_broadcast",
          avatarId: avatarBody.data.id,
          scriptId: selectedScriptBody.data.id,
          styleId: "style-content-first",
        },
      }),
      undefined as never
    )
    expect(taskRes.status).toBe(201)
    const taskBody = await json(taskRes)
    expect(taskBody.data.scriptId).toBe(selectedScriptBody.data.id)
    expect(taskBody.data.scriptContent).toContain("最终确认的视频文案")

    const storedTask = await prisma.videoTask.findUnique({
      where: { id: taskBody.data.id },
    })
    expect(storedTask?.scriptContent).toContain("最终确认的视频文案")

    const taskDetailRes = await GET_TASK(
      authedReq(session.token, `/api/tasks/${taskBody.data.id}`),
      { params: Promise.resolve({ id: taskBody.data.id }) }
    )
    expect(taskDetailRes.status).toBe(200)
    const taskDetailBody = await json(taskDetailRes)
    expect(taskDetailBody.data.externalTaskId).toBe("ext-video-task-1")
  })
})
