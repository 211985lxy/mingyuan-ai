import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"
import { Prisma } from "@/generated/prisma/client"

// ─── Mock Shanjian + script-generator before imports ─────

const {
  mockGenerateVirtualmanBroadcast,
  mockGenerateRawVideo,
  mockGenerateScriptCandidates,
} =
  vi.hoisted(() => ({
    mockGenerateVirtualmanBroadcast: vi.fn(),
    mockGenerateRawVideo: vi.fn(),
    mockGenerateScriptCandidates: vi.fn(),
  }))

vi.mock("@/lib/shanjian", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shanjian")>()
  return {
    ...actual,
    generateVirtualmanBroadcast: mockGenerateVirtualmanBroadcast,
    generateRawVideo: mockGenerateRawVideo,
  }
})

vi.mock("@/lib/script-generator", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/script-generator")>()
  return {
    ...actual,
    generateScriptCandidates: mockGenerateScriptCandidates,
  }
})

vi.mock("@/lib/pexels", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pexels")>()
  return {
    ...actual,
    searchVideos: vi.fn().mockResolvedValue({
      total_results: 3,
      videos: [
        {
          id: 991101,
          width: 1920,
          height: 1080,
          url: "https://www.pexels.com/video/991101/",
          duration: 8,
          image: "https://images.example.com/991101.jpg",
          user: { name: "Pexels Creator", url: "https://example.com", id: 123 },
          video_files: [
            { id: 991101, quality: "hd", file_type: "video/mp4", width: 1920, height: 1080, fps: 30, link: "https://videos.example.com/991101.mp4" }
          ],
          video_pictures: []
        },
        {
          id: 991102,
          width: 1920,
          height: 1080,
          url: "https://www.pexels.com/video/991102/",
          duration: 8,
          image: "https://images.example.com/991102.jpg",
          user: { name: "Pexels Creator", url: "https://example.com", id: 123 },
          video_files: [
            { id: 991102, quality: "hd", file_type: "video/mp4", width: 1920, height: 1080, fps: 30, link: "https://videos.example.com/991102.mp4" }
          ],
          video_pictures: []
        },
        {
          id: 991103,
          width: 1920,
          height: 1080,
          url: "https://www.pexels.com/video/991103/",
          duration: 8,
          image: "https://images.example.com/991103.jpg",
          user: { name: "Pexels Creator", url: "https://example.com", id: 123 },
          video_files: [
            { id: 991103, quality: "hd", file_type: "video/mp4", width: 1920, height: 1080, fps: 30, link: "https://videos.example.com/991103.mp4" }
          ],
          video_pictures: []
        }
      ]
    }),
    searchPhotos: vi.fn().mockResolvedValue({
      total_results: 0,
      photos: []
    })
  }
})

import {
  prisma,
  cleanDatabase,
  disconnectAll,
  cleanRedis,
  req,
  json,
  ensureAdminUser,
  ensureAvatar,
  ensureIpProfile,
  ensurePackagingTemplate,
  ensureTemplate,
  ensureTestUser,
  ensureVideoStructure,
  signUserAuthToken,
} from "./helpers"
import { buildIpProfilePromptSnapshot } from "@/lib/ip-profile"
import { computeQueryHash } from "@/lib/pexels"
import { GET as GET_STRUCTURES } from "@/app/api/structures/route"
import { GET as GET_PACKAGING_TEMPLATES } from "@/app/api/packaging-templates/route"
import { POST as POST_PACKAGING_SUGGESTIONS } from "@/app/api/packaging-material-suggestions/route"
import { POST as GENERATE_SCRIPTS } from "@/app/api/scripts/generate/route"
import { POST as CREATE_PLAN } from "@/app/api/production-plans/route"
import { POST as CREATE_TASK } from "@/app/api/tasks/route"

// ─── Shared state ────────────────────────────────────────

let user: { id: string; email: string }
let token: string
let templateId: string
let structureId: string
let packagingTemplateId: string
let packagingTemplateShanjianId: string
let readyAvatar: {
  id: string
  name: string
  externalVirtualmanId: string
  externalSpeakerId: string
}

const profileInput = {
  displayName: "老王说房",
  nickname: "老王",
  industry: "房产",
  primaryOffer: "帮助客户快速识别值得买的房源",
  targetAudience: "正在深圳买改善型住房的家庭",
  ipTraits: "真诚、专业、懂成交",
  toneOfVoice: "像懂行朋友一样讲重点",
  proofPoints: "8年经验，服务300+家庭",
  callToAction: "直接私信我，我给你发避坑清单",
}

function userReq(
  url: string,
  opts: { method?: string; body?: unknown } = {}
) {
  return req(url, { ...opts, headers: { Authorization: `Bearer ${token}` } })
}

async function ensureThreeLayerFixtures() {
  const ensuredUser = await ensureTestUser({
    id: user?.id,
    email: "three-layer@e2e.com",
    password: "hashed",
    name: "Three Layer Tester",
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  })
  user = { id: ensuredUser.id, email: ensuredUser.email }
  token = signUserAuthToken(user)

  await ensureIpProfile(user.id, {
    ...profileInput,
    isComplete: true,
    isActive: true,
    promptSnapshot: buildIpProfilePromptSnapshot(profileInput),
  })

  const admin = await ensureAdminUser({ email: "three-layer-admin@e2e.com" })
  const template = await ensureTemplate(admin.id, {
    name: "three-layer-hook",
    displayName: "三层测试模板",
    status: "published",
    publishedAt: new Date(),
    scriptTemplate:
      "在{{city}}买{{propertyType}}，最怕踩坑。今天我直接告诉你，为什么{{highlight}}会决定这套房值不值得下手。",
    variables: [
      { key: "city", label: "城市", placeholder: "如：深圳", required: true, type: "text" },
      { key: "propertyType", label: "房型", placeholder: "如：改善型三房", required: true, type: "text" },
      { key: "highlight", label: "关键亮点", placeholder: "如：地铁口+学区", required: true, type: "text" },
    ],
  })
  templateId = template.id

  const primaryStructure = await ensureVideoStructure({
    name: "hook-evidence-cta-e2e",
    displayName: "钩子-论据-转化",
    status: "published",
  })
  structureId = primaryStructure.id

  await ensureVideoStructure({
    name: "problem-solution-e2e",
    displayName: "问题-方案",
    status: "published",
  })

  await ensureVideoStructure({
    name: "storytelling-e2e",
    displayName: "故事型",
    status: "published",
  })

  await ensureVideoStructure({
    name: "experimental-draft-e2e",
    displayName: "实验型",
    status: "draft",
  })

  const packaging = await ensurePackagingTemplate({
    shanjianId: "test-shanjian-style-001",
    name: "测试口播模板",
    status: "published",
  })
  packagingTemplateId = packaging.id
  packagingTemplateShanjianId = packaging.shanjianId

  const avatar = await ensureAvatar({
    userId: user.id,
    name: "三层测试数字人",
    status: "ready",
    externalVirtualmanId: "vm-three-layer-1",
    externalSpeakerId: "sp-three-layer-1",
  })
  readyAvatar = {
    id: avatar.id,
    name: avatar.name,
    externalVirtualmanId: avatar.externalVirtualmanId!,
    externalSpeakerId: avatar.externalSpeakerId!,
  }
}

describe("Three-Layer Video Creation Flow E2E", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()

    // Remove OPENAI_API_KEY to force mock LLM path
    delete process.env.OPENAI_API_KEY
    process.env.PEXELS_API_KEY_1 = "mock-key"
    await ensureThreeLayerFixtures()
  })

  afterAll(async () => {
    await cleanDatabase()
    await disconnectAll()
  })

  beforeEach(async () => {
    await ensureThreeLayerFixtures()
    await prisma.videoTask.deleteMany({ where: { userId: user.id } })
    await prisma.videoProductionPlan.deleteMany({ where: { userId: user.id } })
    mockGenerateVirtualmanBroadcast.mockReset()
    mockGenerateRawVideo.mockReset()
    mockGenerateScriptCandidates.mockReset()
  })

  // ─── 1. GET /api/structures returns published structures ──

  describe("GET /api/structures", () => {
    it("returns the canonical published structure library for create", async () => {
      const res = await GET_STRUCTURES(
        userReq("/api/structures"),
        undefined as never
      )
      expect(res.status).toBe(200)

      const body = await json(res)
      expect(body.data).toBeInstanceOf(Array)
      expect(body.data.length).toBe(10)

      const names = body.data.map((s: { name: string }) => s.name)
      expect(names).toContain("contrast-hook")
      expect(names).toContain("proof-first")
      expect(names).toContain("visual-gimmick")
      expect(names).not.toContain("hook-evidence-cta-e2e")
      expect(names).not.toContain("experimental-draft-e2e")

      // Verify structure shape
      const first = body.data[0]
      expect(first).toHaveProperty("id")
      expect(first).toHaveProperty("name")
      expect(first).toHaveProperty("displayName")
      expect(first).toHaveProperty("blueprint")
      expect(first.status).toBe("published")
    })

    it("rejects unauthenticated requests", async () => {
      const res = await GET_STRUCTURES(
        req("/api/structures"),
        undefined as never
      )
      expect(res.status).toBe(401)
    })
  })

  describe("GET /api/packaging-templates recommendations", () => {
    it("ranks virtualman templates by structure-aware recommendation score", async () => {
      await prisma.videoStructure.update({
        where: { id: structureId },
        data: {
          blueprint: {
            openingPattern: "proof_first",
            narrativeBeats: ["proof", "detail", "cta"],
            evidenceSlots: 3,
            ctaSlot: "action",
            durationRange: { min: 25, max: 60 },
            packagingIntent: {
              subtitleStyle: "highlight",
              visualPriority: "balanced",
              preferredTemplateCapabilities: ["subtitle", "heavy_subtitle", "evidence_insert"],
              recommendedMaterialRoles: ["product_detail", "process"],
              bgmGuidance: "保持稳定推进",
              defaultPackRules: {
                subtitleSwitch: true,
                keywordSwitch: true,
                materialSwitch: true,
              },
              defaultProcessRules: {
                materialMatchWay: "preciseMatch",
              },
            },
          } as Prisma.InputJsonValue,
        },
      })

      const recommendedTemplate = await ensurePackagingTemplate({
        shanjianId: "test-shanjian-style-rec",
        name: "强字幕证据模板",
        capabilities: ["subtitle", "heavy_subtitle", "evidence_insert"] as Prisma.InputJsonValue,
        sortOrder: 1,
      })
      const weakTemplate = await ensurePackagingTemplate({
        shanjianId: "test-shanjian-style-weak",
        name: "轻口播模板",
        capabilities: ["identity_card"] as Prisma.InputJsonValue,
        sortOrder: 2,
      })

      const script = await prisma.script.create({
        data: {
          userId: user.id,
          content: "这是一条强调证据展示和字幕承载的长文案。".repeat(18),
          structureId,
          status: "selected",
        },
      })

      const res = await GET_PACKAGING_TEMPLATES(
        userReq(`/api/packaging-templates?scene=virtualman&structureId=${structureId}&scriptId=${script.id}`),
        undefined as never,
      )

      expect(res.status).toBe(200)
      const body = await json(res)
      expect(body.data[0].id).toBe(recommendedTemplate.id)
      expect(body.data[0].recommendation.tier).toBe("recommended")
      expect(body.data[0].recommendation.reasons.length).toBeGreaterThan(0)

      const weak = body.data.find((item: { id: string }) => item.id === weakTemplate.id)
      expect(weak?.recommendation?.tier).toBe("weak_fit")
    })
  })

  describe("POST /api/packaging-material-suggestions", () => {
    it("returns safe Pexels-backed support materials using structure-driven preferred roles", async () => {
      await prisma.videoStructure.update({
        where: { id: structureId },
        data: {
          blueprint: {
            openingPattern: "proof_first",
            narrativeBeats: ["proof", "detail", "cta"],
            evidenceSlots: 3,
            ctaSlot: "action",
            durationRange: { min: 25, max: 60 },
            packagingIntent: {
              subtitleStyle: "standard",
              visualPriority: "visual_first",
              preferredTemplateCapabilities: ["evidence_insert"],
              recommendedMaterialRoles: ["process"],
              bgmGuidance: "保持中性",
            },
          } as Prisma.InputJsonValue,
        },
      })

      const script = await prisma.script.create({
        data: {
          userId: user.id,
          content: "这条脚本更需要过程型画面来支撑说服力。",
          structureId,
          status: "selected",
        },
      })

      const processQuery = `${profileInput.primaryOffer} workflow process for ${profileInput.targetAudience}`
      const queryHash = computeQueryHash({
        query: processQuery,
        mediaType: "video",
        orientation: "landscape",
        size: "large",
        locale: "en-US",
        page: 1,
        perPage: 6,
      })

      const pexelsIds = [991101, 991102, 991103]
      for (const pexelsId of pexelsIds) {
        await prisma.pexelsMedia.upsert({
          where: { provider_pexelsId: { provider: "pexels", pexelsId } },
          update: {
            mediaType: "video",
            width: 1920,
            height: 1080,
            url: `https://www.pexels.com/video/${pexelsId}/`,
            photographer: "Pexels Creator",
            photographerUrl: null,
            photographerId: null,
            duration: 8,
            imageUrl: `https://images.example.com/${pexelsId}.jpg`,
            videoFilesJson: [
              {
                id: pexelsId,
                quality: "hd",
                file_type: "video/mp4",
                width: 1920,
                height: 1080,
                fps: 30,
                link: `https://videos.example.com/${pexelsId}.mp4`,
              },
            ] as Prisma.InputJsonValue,
            videoPicturesJson: [] as Prisma.InputJsonValue,
            ossStatus: "pending",
          },
          create: {
            provider: "pexels",
            pexelsId,
            mediaType: "video",
            width: 1920,
            height: 1080,
            url: `https://www.pexels.com/video/${pexelsId}/`,
            photographer: "Pexels Creator",
            photographerUrl: null,
            photographerId: null,
            duration: 8,
            imageUrl: `https://images.example.com/${pexelsId}.jpg`,
            videoFilesJson: [
              {
                id: pexelsId,
                quality: "hd",
                file_type: "video/mp4",
                width: 1920,
                height: 1080,
                fps: 30,
                link: `https://videos.example.com/${pexelsId}.mp4`,
              },
            ] as Prisma.InputJsonValue,
            videoPicturesJson: [] as Prisma.InputJsonValue,
            ossStatus: "pending",
          },
        })
      }

      await prisma.pexelsQueryCache.upsert({
        where: { queryHash },
        update: {
          query: processQuery,
          mediaType: "video",
          orientation: "landscape",
          size: "large",
          totalResults: 3,
          pexelsIds: pexelsIds as unknown as Prisma.InputJsonValue,
        },
        create: {
          queryHash,
          query: processQuery,
          mediaType: "video",
          orientation: "landscape",
          size: "large",
          color: null,
          totalResults: 3,
          pexelsIds: pexelsIds as unknown as Prisma.InputJsonValue,
        },
      })

      const res = await POST_PACKAGING_SUGGESTIONS(
        userReq("/api/packaging-material-suggestions", {
          method: "POST",
          body: {
            scriptId: script.id,
            structureId,
            packagingTemplateId,
            existingItems: [
              {
                role: "product_detail",
                type: "image",
                fileUrl: "https://oss.example.com/manual/product.jpg",
                source: "manual_library",
                assetId: "manual-product",
              },
              {
                role: "store_environment",
                type: "image",
                fileUrl: "https://oss.example.com/manual/store.jpg",
                source: "manual_library",
                assetId: "manual-store",
              },
            ],
            maxCount: 3,
          },
        }),
        undefined as never,
      )

      expect(res.status).toBe(200)
      const body = await json(res)
      expect(body.data.suggestions).toHaveLength(3)
      expect(body.data.suggestions.every((item: { role: string }) => item.role === "process")).toBe(true)
      expect(body.data.suggestions.every((item: { type: string }) => item.type === "video")).toBe(true)
      expect(body.data.suggestions.every((item: { source: string }) => item.source === "ai_pexels")).toBe(true)
    })
  })

  // ─── 2. POST /api/scripts/generate with structureId ───────

  describe("POST /api/scripts/generate with structureId", () => {
    it("succeeds and returns scripts with structureId and qualityScore", async () => {
      mockGenerateScriptCandidates.mockResolvedValue({
        candidates: [
          "在深圳买改善型三房，最怕踩坑。很多人不知道，地铁口+学区才是决定一套房值不值得下手的关键。第一，交通便利保值；第二，学区自住和转手都有保障。现在就私信我，给你发避坑清单！",
        ],
        scores: [
          {
            overall: 78,
            structuralCompliance: 85,
            viewpointClarity: 75,
            evidenceStrength: 70,
            ctaClarity: 80,
            voiceFit: 76,
            lengthInRange: true,
          },
        ],
        promptText: "Generate a script about...",
        model: "test-model",
        isDegraded: false,
      })

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
      expect(res.status).toBe(200)

      const body = await json(res)
      expect(body.data).toBeDefined()
      expect(body.data.run).toBeDefined()
      expect(body.data.scripts).toBeInstanceOf(Array)
      expect(body.data.scripts.length).toBeGreaterThan(0)

      // Run carries structureId and quality info
      expect(body.data.run.structureId).toBe(structureId)
      expect(body.data.run.qualityScore).toBeDefined()

      // Each script carries structureId and qualityScore
      for (const script of body.data.scripts) {
        expect(script.structureId).toBe(structureId)
        expect(script.qualityScore).toBe(78)
        expect(script.status).toBe("candidate")
      }
    })

    it("rejects when structureId is missing", async () => {
      const res = await GENERATE_SCRIPTS(
        userReq("/api/scripts/generate", {
          method: "POST",
          body: {
            templateId,
            inputs: { city: "深圳", propertyType: "改善型三房", highlight: "地铁口+学区" },
          },
        }),
        undefined as never
      )
      expect(res.status).toBe(400)

      const body = await json(res)
      expect(body.error).toContain("structureId")
    })

    it("rejects when structureId is invalid", async () => {
      const res = await GENERATE_SCRIPTS(
        userReq("/api/scripts/generate", {
          method: "POST",
          body: {
            templateId,
            structureId: "nonexistent-structure-id",
            inputs: { city: "深圳", propertyType: "改善型三房", highlight: "地铁口+学区" },
          },
        }),
        undefined as never
      )
      expect(res.status).toBe(400)
      const body = await json(res)
      expect(body.error).toContain("structure")
    })
  })

  // ─── 3. POST /api/production-plans creates a plan ─────────

  describe("POST /api/production-plans", () => {
    let scriptIdForPlan: string

    beforeAll(async () => {
      // Create a script via direct DB insert for plan tests
      const script = await prisma.script.create({
        data: {
          userId: user.id,
          content: "测试脚本内容，用于生产计划测试。",
          structureId,
          status: "selected",
        },
      })
      scriptIdForPlan = script.id
    })

    it("creates a plan linked to script and packaging template", async () => {
      const recommendationContext = {
        structureId,
        scriptId: scriptIdForPlan,
        packagingTemplateId,
        tier: "recommended",
        score: 88,
        reasons: ["强字幕更适合当前结构"],
        recommendedMaterialRoles: ["product_detail", "process"],
        bgmGuidance: "保持推进感",
      }

      const res = await CREATE_PLAN(
        userReq("/api/production-plans", {
          method: "POST",
          body: {
            scriptId: scriptIdForPlan,
            packagingTemplateId,
            structureId,
            recommendationContext,
          },
        }),
        undefined as never
      )
      expect(res.status).toBe(201)

      const body = await json(res)
      expect(body.data).toBeDefined()
      expect(body.data.id).toBeDefined()
      expect(body.data.scriptId).toBe(scriptIdForPlan)
      expect(body.data.packagingTemplateId).toBe(packagingTemplateId)
      expect(body.data.structureId).toBe(structureId)
      // styleId should resolve from packagingTemplate.shanjianId
      expect(body.data.styleId).toBe(packagingTemplateShanjianId)
      expect(body.data.status).toBe("draft")
      expect(body.data.videoType).toBe("virtualman_broadcast")
      expect(body.data.recommendationContext).toEqual(recommendationContext)
    })

    it("rejects missing scriptId", async () => {
      const res = await CREATE_PLAN(
        userReq("/api/production-plans", {
          method: "POST",
          body: {
            packagingTemplateId,
            styleId: packagingTemplateShanjianId,
          },
        }),
        undefined as never
      )
      expect(res.status).toBe(400)
    })

    it("rejects missing styleId and packagingTemplateId", async () => {
      const res = await CREATE_PLAN(
        userReq("/api/production-plans", {
          method: "POST",
          body: {
            scriptId: scriptIdForPlan,
          },
        }),
        undefined as never
      )
      expect(res.status).toBe(400)
    })

    it("resolves styleId from packagingTemplate.shanjianId when not provided", async () => {
      const res = await CREATE_PLAN(
        userReq("/api/production-plans", {
          method: "POST",
          body: {
            scriptId: scriptIdForPlan,
            packagingTemplateId,
            structureId,
            // No explicit styleId
          },
        }),
        undefined as never
      )
      expect(res.status).toBe(201)

      const body = await json(res)
      expect(body.data.styleId).toBe(packagingTemplateShanjianId)
    })

    it("resolves plan defaults from content template when packaging is not explicitly selected", async () => {
      await prisma.contentTemplate.update({
        where: { id: templateId },
        data: {
          shanjianStyleId: packagingTemplateShanjianId,
          videoType: "virtualman_broadcast",
          packRulesJson: {
            subtitleSwitch: true,
            headerSwitch: true,
          },
          processRulesJson: {
            watermarkShow: false,
          },
        },
      })

      const res = await CREATE_PLAN(
        userReq("/api/production-plans", {
          method: "POST",
          body: {
            scriptId: scriptIdForPlan,
            contentTemplateId: templateId,
          },
        }),
        undefined as never
      )

      expect(res.status).toBe(201)
      const body = await json(res)
      expect(body.data.packagingTemplateId).toBe(packagingTemplateId)
      expect(body.data.styleId).toBe(packagingTemplateShanjianId)
      expect(body.data.packRules).toEqual({
        subtitleSwitch: true,
        headerSwitch: true,
      })
      expect(body.data.processRules).toEqual({
        watermarkShow: false,
      })
      expect(body.data.videoType).toBe("virtualman_broadcast")
    })

    it("preserves non-default videoType from content template defaults", async () => {
      await prisma.contentTemplate.update({
        where: { id: templateId },
        data: {
          shanjianStyleId: packagingTemplateShanjianId,
          videoType: "virtualman_video",
        },
      })

      const res = await CREATE_PLAN(
        userReq("/api/production-plans", {
          method: "POST",
          body: {
            scriptId: scriptIdForPlan,
            contentTemplateId: templateId,
          },
        }),
        undefined as never
      )

      expect(res.status).toBe(201)
      const body = await json(res)
      expect(body.data.videoType).toBe("virtualman_video")
    })

    it("merges explicit pack/process rules over content template defaults", async () => {
      await prisma.contentTemplate.update({
        where: { id: templateId },
        data: {
          shanjianStyleId: packagingTemplateShanjianId,
          packRulesJson: {
            subtitleSwitch: true,
            backgroundMusic: {
              audioSwitch: true,
              volume: 30,
            },
          },
          processRulesJson: {
            watermarkShow: false,
            metadata: {
              brand: "TemplateBrand",
            },
          },
        },
      })

      const res = await CREATE_PLAN(
        userReq("/api/production-plans", {
          method: "POST",
          body: {
            scriptId: scriptIdForPlan,
            contentTemplateId: templateId,
            packRules: {
              backgroundMusic: {
                volume: 80,
              },
            },
            processRules: {
              metadata: {
                campaign: "spring-launch",
              },
            },
          },
        }),
        undefined as never
      )

      expect(res.status).toBe(201)
      const body = await json(res)
      expect(body.data.packRules).toEqual({
        subtitleSwitch: true,
        backgroundMusic: {
          audioSwitch: true,
          volume: 80,
        },
      })
      expect(body.data.processRules).toEqual({
        watermarkShow: false,
        metadata: {
          brand: "TemplateBrand",
          campaign: "spring-launch",
        },
      })
    })

    it("canonicalizes managed manual assets and preserves asset lineage", async () => {
      const imageAsset = await prisma.asset.create({
        data: {
          userId: user.id,
          name: "门店实拍图",
          assetType: "image",
          url: "https://oss.example.com/assets/store-environment.jpg",
          status: "ready",
        },
      })
      const musicAsset = await prisma.asset.create({
        data: {
          userId: user.id,
          name: "门店氛围 BGM",
          assetType: "music",
          url: "https://oss.example.com/assets/store-bgm.mp3",
          status: "ready",
        },
      })

      const res = await CREATE_PLAN(
        userReq("/api/production-plans", {
          method: "POST",
          body: {
            scriptId: scriptIdForPlan,
            packagingTemplateId,
            structureId,
            materials: [
              {
                role: "store_environment",
                type: "image",
                fileUrl: "https://temp.example.com/wrong.jpg",
                source: "manual_library",
                assetId: imageAsset.id,
              },
            ],
            backgroundMusic: {
              audioUrl: "https://temp.example.com/wrong.mp3",
              volume: 60,
              source: "manual_library",
              assetId: musicAsset.id,
            },
          },
        }),
        undefined as never
      )

      expect(res.status).toBe(201)
      const body = await json(res)
      expect(body.data.materials).toEqual([
        expect.objectContaining({
          role: "store_environment",
          type: "image",
          source: "manual_library",
          assetId: imageAsset.id,
          fileUrl: imageAsset.url,
        }),
      ])
      expect(body.data.backgroundMusic).toEqual(
        expect.objectContaining({
          assetId: musicAsset.id,
          source: "manual_library",
          audioUrl: musicAsset.url,
          volume: 60,
        }),
      )
    })

    it("rejects AI materials that have not completed durable transfer", async () => {
      const res = await CREATE_PLAN(
        userReq("/api/production-plans", {
          method: "POST",
          body: {
            scriptId: scriptIdForPlan,
            packagingTemplateId,
            structureId,
            materials: [
              {
                role: "product_detail",
                type: "image",
                fileUrl: "https://pexels.example.com/preview.jpg",
                source: "ai_pexels",
                pexelsId: 991001,
                ossStatus: "pending",
              },
            ],
          },
        }),
        undefined as never
      )

      expect(res.status).toBe(422)
      const body = await json(res)
      expect(body.code).toBe("PACKAGING_AI_NOT_READY")
      expect(body.field).toBe("materials")
    })
  })

  // ─── 4. POST /api/tasks with productionPlanId ─────────────

  describe("POST /api/tasks with productionPlanId", () => {
    it("creates a task with lineage (structureId, packagingTemplateId, snapshots)", async () => {
      mockGenerateVirtualmanBroadcast.mockResolvedValue({ taskId: "ext-plan-task-1", payload: {} })

      // Create a script and plan for this test
      const script = await prisma.script.create({
        data: {
          userId: user.id,
          content: "这是一段测试脚本内容，用于三层视频创建流程。",
          structureId,
          status: "selected",
        },
      })

      const planRes = await CREATE_PLAN(
        userReq("/api/production-plans", {
          method: "POST",
          body: {
            scriptId: script.id,
            packagingTemplateId,
            structureId,
            recommendationContext: {
              structureId,
              scriptId: script.id,
              packagingTemplateId,
              tier: "recommended",
              score: 82,
              reasons: ["模板能力更贴合当前脚本的字幕承载"],
              recommendedMaterialRoles: ["product_detail", "process"],
              bgmGuidance: "保持稳定推进",
            },
          },
        }),
        undefined as never
      )
      const planBody = await json(planRes)
      const planId = planBody.data.id

      // Create the task with the production plan
      const taskRes = await CREATE_TASK(
        userReq("/api/tasks", {
          method: "POST",
          body: {
            type: "virtualman_broadcast",
            avatarId: readyAvatar.id,
            productionPlanId: planId,
          },
        }),
        undefined as never
      )
      expect(taskRes.status).toBe(201)

      const taskBody = await json(taskRes)
      const task = taskBody.data

      // Verify lineage IDs
      expect(task.productionPlanId).toBe(planId)
      expect(task.structureId).toBe(structureId)
      expect(task.packagingTemplateId).toBe(packagingTemplateId)

      // Verify structureSnapshot
      expect(task.structureSnapshot).not.toBeNull()
      expect(task.structureSnapshot.id).toBe(structureId)
      expect(task.structureSnapshot.displayName).toBe("钩子-论据-转化")
      expect(task.structureSnapshot.blueprint).toBeDefined()

      // Verify packagingSnapshot
      expect(task.packagingSnapshot).not.toBeNull()
      expect(task.packagingSnapshot.id).toBe(packagingTemplateId)
      expect(task.packagingSnapshot.shanjianId).toBe(packagingTemplateShanjianId)
      expect(task.packagingSnapshot.name).toBe("测试口播模板")
      expect(task.packagingSnapshot.scene).toBe("virtualman")
      expect(task.packagingSnapshot.capabilities).toBeDefined()
      expect(task.packagingSnapshot.recommendationContext).toMatchObject({
        tier: "recommended",
        recommendedMaterialRoles: ["product_detail", "process"],
      })

      // Verify task status
      expect(task.status).toBe("processing")
      expect(task.videoType).toBe("virtualman_broadcast")

      // Verify the production plan was marked as "used"
      const usedPlan = await prisma.videoProductionPlan.findUnique({
        where: { id: planId },
      })
      expect(usedPlan!.status).toBe("used")

      // Verify Shanjian was called
      expect(mockGenerateVirtualmanBroadcast).toHaveBeenCalled()
    })

    it("rejects already-used production plan", async () => {
      mockGenerateVirtualmanBroadcast.mockResolvedValue({ taskId: "ext-plan-task-reuse", payload: {} })

      // Create and use a plan
      const script = await prisma.script.create({
        data: {
          userId: user.id,
          content: "脚本用于重复使用测试。",
          structureId,
          status: "selected",
        },
      })

      const planRes = await CREATE_PLAN(
        userReq("/api/production-plans", {
          method: "POST",
          body: {
            scriptId: script.id,
            packagingTemplateId,
            structureId,
          },
        }),
        undefined as never
      )
      const planBody = await json(planRes)
      const planId = planBody.data.id

      // Use the plan once
      const firstRes = await CREATE_TASK(
        userReq("/api/tasks", {
          method: "POST",
          body: {
            type: "virtualman_broadcast",
            avatarId: readyAvatar.id,
            productionPlanId: planId,
          },
        }),
        undefined as never
      )
      expect(firstRes.status).toBe(201)

      // Try to reuse the plan
      const secondRes = await CREATE_TASK(
        userReq("/api/tasks", {
          method: "POST",
          body: {
            type: "virtualman_broadcast",
            avatarId: readyAvatar.id,
            productionPlanId: planId,
          },
        }),
        undefined as never
      )
      expect(secondRes.status).toBe(422)

      const body = await json(secondRes)
      expect(body.error).toContain("already been used")
    })

    it("rejects task submission when plan still contains non-durable AI materials", async () => {
      const script = await prisma.script.create({
        data: {
          userId: user.id,
          content: "这是一段待验证 durable 素材阻断的脚本。",
          structureId,
          status: "selected",
        },
      })

      const plan = await prisma.videoProductionPlan.create({
        data: {
          userId: user.id,
          scriptId: script.id,
          packagingTemplateId,
          structureId,
          styleId: packagingTemplateShanjianId,
          videoType: "virtualman_broadcast",
          status: "draft",
          materials: [
            {
              role: "product_detail",
              type: "image",
              fileUrl: "https://pexels.example.com/preview.jpg",
              source: "ai_pexels",
              pexelsId: 991002,
              ossStatus: "transferring",
            },
          ] as unknown as Prisma.InputJsonValue,
        },
      })

      const taskRes = await CREATE_TASK(
        userReq("/api/tasks", {
          method: "POST",
          body: {
            type: "virtualman_broadcast",
            avatarId: readyAvatar.id,
            productionPlanId: plan.id,
          },
        }),
        undefined as never
      )

      expect(taskRes.status).toBe(422)
      const body = await json(taskRes)
      expect(body.code).toBe("PACKAGING_AI_NOT_READY")
      expect(body.field).toBe("materials")
    })

    it("uses plan videoType when template config resolves to virtualman_video", async () => {
      mockGenerateRawVideo.mockResolvedValue({ taskId: "ext-raw-video-task-1", payload: {} })

      await prisma.contentTemplate.update({
        where: { id: templateId },
        data: {
          shanjianStyleId: packagingTemplateShanjianId,
          videoType: "virtualman_video",
        },
      })

      const script = await prisma.script.create({
        data: {
          userId: user.id,
          content: "这是一段用于原生数字人视频的脚本。",
          structureId,
          status: "selected",
          sourceTemplateId: templateId,
        },
      })

      const planRes = await CREATE_PLAN(
        userReq("/api/production-plans", {
          method: "POST",
          body: {
            scriptId: script.id,
            contentTemplateId: templateId,
          },
        }),
        undefined as never
      )

      expect(planRes.status).toBe(201)
      const planBody = await json(planRes)
      expect(planBody.data.videoType).toBe("virtualman_video")

      const taskRes = await CREATE_TASK(
        userReq("/api/tasks", {
          method: "POST",
          body: {
            type: "virtualman_broadcast",
            avatarId: readyAvatar.id,
            productionPlanId: planBody.data.id,
          },
        }),
        undefined as never
      )

      expect(taskRes.status).toBe(201)
      const taskBody = await json(taskRes)
      expect(taskBody.data.videoType).toBe("virtualman_video")
      expect(mockGenerateRawVideo).toHaveBeenCalled()
      expect(mockGenerateVirtualmanBroadcast).not.toHaveBeenCalled()
    })
  })

  // ─── 5. Lineage verification ──────────────────────────────

  describe("Lineage verification", () => {
    it("generation run has structureId and structureSnapshot", async () => {
      mockGenerateScriptCandidates.mockResolvedValue({
        candidates: ["测试脚本内容"],
        scores: [
          {
            overall: 72,
            structuralCompliance: 80,
            viewpointClarity: 70,
            evidenceStrength: 65,
            ctaClarity: 75,
            voiceFit: 70,
            lengthInRange: true,
          },
        ],
        promptText: "lineage test prompt",
        model: "test-model",
        isDegraded: false,
      })

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
      expect(res.status).toBe(200)
      const body = await json(res)

      // Verify structureId on run response
      expect(body.data.run.structureId).toBe(structureId)

      // Verify structureSnapshot is stored in database
      const storedRun = await prisma.contentGenerationRun.findUnique({
        where: { id: body.data.run.id },
      })
      expect(storedRun).not.toBeNull()
      expect(storedRun!.structureId).toBe(structureId)
      expect(storedRun!.structureSnapshot).not.toBeNull()

      // Verify snapshot contains blueprint fields
      const snapshot = storedRun!.structureSnapshot as Record<string, unknown>
      expect(snapshot).toHaveProperty("openingPattern")
      expect(snapshot).toHaveProperty("narrativeBeats")
      expect(snapshot).toHaveProperty("evidenceSlots")
      expect(snapshot).toHaveProperty("ctaSlot")
      expect(snapshot).toHaveProperty("durationRange")
    })

    it("script has structureId from generation", async () => {
      mockGenerateScriptCandidates.mockResolvedValue({
        candidates: ["脚本追溯测试内容"],
        scores: [
          {
            overall: 80,
            structuralCompliance: 85,
            viewpointClarity: 78,
            evidenceStrength: 75,
            ctaClarity: 82,
            voiceFit: 80,
            lengthInRange: true,
          },
        ],
        promptText: "script lineage prompt",
        model: "test-model",
        isDegraded: false,
      })

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
      expect(res.status).toBe(200)
      const body = await json(res)

      // Verify scripts carry structureId in response
      for (const script of body.data.scripts) {
        expect(script.structureId).toBe(structureId)
      }

      // Verify in database: script has structureId and links back to its run
      const storedScripts = await prisma.script.findMany({
        where: { generationRunId: body.data.run.id },
      })
      expect(storedScripts.length).toBeGreaterThan(0)

      for (const script of storedScripts) {
        expect(script.structureId).toBe(structureId)
        expect(script.generationRunId).toBe(body.data.run.id)
      }

      // Verify the run that the script links to also has the same structureId
      const run = await prisma.contentGenerationRun.findUnique({
        where: { id: body.data.run.id },
      })
      expect(run).not.toBeNull()
      expect(run!.structureId).toBe(structureId)
    })

    it("full lineage chain: structure → run → script → plan → task", async () => {
      mockGenerateVirtualmanBroadcast.mockResolvedValue({ taskId: "ext-lineage-full-1", payload: {} })
      mockGenerateScriptCandidates.mockResolvedValue({
        candidates: ["完整链路追溯脚本"],
        scores: [
          {
            overall: 75,
            structuralCompliance: 80,
            viewpointClarity: 72,
            evidenceStrength: 70,
            ctaClarity: 78,
            voiceFit: 75,
            lengthInRange: true,
          },
        ],
        promptText: "full lineage prompt",
        model: "test-model",
        isDegraded: false,
      })

      // Step 1: Generate scripts
      const genRes = await GENERATE_SCRIPTS(
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
      expect(genRes.status).toBe(200)
      const genBody = await json(genRes)
      const scriptId = genBody.data.scripts[0].id
      const runId = genBody.data.run.id

      // Step 2: Create production plan
      const planRes = await CREATE_PLAN(
        userReq("/api/production-plans", {
          method: "POST",
          body: {
            scriptId,
            packagingTemplateId,
            structureId,
          },
        }),
        undefined as never
      )
      expect(planRes.status).toBe(201)
      const planBody = await json(planRes)
      const planId = planBody.data.id

      // Step 3: Create video task
      const taskRes = await CREATE_TASK(
        userReq("/api/tasks", {
          method: "POST",
          body: {
            type: "virtualman_broadcast",
            avatarId: readyAvatar.id,
            productionPlanId: planId,
          },
        }),
        undefined as never
      )
      expect(taskRes.status).toBe(201)
      const taskBody = await json(taskRes)

      // Verify full chain in database
      const task = await prisma.videoTask.findUnique({
        where: { id: taskBody.data.id },
      })
      expect(task).not.toBeNull()
      expect(task!.structureId).toBe(structureId)
      expect(task!.packagingTemplateId).toBe(packagingTemplateId)
      expect(task!.productionPlanId).toBe(planId)
      expect(task!.scriptId).toBe(scriptId)
      expect(task!.structureSnapshot).not.toBeNull()
      expect(task!.packagingSnapshot).not.toBeNull()

      const plan = await prisma.videoProductionPlan.findUnique({
        where: { id: planId },
      })
      expect(plan).not.toBeNull()
      expect(plan!.structureId).toBe(structureId)
      expect(plan!.packagingTemplateId).toBe(packagingTemplateId)
      expect(plan!.scriptId).toBe(scriptId)

      const script = await prisma.script.findUnique({
        where: { id: scriptId },
      })
      expect(script).not.toBeNull()
      expect(script!.structureId).toBe(structureId)
      expect(script!.generationRunId).toBe(runId)

      const run = await prisma.contentGenerationRun.findUnique({
        where: { id: runId },
      })
      expect(run).not.toBeNull()
      expect(run!.structureId).toBe(structureId)
      expect(run!.structureSnapshot).not.toBeNull()
    })
  })
})
