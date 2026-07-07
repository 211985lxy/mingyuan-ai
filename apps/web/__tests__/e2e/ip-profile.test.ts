import { afterAll, beforeAll, describe, expect, it } from "vitest"
import jwt from "jsonwebtoken"
import { GET, PUT } from "@/app/api/ip-profile/route"
import { cleanDatabase, cleanRedis, disconnectAll, json, prisma, req } from "./helpers"

let user: { id: string; email: string }
let token: string
let profileId: string | null = null

function userReq(url: string, opts: { method?: string; body?: unknown } = {}) {
  return req(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}` },
  })
}

describe("IP Profile E2E", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()

    const createdUser = await prisma.user.create({
      data: {
        email: "ip-profile@e2e.com",
        password: "hashed",
        name: "IP Owner",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })

    user = { id: createdUser.id, email: createdUser.email }
    token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" }
    )
  })

  afterAll(async () => {
    await cleanDatabase()
    await disconnectAll()
  })

  it("rejects unauthorized read", async () => {
    const res = await GET(req("/api/ip-profile"), undefined as never)
    expect(res.status).toBe(401)
  })

  it("returns incomplete state before first profile is created", async () => {
    const res = await GET(userReq("/api/ip-profile"), undefined as never)
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.profile).toBeNull()
    expect(body.data.isComplete).toBe(false)
    expect(body.data.missingFields).toContain("displayName")
    expect(body.data.promptSnapshot).toBeNull()
  })

  it("creates an incomplete profile and returns missing fields", async () => {
    const res = await PUT(
      userReq("/api/ip-profile", {
        method: "PUT",
        body: {
          displayName: "老王说房",
          industry: "房产",
          primaryOffer: "帮客户找到高性价比房源",
        },
      }),
      undefined as never
    )

    expect(res.status).toBe(200)
    const body = await json(res)

    profileId = body.data.profile.id
    expect(body.data.isComplete).toBe(false)
    expect(body.data.missingFields).toContain("targetAudience")
    expect(body.data.promptSnapshot).toContain("老王说房")
    expect(body.data.promptSnapshot).toContain("房产")

    const stored = await prisma.ipProfile.findUnique({
      where: { userId: user.id },
    })
    expect(stored?.id).toBe(profileId)
    expect(stored?.isComplete).toBe(false)
  })

  it("updates the same profile to complete state", async () => {
    const res = await PUT(
      userReq("/api/ip-profile", {
        method: "PUT",
        body: {
          displayName: "老王说房",
          nickname: "老王",
          industry: "房产",
          primaryOffer: "帮客户快速锁定适合自住和投资的房源",
          targetAudience: "第一次在深圳买房的小家庭",
          ipTraits: "真诚、直接、懂市场行情",
          toneOfVoice: "专业但不端着",
          proofPoints: "8年房产从业经验，服务过300+置业客户",
          callToAction: "直接私信我，给你一对一匹配房源",
        },
      }),
      undefined as never
    )

    expect(res.status).toBe(200)
    const body = await json(res)

    expect(body.data.profile.id).toBe(profileId)
    expect(body.data.isComplete).toBe(true)
    expect(body.data.missingFields).toEqual([])
    expect(body.data.promptSnapshot).toContain("第一次在深圳买房的小家庭")

    const stored = await prisma.ipProfile.findUnique({
      where: { userId: user.id },
    })
    expect(stored?.isComplete).toBe(true)

    const count = await prisma.ipProfile.count({
      where: { userId: user.id },
    })
    expect(count).toBe(1)
  })
})
