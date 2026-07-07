import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// ─── Mock Shanjian before imports ─────────────────────────

const { mockGenerateVirtualmanBroadcast } = vi.hoisted(() => ({
  mockGenerateVirtualmanBroadcast: vi.fn(),
}))

vi.mock("@/lib/shanjian", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shanjian")>()
  return {
    ...actual,
    generateVirtualmanBroadcast: mockGenerateVirtualmanBroadcast,
  }
})

import { POST as GENERATE_SCRIPTS } from "@/app/api/scripts/generate/route"
import { PATCH as PATCH_SCRIPT } from "@/app/api/scripts/[id]/route"
import { POST as CREATE_PRODUCTION_PLAN } from "@/app/api/production-plans/route"
import { POST as CREATE_TASK } from "@/app/api/tasks/route"
import { buildIpProfilePromptSnapshot } from "@/lib/ip-profile"
import {
  cleanDatabase,
  cleanRedis,
  disconnectAll,
  ensureAdminUser,
  ensureAvatar,
  ensureIpProfile,
  ensurePackagingTemplate,
  ensureTemplate,
  ensureTestUser,
  ensureVideoStructure,
  json,
  prisma,
  req,
  signUserAuthToken,
} from "./helpers"

let user: { id: string; email: string }
let token: string
let templateId: string
let structureAId: string
let structureBId: string
let packagingTemplateId: string
let readyAvatar: {
  id: string
  name: string
  externalVirtualmanId: string
  externalSpeakerId: string
}

const profileInput = {
  displayName: "小李说车",
  nickname: "小李",
  industry: "汽车",
  primaryOffer: "帮助消费者选到性价比最高的车型",
  targetAudience: "预算15-30万准备买车的年轻家庭",
  ipTraits: "懂技术、敢说真话、不收车企广告费",
  toneOfVoice: "专业但不枯燥，像朋友聊天",
  proofPoints: "5年汽车评测经验，试驾200+车型",
  callToAction: "关注我，选车不踩坑",
}

function userReq(url: string, opts: { method?: string; body?: unknown } = {}) {
  return req(url, { ...opts, headers: { Authorization: `Bearer ${token}` } })
}

async function ensureWorkbenchFixtures() {
  const ensuredUser = await ensureTestUser({
    id: user?.id,
    email: "workbench@e2e.com",
    password: "hashed",
    name: "Workbench Tester",
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

  const admin = await ensureAdminUser({ email: "workbench-admin@e2e.com" })
  const template = await ensureTemplate(admin.id, {
    name: "workbench-tpl",
    displayName: "工作台测试模板",
    status: "published",
    publishedAt: new Date(),
    scriptTemplate:
      "想在{{city}}买{{carType}}？今天我从{{angle}}出发帮你全面分析。",
    variables: [
      { key: "city", label: "城市", placeholder: "如：北京", required: true, type: "text" },
      { key: "carType", label: "车型", placeholder: "如：SUV", required: true, type: "text" },
      { key: "angle", label: "角度", placeholder: "如：性价比", required: true, type: "text" },
    ],
  })
  templateId = template.id

  const structureA = await ensureVideoStructure({
    name: "wb-hook-evidence",
    displayName: "钩子-论据",
    blueprint: {
      openingPattern: "pain_point_hook",
      narrativeBeats: ["hook", "evidence_1", "evidence_2", "cta"],
      evidenceSlots: 2,
      ctaSlot: "end",
      durationRange: { min: 30, max: 60 },
    },
  })
  structureAId = structureA.id

  const structureB = await ensureVideoStructure({
    name: "wb-story-arc",
    displayName: "故事弧线",
    blueprint: {
      openingPattern: "story_hook",
      narrativeBeats: ["setup", "conflict", "resolution", "cta"],
      evidenceSlots: 1,
      ctaSlot: "end",
      durationRange: { min: 45, max: 90 },
    },
  })
  structureBId = structureB.id

  const packaging = await ensurePackagingTemplate({
    shanjianId: "wb-style-001",
    name: "工作台口播模板",
  })
  packagingTemplateId = packaging.id

  const avatar = await ensureAvatar({
    userId: user.id,
    name: "Workbench Avatar",
    status: "ready",
    externalVirtualmanId: "vm-wb-1",
    externalSpeakerId: "sp-wb-1",
  })
  readyAvatar = {
    id: avatar.id,
    name: avatar.name,
    externalVirtualmanId: avatar.externalVirtualmanId!,
    externalSpeakerId: avatar.externalSpeakerId!,
  }
}

describe("Create Workbench E2E", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()

    delete process.env.OPENAI_API_KEY
    await ensureWorkbenchFixtures()
  })

  afterAll(async () => {
    await cleanDatabase()
    await disconnectAll()
  })

  beforeEach(async () => {
    await ensureWorkbenchFixtures()
    await prisma.videoTask.deleteMany({ where: { userId: user.id } })
    await prisma.videoProductionPlan.deleteMany({ where: { userId: user.id } })
    mockGenerateVirtualmanBroadcast.mockReset()
  })

  // ─── Different structureIds produce different generation runs ──

  describe("Script generation with different structures", () => {
    it("generates scripts with structureA and structureB — each run tagged to its own structure", async () => {
      const inputs = { city: "北京", carType: "SUV", angle: "性价比" }

      // Generate with structure A
      const resA = await GENERATE_SCRIPTS(
        userReq("/api/scripts/generate", {
          method: "POST",
          body: { templateId, structureId: structureAId, inputs },
        }),
        undefined as never
      )
      expect(resA.status).toBe(200)
      const bodyA = await json(resA)
      expect(bodyA.data.run.structureId).toBe(structureAId)

      // Generate with structure B
      const resB = await GENERATE_SCRIPTS(
        userReq("/api/scripts/generate", {
          method: "POST",
          body: { templateId, structureId: structureBId, inputs },
        }),
        undefined as never
      )
      expect(resB.status).toBe(200)
      const bodyB = await json(resB)
      expect(bodyB.data.run.structureId).toBe(structureBId)

      // Two separate generation runs
      expect(bodyA.data.run.id).not.toBe(bodyB.data.run.id)

      // Scripts from run A belong to structure A
      for (const script of bodyA.data.scripts) {
        expect(script.structureId).toBe(structureAId)
      }
      // Scripts from run B belong to structure B
      for (const script of bodyB.data.scripts) {
        expect(script.structureId).toBe(structureBId)
      }

      // Verify structureSnapshot differs between runs
      const runA = await prisma.contentGenerationRun.findUnique({
        where: { id: bodyA.data.run.id },
      })
      const runB = await prisma.contentGenerationRun.findUnique({
        where: { id: bodyB.data.run.id },
      })
      const snapA = runA!.structureSnapshot as Record<string, unknown>
      const snapB = runB!.structureSnapshot as Record<string, unknown>
      expect(snapA.openingPattern).toBe("pain_point_hook")
      expect(snapB.openingPattern).toBe("story_hook")
    })
  })

  // ─── Script ownership validation on production plan ──

  describe("Production plan script ownership", () => {
    it("rejects production plan when scriptId belongs to another user", async () => {
      // Create a second user with a script
      const otherUser = await prisma.user.create({
        data: {
          email: "other-workbench@e2e.com",
          password: "hashed",
          name: "Other User",
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      })
      const otherScript = await prisma.script.create({
        data: {
          userId: otherUser.id,
          content: "This script belongs to another user.",
          status: "selected",
        },
      })

      // Try to create a production plan with the other user's script
      const res = await CREATE_PRODUCTION_PLAN(
        userReq("/api/production-plans", {
          method: "POST",
          body: {
            scriptId: otherScript.id,
            packagingTemplateId,
            structureId: structureAId,
          },
        }),
        undefined as never
      )
      expect(res.status).toBe(404)
      const body = await json(res)
      expect(body.error).toContain("Script not found")
    })

    it("rejects production plan without scriptId", async () => {
      const res = await CREATE_PRODUCTION_PLAN(
        userReq("/api/production-plans", {
          method: "POST",
          body: {
            packagingTemplateId,
            structureId: structureAId,
          },
        }),
        undefined as never
      )
      expect(res.status).toBe(400)
      const body = await json(res)
      expect(body.error).toContain("scriptId")
    })

    it("rejects production plan with non-existent packagingTemplateId", async () => {
      // Create a script first
      const script = await prisma.script.create({
        data: {
          userId: user.id,
          content: "Valid script content.",
          status: "selected",
        },
      })

      const res = await CREATE_PRODUCTION_PLAN(
        userReq("/api/production-plans", {
          method: "POST",
          body: {
            scriptId: script.id,
            packagingTemplateId: "nonexistent-pkg-template",
            structureId: structureAId,
          },
        }),
        undefined as never
      )
      expect(res.status).toBe(404)
      const body = await json(res)
      expect(body.error).toContain("Packaging template not found")
    })
  })

  // ─── Full lineage through production plan to task ──

  describe("Video task lineage through production plan", () => {
    it("creates a video task with productionPlanId and verifies full lineage chain", async () => {
      mockGenerateVirtualmanBroadcast.mockResolvedValue("ext-wb-task-1")

      // Generate scripts
      const genRes = await GENERATE_SCRIPTS(
        userReq("/api/scripts/generate", {
          method: "POST",
          body: {
            templateId,
            structureId: structureAId,
            inputs: { city: "北京", carType: "SUV", angle: "性价比" },
          },
        }),
        undefined as never
      )
      const genBody = await json(genRes)
      const scriptId = genBody.data.scripts[0].id

      // Select script
      await PATCH_SCRIPT(
        userReq(`/api/scripts/${scriptId}`, {
          method: "PATCH",
          body: { status: "selected" },
        }),
        { params: Promise.resolve({ id: scriptId }) }
      )

      // Create plan
      const planRes = await CREATE_PRODUCTION_PLAN(
        userReq("/api/production-plans", {
          method: "POST",
          body: {
            scriptId,
            packagingTemplateId,
            structureId: structureAId,
          },
        }),
        undefined as never
      )
      expect(planRes.status).toBe(201)
      const planBody = await json(planRes)

      // Create task from plan
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

      // Full lineage verification
      const task = await prisma.videoTask.findUnique({
        where: { id: taskBody.data.id },
      })
      expect(task).not.toBeNull()

      // Direct references
      expect(task!.productionPlanId).toBe(planBody.data.id)
      expect(task!.structureId).toBe(structureAId)
      expect(task!.packagingTemplateId).toBe(packagingTemplateId)
      expect(task!.scriptId).toBe(scriptId)

      // Trace back: script → generationRun → structureId should match
      const script = await prisma.script.findUnique({
        where: { id: scriptId },
      })
      expect(script!.structureId).toBe(structureAId)

      if (script!.generationRunId) {
        const run = await prisma.contentGenerationRun.findUnique({
          where: { id: script!.generationRunId },
        })
        expect(run!.structureId).toBe(structureAId)
      }
    })

    it("rejects task creation with an already-used production plan", async () => {
      mockGenerateVirtualmanBroadcast.mockResolvedValue("ext-wb-task-reuse")

      // Generate and select a script
      const genRes = await GENERATE_SCRIPTS(
        userReq("/api/scripts/generate", {
          method: "POST",
          body: {
            templateId,
            structureId: structureAId,
            inputs: { city: "上海", carType: "轿车", angle: "安全性" },
          },
        }),
        undefined as never
      )
      const genBody = await json(genRes)
      const scriptId = genBody.data.scripts[0].id

      await PATCH_SCRIPT(
        userReq(`/api/scripts/${scriptId}`, {
          method: "PATCH",
          body: { status: "selected" },
        }),
        { params: Promise.resolve({ id: scriptId }) }
      )

      // Create plan
      const planRes = await CREATE_PRODUCTION_PLAN(
        userReq("/api/production-plans", {
          method: "POST",
          body: {
            scriptId,
            packagingTemplateId,
            structureId: structureAId,
          },
        }),
        undefined as never
      )
      const planBody = await json(planRes)

      // First task: should succeed
      const taskRes1 = await CREATE_TASK(
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
      expect(taskRes1.status).toBe(201)

      // Second task with same plan: should fail (plan is now "used")
      const taskRes2 = await CREATE_TASK(
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
      expect(taskRes2.status).toBe(422)
      const taskBody2 = await json(taskRes2)
      expect(taskBody2.error).toContain("already been used")
    })

    it("rejects task creation with another user's production plan", async () => {
      const otherUser = await prisma.user.create({
        data: {
          email: "other-plan-user@e2e.com",
          password: "hashed",
          name: "Other Plan User",
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      })

      const otherScript = await prisma.script.create({
        data: {
          userId: otherUser.id,
          content: "Other user script",
          status: "selected",
        },
      })

      const otherPlan = await prisma.videoProductionPlan.create({
        data: {
          userId: otherUser.id,
          scriptId: otherScript.id,
          styleId: "some-style",
          status: "draft",
        },
      })

      const res = await CREATE_TASK(
        userReq("/api/tasks", {
          method: "POST",
          body: {
            type: "virtualman_broadcast",
            avatarId: readyAvatar.id,
            productionPlanId: otherPlan.id,
          },
        }),
        undefined as never
      )
      expect(res.status).toBe(404)
      const body = await json(res)
      expect(body.error).toContain("not found")
    })
  })
})
