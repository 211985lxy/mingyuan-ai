import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { NextRequest } from "next/server"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"

export { prisma, redis }

const JWT_SECRET = process.env.ADMIN_JWT_SECRET!
const USER_JWT_SECRET = process.env.JWT_SECRET || "user-secret-change-me"

// ─── Database helpers ─────────────────────────────────────

export async function cleanDatabase() {
  // ── 高精度数据级逻辑隔离 ──
  // 为了防止运行测试时将本地开发环境的真实用户、IP 档案和知识库误删，
  // 我们只清理以 "@test.com" 结尾的测试账户以及它们产生的数据资产！

  const testAdminIds = (await prisma.adminUser.findMany({
    where: { email: { endsWith: "@test.com" } },
    select: { id: true },
  })).map((admin) => admin.id)

  // 1. 最先清理最底层的二级子依赖（仅限测试用户的数据，防外键死锁）
  await prisma.script.deleteMany({ where: { user: { email: { endsWith: "@test.com" } } } })
  await prisma.contentGenerationRun.deleteMany({ where: { user: { email: { endsWith: "@test.com" } } } })
  await prisma.topicSelection.deleteMany({ where: { user: { email: { endsWith: "@test.com" } } } })
  await prisma.competitorAnalysis.deleteMany({ where: { user: { email: { endsWith: "@test.com" } } } })
  await prisma.watchAccount.deleteMany({ where: { user: { email: { endsWith: "@test.com" } } } })
  await prisma.videoCopyExtraction.deleteMany({ where: { user: { email: { endsWith: "@test.com" } } } })
  await prisma.knowledgeEntry.deleteMany({ where: { user: { email: { endsWith: "@test.com" } } } })
  await prisma.aimGeneration.deleteMany({ where: { user: { email: { endsWith: "@test.com" } } } })
  await prisma.clientProject.deleteMany({ where: { user: { email: { endsWith: "@test.com" } } } })
  // 2. 清理一级依赖父表 (仅限测试用户的关联记录)
  await prisma.ipProfile.deleteMany({ where: { user: { email: { endsWith: "@test.com" } } } })
  await prisma.asset.deleteMany({ where: { user: { email: { endsWith: "@test.com" } } } })
  
  // 激活码：只清除测试管理员创建或被测试用户使用的激活码
  await prisma.activationCode.deleteMany({
    where: {
      OR: [
        { admin: { email: { endsWith: "@test.com" } } },
        { user: { email: { endsWith: "@test.com" } } }
      ]
    }
  })

  if (testAdminIds.length > 0) {
    await prisma.adminAuditLog.deleteMany({ where: { adminId: { in: testAdminIds } } })
    await prisma.contentTemplate.deleteMany({ where: { createdBy: { in: testAdminIds } } })
  }
  
  // 3. 最后清理一级核心用户中的测试专用账户
  await prisma.user.deleteMany({ where: { email: { endsWith: "@test.com" } } })
  await prisma.adminUser.deleteMany({ where: { email: { endsWith: "@test.com" } } })
}

export async function cleanRedis() {
  const keys = await redis.keys("*")
  if (keys.length > 0) {
    await redis.del(...keys)
  }
}

export async function disconnectAll() {
  await prisma.$disconnect()
  redis.disconnect()
}

// ─── Seed helpers ─────────────────────────────────────────

export async function createAdminUser(overrides: Record<string, unknown> = {}) {
  const password = (overrides.rawPassword as string) ?? "Admin123!"
  const hash = await bcrypt.hash(password, 4)
  return prisma.adminUser.create({
    data: {
      email: (overrides.email as string) ?? "admin@test.com",
      password: hash,
      name: (overrides.name as string) ?? "Test Admin",
      role: (overrides.role as string) ?? "admin",
      isActive: overrides.isActive !== undefined ? (overrides.isActive as boolean) : true,
    },
  })
}

export async function ensureAdminUser(overrides: Record<string, unknown> = {}) {
  const password = (overrides.rawPassword as string) ?? "Admin123!"
  const hash = await bcrypt.hash(password, 4)
  const email = (overrides.email as string) ?? "admin@test.com"
  return prisma.adminUser.upsert({
    where: { email },
    update: {
      password: hash,
      name: (overrides.name as string) ?? "Test Admin",
      role: (overrides.role as string) ?? "admin",
      isActive: overrides.isActive !== undefined ? (overrides.isActive as boolean) : true,
    },
    create: {
      email,
      password: hash,
      name: (overrides.name as string) ?? "Test Admin",
      role: (overrides.role as string) ?? "admin",
      isActive: overrides.isActive !== undefined ? (overrides.isActive as boolean) : true,
    },
  })
}

export async function ensureTestUser(overrides: Record<string, unknown> = {}) {
  const email = (overrides.email as string) ?? "user@test.com"
  const createData = {
    ...(overrides.id ? { id: overrides.id as string } : {}),
    email,
    password: (overrides.password as string) ?? "hashed",
    name: (overrides.name as string) ?? "Test User",
    plan: (overrides.plan as string) ?? "free",
    expiresAt:
      (overrides.expiresAt as Date | null | undefined)
      ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  }

  const existing = await prisma.user.findUnique({
    where: { email },
  })

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        password: createData.password,
        name: createData.name,
        plan: createData.plan,
        expiresAt: createData.expiresAt,
      },
    })
  }

  return prisma.user.create({ data: createData })
}

export async function ensureIpProfile(
  userId: string,
  overrides: Record<string, unknown> = {}
) {
  const data = {
    displayName: (overrides.displayName as string) ?? null,
    nickname: (overrides.nickname as string) ?? null,
    industry: (overrides.industry as string) ?? null,
    primaryOffer: (overrides.primaryOffer as string) ?? null,
    targetAudience: (overrides.targetAudience as string) ?? null,
    ipTraits: (overrides.ipTraits as string) ?? null,
    toneOfVoice: (overrides.toneOfVoice as string) ?? null,
    proofPoints: (overrides.proofPoints as string) ?? null,
    callToAction: (overrides.callToAction as string) ?? null,
    promptSnapshot: (overrides.promptSnapshot as string) ?? null,
    isComplete: overrides.isComplete !== undefined ? (overrides.isComplete as boolean) : false,
    isActive: overrides.isActive !== undefined ? (overrides.isActive as boolean) : true,
  }

  const existing = await prisma.ipProfile.findUnique({
    where: { userId },
  })

  if (existing) {
    return prisma.ipProfile.update({
      where: { userId },
      data,
    })
  }

  return prisma.ipProfile.create({
    data: {
      userId,
      ...data,
    },
  })
}

export async function createEditorUser() {
  return createAdminUser({
    email: "editor@test.com",
    name: "Test Editor",
    role: "editor",
  })
}

export async function createTemplate(
  adminId: string,
  overrides: Record<string, unknown> = {}
) {
  const variables =
    (overrides.variables as Prisma.InputJsonValue | undefined) ??
    ([
      { key: "name", label: "姓名", placeholder: "输入姓名", required: true, type: "text" },
      { key: "city", label: "城市", placeholder: "输入城市", required: false, type: "text" },
    ] as Prisma.InputJsonValue)
  const industry =
    (overrides.industry as Prisma.InputJsonValue | undefined) ??
    ([] as Prisma.InputJsonValue)
  const tags =
    (overrides.tags as Prisma.InputJsonValue | undefined) ??
    (["测试"] as Prisma.InputJsonValue)
  const hotTopicKeywords =
    (overrides.hotTopicKeywords as Prisma.InputJsonValue | undefined) ??
    ([] as Prisma.InputJsonValue)
  const seasonalEvents =
    (overrides.seasonalEvents as Prisma.InputJsonValue | undefined) ??
    ([] as Prisma.InputJsonValue)

  return prisma.contentTemplate.create({
    data: {
      name: (overrides.name as string) ?? "test-tpl",
      displayName: (overrides.displayName as string) ?? "测试模板",
      description: (overrides.description as string) ?? "测试描述",
      scriptTemplate:
        (overrides.scriptTemplate as string) ??
        "你好{{name}}，欢迎来到{{city}}！",
      expressionBlueprint:
        (overrides.expressionBlueprint as Prisma.InputJsonValue | undefined) ?? Prisma.DbNull,
      variables,
      contentType: (overrides.contentType as string) ?? "product_intro",
      status: (overrides.status as string) ?? "draft",
      industry,
      tags,
      hotTopicKeywords,
      seasonalEvents,
      hookType: (overrides.hookType as string) ?? null,
      createdBy: adminId,
      sortOrder: (overrides.sortOrder as number) ?? 0,
      featured: (overrides.featured as boolean) ?? false,
      publishedAt: overrides.publishedAt as Date | undefined,
      archivedAt: overrides.archivedAt as Date | undefined,
    },
  })
}

export async function ensureTemplate(
  adminId: string,
  overrides: Record<string, unknown> = {}
) {
  const variables =
    (overrides.variables as Prisma.InputJsonValue | undefined) ??
    ([
      { key: "name", label: "姓名", placeholder: "输入姓名", required: true, type: "text" },
      { key: "city", label: "城市", placeholder: "输入城市", required: false, type: "text" },
    ] as Prisma.InputJsonValue)
  const industry =
    (overrides.industry as Prisma.InputJsonValue | undefined) ??
    ([] as Prisma.InputJsonValue)
  const tags =
    (overrides.tags as Prisma.InputJsonValue | undefined) ??
    (["测试"] as Prisma.InputJsonValue)
  const hotTopicKeywords =
    (overrides.hotTopicKeywords as Prisma.InputJsonValue | undefined) ??
    ([] as Prisma.InputJsonValue)
  const seasonalEvents =
    (overrides.seasonalEvents as Prisma.InputJsonValue | undefined) ??
    ([] as Prisma.InputJsonValue)
  const name = (overrides.name as string) ?? "test-tpl"
  const data = {
    name,
    displayName: (overrides.displayName as string) ?? "测试模板",
    description: (overrides.description as string) ?? "测试描述",
    scriptTemplate:
      (overrides.scriptTemplate as string) ??
      "你好{{name}}，欢迎来到{{city}}！",
    expressionBlueprint:
      (overrides.expressionBlueprint as Prisma.InputJsonValue | undefined) ?? Prisma.DbNull,
    variables,
    contentType: (overrides.contentType as string) ?? "product_intro",
    status: (overrides.status as string) ?? "draft",
    industry,
    tags,
    hotTopicKeywords,
    seasonalEvents,
    hookType: (overrides.hookType as string) ?? null,
    createdBy: adminId,
    sortOrder: (overrides.sortOrder as number) ?? 0,
    featured: (overrides.featured as boolean) ?? false,
    publishedAt: overrides.publishedAt as Date | undefined,
    archivedAt: overrides.archivedAt as Date | undefined,
  }

  const existing = await prisma.contentTemplate.findFirst({
    where: { name, createdBy: adminId },
    orderBy: { createdAt: "asc" },
  })

  if (existing) {
    return prisma.contentTemplate.update({
      where: { id: existing.id },
      data,
    })
  }

  return prisma.contentTemplate.create({ data })
}

export async function createVideoStructure(
  overrides: Record<string, unknown> = {}
) {
  return prisma.videoStructure.create({
    data: {
      name: (overrides.name as string) ?? "hook-evidence-cta",
      displayName: (overrides.displayName as string) ?? "钩子-论据-转化",
      subtitle: (overrides.subtitle as string) ?? "经典三段式结构",
      description: (overrides.description as string) ?? "适合产品种草、知识科普类短视频",
      useCase: (overrides.useCase as string) ?? "product_intro",
      blueprint: (overrides.blueprint as Prisma.InputJsonValue) ?? {
        openingPattern: "pain_point_hook",
        narrativeBeats: ["hook", "evidence_1", "evidence_2", "cta"],
        evidenceSlots: 2,
        ctaSlot: "end",
        durationRange: { min: 30, max: 60 },
      },
      sortOrder: (overrides.sortOrder as number) ?? 0,
      status: (overrides.status as string) ?? "published",
    },
  })
}

export async function ensureVideoStructure(
  overrides: Record<string, unknown> = {}
) {
  const name = (overrides.name as string) ?? "hook-evidence-cta"
  return prisma.videoStructure.upsert({
    where: { name },
    update: {
      displayName: (overrides.displayName as string) ?? "钩子-论据-转化",
      subtitle: (overrides.subtitle as string) ?? "经典三段式结构",
      description: (overrides.description as string) ?? "适合产品种草、知识科普类短视频",
      useCase: (overrides.useCase as string) ?? "product_intro",
      blueprint: (overrides.blueprint as Prisma.InputJsonValue) ?? {
        openingPattern: "pain_point_hook",
        narrativeBeats: ["hook", "evidence_1", "evidence_2", "cta"],
        evidenceSlots: 2,
        ctaSlot: "end",
        durationRange: { min: 30, max: 60 },
      },
      sortOrder: (overrides.sortOrder as number) ?? 0,
      status: (overrides.status as string) ?? "published",
    },
    create: {
      name,
      displayName: (overrides.displayName as string) ?? "钩子-论据-转化",
      subtitle: (overrides.subtitle as string) ?? "经典三段式结构",
      description: (overrides.description as string) ?? "适合产品种草、知识科普类短视频",
      useCase: (overrides.useCase as string) ?? "product_intro",
      blueprint: (overrides.blueprint as Prisma.InputJsonValue) ?? {
        openingPattern: "pain_point_hook",
        narrativeBeats: ["hook", "evidence_1", "evidence_2", "cta"],
        evidenceSlots: 2,
        ctaSlot: "end",
        durationRange: { min: 30, max: 60 },
      },
      sortOrder: (overrides.sortOrder as number) ?? 0,
      status: (overrides.status as string) ?? "published",
    },
  })
}

// ─── Request helpers ──────────────────────────────────────

export function req(
  url: string,
  options: {
    method?: string
    body?: unknown
    headers?: Record<string, string>
  } = {}
): NextRequest {
  const { method = "GET", body, headers = {} } = options
  const init: ConstructorParameters<typeof NextRequest>[1] = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  }
  if (body) init.body = JSON.stringify(body)
  return new NextRequest(new URL(url, "http://localhost:3000"), init)
}

export function adminToken(admin: { id: string; email: string; role: string }) {
  return jwt.sign(
    { id: admin.id, email: admin.email, role: admin.role, sessionVersion: 0 },
    JWT_SECRET,
    { expiresIn: "1h" }
  )
}

export function signUserAuthToken(user: { id: string; email: string }) {
  return jwt.sign(
    { id: user.id, email: user.email },
    USER_JWT_SECRET,
    { expiresIn: "1h" }
  )
}

export function authReq(
  url: string,
  admin: { id: string; email: string; role: string },
  options: { method?: string; body?: unknown } = {}
) {
  return req(url, {
    ...options,
    headers: { Authorization: `Bearer ${adminToken(admin)}` },
  })
}

export function cronReq(url: string) {
  return req(url, {
    headers: { Authorization: `Bearer test-e2e-cron-secret-at-least-32-bytes` },
  })
}

export async function json(res: Response) {
  return res.json()
}
