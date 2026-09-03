import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => {
  const TEST_TOKEN = "afu-bridge-test-token-abc123"
  const TEST_USER_ID = "afu-bridge-system-user-test"
  return {
    TEST_TOKEN,
    TEST_USER_ID,
    env: {
      AFU_BRIDGE_TOKEN: TEST_TOKEN as string | undefined,
      AFU_BRIDGE_SYSTEM_USER_ID: TEST_USER_ID as string | undefined,
      NODE_ENV: "test" as const,
      DATABASE_URL: "mariadb://build:build@127.0.0.1:3306/mock" as string | undefined,
      ADMIN_JWT_SECRET: "test-unit-admin-jwt-secret-at-least-32-bytes" as string | undefined,
      JWT_SECRET: "test-unit-user-jwt-secret-at-least-32-bytes" as string | undefined,
      CRON_SECRET: "test-unit-cron-secret-at-least-32-bytes" as string | undefined,
    },
    findFirst: vi.fn(),
    create: vi.fn(),
  }
})

vi.mock("@/env", () => ({ env: mocks.env }))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspiration: {
      findFirst: (...args: unknown[]) => mocks.findFirst(...args),
      create: (...args: unknown[]) => mocks.create(...args),
    },
  },
}))

import { POST } from "@/app/api/internal/afu-bridge/cards/route"

const { TEST_TOKEN, TEST_USER_ID } = mocks

type BodyPayload = {
  title: string
  frontmatterSubset?: {
    audience?: string
    pain?: string
    core_claim?: string
    platforms?: string[]
  }
  sourceUrl?: string
  dedupeKey: string
}

function makeRequest(payload: BodyPayload, opts?: { token?: string; ip?: string }) {
  const token = opts?.token ?? TEST_TOKEN
  const headers = new Headers({
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  })
  const req = new NextRequest("http://localhost/api/internal/afu-bridge/cards", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  })
  // 模拟 Next.js server runtime 注入的 ip 属性（不信任代理头，只读直连 IP）
  const ip = opts?.ip ?? "127.0.0.1"
  if (ip) {
    Object.assign(req, { ip })
  }
  return req
}

describe("POST /api/internal/afu-bridge/cards", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.env.AFU_BRIDGE_TOKEN = TEST_TOKEN
    mocks.env.AFU_BRIDGE_SYSTEM_USER_ID = TEST_USER_ID
  })

  afterEach(() => {
    mocks.env.AFU_BRIDGE_TOKEN = TEST_TOKEN
    mocks.env.AFU_BRIDGE_SYSTEM_USER_ID = TEST_USER_ID
  })

  it("用例1: Token 正确 + 首次新卡 → 201 写入 Inspiration", async () => {
    mocks.findFirst.mockResolvedValue(null)
    mocks.create.mockResolvedValue({ id: "insp_afu_001" })

    const body: BodyPayload = {
      title: "三条AI自动化营销动作，中小企业立即用",
      frontmatterSubset: {
        audience: "中小企业主 / 市场运营",
        pain: "人手不足、投放成本高",
        core_claim: "用AI流水线代替5个岗位",
        platforms: ["抖音", "视频号"],
      },
      sourceUrl: "https://afu.local/cards/1001",
      dedupeKey: "afu-card-unique-1",
    }

    const res = await POST(makeRequest(body))
    expect(res.status).toBe(201)
    const json = (await res.json()) as { ok: boolean; created?: boolean; id?: string }
    expect(json.ok).toBe(true)
    expect(json.created).toBe(true)
    expect(typeof json.id).toBe("string")
    expect(json.id?.length).toBeGreaterThan(0)

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { dedupeKey: "afu-card-unique-1", userId: TEST_USER_ID },
      select: { id: true },
    })
    expect(mocks.create).toHaveBeenCalledTimes(1)
    const createArg = (mocks.create.mock.calls[0] as [{ data: Record<string, unknown>; select: { id: true } }])[0].data
    expect(createArg.userId).toBe(TEST_USER_ID)
    expect(createArg.source).toBe("afu_bridge")
    expect(createArg.aiStatus).toBe("pending")
    expect(createArg.projectId).toBeNull()
    expect(createArg.dedupeKey).toBe("afu-card-unique-1")
    expect(createArg.sourceUrl).toBe("https://afu.local/cards/1001")
    const content = createArg.content as string
    expect(content.startsWith("三条AI自动化营销动作，中小企业立即用\n\n")).toBe(true)
    expect(content).toContain("受众：中小企业主 / 市场运营")
    expect(content).toContain("发布平台：抖音、视频号")
  })

  it("用例2: 相同 dedupeKey 再次 POST → 200 skipped=true，Inspiration 总数未增加", async () => {
    const body: BodyPayload = {
      title: "重复卡片",
      dedupeKey: "afu-card-duplicate-2",
      sourceUrl: "https://afu.local/cards/1002",
    }

    mocks.findFirst.mockResolvedValueOnce(null)
    mocks.create.mockResolvedValueOnce({ id: "insp_afu_002" })
    const r1 = await POST(makeRequest(body))
    expect(r1.status).toBe(201)
    const j1 = (await r1.json()) as { id?: string }
    expect(j1.id).toBeTruthy()

    const createCallsAfterFirst = mocks.create.mock.calls.length
    expect(createCallsAfterFirst).toBe(1)

    mocks.findFirst.mockResolvedValueOnce({ id: "insp_afu_002" })
    const r2 = await POST(makeRequest(body))
    expect(r2.status).toBe(200)
    const j2 = (await r2.json()) as { ok: boolean; skipped?: boolean; reason?: string }
    expect(j2.ok).toBe(true)
    expect(j2.skipped).toBe(true)
    expect(j2.reason).toBe("duplicate_dedupe_key")

    expect(mocks.create.mock.calls.length).toBe(createCallsAfterFirst)
  })

  it("用例3: Token 错误（Bearer wrong） → 401 unauthorized，未写任何数据", async () => {
    const body: BodyPayload = {
      title: "不应该被写入的卡片",
      dedupeKey: "afu-card-unauth-3",
    }

    const res = await POST(makeRequest(body, { token: "wrong" }))
    expect(res.status).toBe(401)
    const json = (await res.json()) as { ok: boolean; error: string }
    expect(json.ok).toBe(false)
    expect(json.error).toBe("unauthorized")

    expect(mocks.findFirst).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("可选: AFU_BRIDGE_TOKEN 未配置 → 503 bridge_not_configured", async () => {
    mocks.env.AFU_BRIDGE_TOKEN = undefined

    const body: BodyPayload = { title: "x", dedupeKey: "d" }
    const res = await POST(makeRequest(body))
    expect(res.status).toBe(503)
    const json = (await res.json()) as { ok: boolean; error: string }
    expect(json.ok).toBe(false)
    expect(json.error).toBe("bridge_not_configured")
    expect(mocks.findFirst).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("外部 IP → 403 invalid_source_ip，不写库", async () => {
    const body: BodyPayload = { title: "x", dedupeKey: "d-ext" }
    const res = await POST(makeRequest(body, { ip: "203.0.113.42" }))
    expect(res.status).toBe(403)
    const json = (await res.json()) as { ok: boolean; error: string }
    expect(json.ok).toBe(false)
    expect(json.error).toBe("invalid_source_ip")
    expect(mocks.findFirst).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("IP 不可识别（无 ip 属性）→ 403 unidentified_source_ip", async () => {
    const body: BodyPayload = { title: "x", dedupeKey: "d-noip" }
    // 构造一个没有 ip 属性的请求（模拟非 Next.js server runtime 环境）
    const headers = new Headers({
      "content-type": "application/json",
      authorization: `Bearer ${TEST_TOKEN}`,
    })
    const req = new NextRequest("http://localhost/api/internal/afu-bridge/cards", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    const json = (await res.json()) as { ok: boolean; error: string }
    expect(json.ok).toBe(false)
    expect(json.error).toBe("unidentified_source_ip")
    expect(mocks.findFirst).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it("伪造 x-forwarded-for 头不能绕过 IP 门禁", async () => {
    const body: BodyPayload = { title: "x", dedupeKey: "d-spoof" }
    const headers = new Headers({
      "content-type": "application/json",
      authorization: `Bearer ${TEST_TOKEN}`,
      "x-forwarded-for": "127.0.0.1",
    })
    // 请求没有 ip 属性（只有伪造的代理头），应被拒绝
    const req = new NextRequest("http://localhost/api/internal/afu-bridge/cards", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    expect((await res.json() as { error: string }).error).toBe("unidentified_source_ip")
  })
})
