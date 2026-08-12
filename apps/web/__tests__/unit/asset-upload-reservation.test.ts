import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
  createMock,
  countMock,
  findUniqueMock,
  updateMock,
  aggregateMock,
  findManyMock,
  updateManyMock,
  headMock,
  calculatePostSignatureMock,
  isConfiguredFlag,
} = vi.hoisted(() => ({
  createMock: vi.fn(),
  countMock: vi.fn(),
  findUniqueMock: vi.fn(),
  updateMock: vi.fn(),
  aggregateMock: vi.fn(),
  findManyMock: vi.fn(),
  updateManyMock: vi.fn(),
  headMock: vi.fn(),
  calculatePostSignatureMock: vi.fn(() => ({
    OSSAccessKeyId: "ak",
    Signature: "sig",
    policy: "cG9saWN5",
  })),
  isConfiguredFlag: { value: true },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    assetUploadReservation: {
      create: createMock,
      count: countMock,
      findUnique: findUniqueMock,
      update: updateMock,
      aggregate: aggregateMock,
      findMany: findManyMock,
      updateMany: updateManyMock,
    },
    asset: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: "asset_1",
        ...args.data,
      })),
    },
  },
}))

vi.mock("@/env", () => ({
  env: {
    OSS_REGION: "oss-cn-shanghai",
    OSS_ACCESS_KEY_ID: "ak",
    OSS_ACCESS_KEY_SECRET: "sk",
    OSS_BUCKET: "test-bucket",
  },
}))

vi.mock("ali-oss", () => {
  class MockOSS {
    calculatePostSignature = calculatePostSignatureMock
    head = headMock
    getObjectMeta = headMock
    delete = vi.fn()
  }
  return { default: MockOSS }
})

describe("asset upload reservation policy", () => {
  beforeEach(async () => {
    vi.resetModules()
    createMock.mockReset()
    countMock.mockReset()
    findUniqueMock.mockReset()
    updateMock.mockReset()
    aggregateMock.mockReset()
    findManyMock.mockReset()
    updateManyMock.mockReset()
    headMock.mockReset()
    calculatePostSignatureMock.mockClear()
    isConfiguredFlag.value = true

    countMock.mockResolvedValue(0)
    aggregateMock.mockResolvedValue({ _sum: { declaredSizeBytes: 0 }, _count: 0 })
    createMock.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: args.data.id,
      ...args.data,
    }))

    const { resetUploadQuotaForTests } = await import("@/lib/oss/upload-reservation")
    resetUploadQuotaForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("rejects size over type limit", async () => {
    const { validateUploadGrantInput, UPLOAD_SIZE_LIMITS } = await import(
      "@/lib/oss/upload-reservation"
    )
    expect(() =>
      validateUploadGrantInput({
        fileName: "big.png",
        contentType: "image/png",
        sizeBytes: UPLOAD_SIZE_LIMITS.image + 1,
        assetType: "image",
      }),
    ).toThrow(/8|过大|limit|MiB|字节/i)
  })

  it("rejects disallowed content-type for assetType", async () => {
    const { validateUploadGrantInput } = await import("@/lib/oss/upload-reservation")
    expect(() =>
      validateUploadGrantInput({
        fileName: "x.exe",
        contentType: "application/octet-stream",
        sizeBytes: 100,
        assetType: "image",
      }),
    ).toThrow(/content-type|类型|MIME/i)
  })

  it("builds key under user directory with date and uploadId", async () => {
    const { buildUploadObjectKey } = await import("@/lib/oss/upload-reservation")
    const key = buildUploadObjectKey({
      userId: "user_abc",
      uploadId: "up_123",
      fileName: "shot.PNG",
      now: new Date("2026-08-12T10:00:00Z"),
    })
    expect(key).toBe("uploads/user_abc/2026-08-12/up_123.png")
  })

  it("binds content-length-range to exact declared size and 5-minute expiry", async () => {
    const { buildOssPostPolicyDocument, POLICY_TTL_MS } = await import(
      "@/lib/oss/upload-reservation"
    )
    const expiresAt = new Date("2026-08-12T10:05:00Z")
    const policy = buildOssPostPolicyDocument({
      objectKey: "uploads/user_abc/2026-08-12/up_123.png",
      contentType: "image/png",
      sizeBytes: 12345,
      expiresAt,
    })
    expect(POLICY_TTL_MS).toBe(5 * 60 * 1000)
    expect(policy.expiration).toBe(expiresAt.toISOString())
    expect(policy.conditions).toEqual(
      expect.arrayContaining([
        ["eq", "$key", "uploads/user_abc/2026-08-12/up_123.png"],
        ["eq", "$Content-Type", "image/png"],
        ["content-length-range", 12345, 12345],
      ]),
    )
  })

  it("enforces process-level grants/minute, pending, and daily quotas", async () => {
    const mod = await import("@/lib/oss/upload-reservation")
    const userId = "user_quota"

    for (let i = 0; i < 10; i++) {
      mod.assertUploadRateLimit(userId)
      mod.recordUploadGrant(userId, 1024)
    }
    expect(() => mod.assertUploadRateLimit(userId)).toThrow(/分钟|rate|频繁/i)

    mod.resetUploadQuotaForTests()
    countMock.mockResolvedValueOnce(3)
    await expect(
      mod.assertPendingReservationLimit(userId),
    ).rejects.toThrow(/pending|待完成|预约/i)

    mod.resetUploadQuotaForTests()
    countMock.mockResolvedValue(0)
    aggregateMock.mockResolvedValue({
      _sum: { declaredSizeBytes: 1024 * 1024 * 1024 },
      _count: 50,
    })
    await expect(mod.assertDailyUploadQuota(userId, 1)).rejects.toThrow(/日|配额|GiB|100/i)
  })

  it("createAssetUploadReservation returns POST method + fields", async () => {
    const { createAssetUploadReservation } = await import("@/lib/oss/upload-reservation")
    const result = await createAssetUploadReservation({
      userId: "user_1",
      fileName: "a.jpg",
      contentType: "image/jpeg",
      sizeBytes: 2048,
      assetType: "image",
    })
    expect(result.method).toBe("POST")
    expect(result.uploadId).toBeTruthy()
    expect(result.uploadUrl).toContain("test-bucket")
    expect(result.fields).toMatchObject({
      key: expect.stringContaining("uploads/user_1/"),
      "Content-Type": "image/jpeg",
      success_action_status: "200",
      OSSAccessKeyId: "ak",
      Signature: "sig",
      policy: "cG9saWN5",
    })
    expect(result.maxBytes).toBe(2048)
    expect(createMock).toHaveBeenCalled()
  })

  it("complete verifies ownership, size, content-type via HEAD", async () => {
    const { completeAssetUploadReservation } = await import("@/lib/oss/upload-reservation")
    findUniqueMock.mockResolvedValue({
      id: "up_1",
      userId: "user_1",
      objectKey: "uploads/user_1/2026-08-12/up_1.jpg",
      declaredSizeBytes: 100,
      contentType: "image/jpeg",
      assetType: "image",
      status: "pending",
      assetUrl: "https://test-bucket.oss-cn-shanghai.aliyuncs.com/uploads/user_1/2026-08-12/up_1.jpg",
      expiresAt: new Date(Date.now() + 60_000),
    })
    headMock.mockResolvedValue({
      status: 200,
      res: {
        headers: {
          "content-length": "100",
          "content-type": "image/jpeg",
        },
      },
    })
    updateMock.mockResolvedValue({ id: "up_1", status: "completed" })

    const asset = await completeAssetUploadReservation({
      uploadId: "up_1",
      userId: "user_1",
      name: "photo",
    })
    expect(asset.url).toContain("up_1.jpg")
    expect(headMock).toHaveBeenCalledWith("uploads/user_1/2026-08-12/up_1.jpg")
  })

  it("complete rejects size mismatch", async () => {
    const { completeAssetUploadReservation } = await import("@/lib/oss/upload-reservation")
    findUniqueMock.mockResolvedValue({
      id: "up_1",
      userId: "user_1",
      objectKey: "uploads/user_1/2026-08-12/up_1.jpg",
      declaredSizeBytes: 100,
      contentType: "image/jpeg",
      assetType: "image",
      status: "pending",
      assetUrl: "https://test-bucket.oss-cn-shanghai.aliyuncs.com/uploads/user_1/2026-08-12/up_1.jpg",
      expiresAt: new Date(Date.now() + 60_000),
    })
    headMock.mockResolvedValue({
      status: 200,
      res: { headers: { "content-length": "999", "content-type": "image/jpeg" } },
    })

    await expect(
      completeAssetUploadReservation({ uploadId: "up_1", userId: "user_1", name: "x" }),
    ).rejects.toThrow(/size|大小|字节/i)
  })
})

describe("upload-url route requires sizeBytes", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("returns UPLOAD_CLIENT_REFRESH_REQUIRED when sizeBytes missing", async () => {
    vi.doMock("@/lib/user-auth", () => ({
      withUserAuth: (handler: (req: Request, ctx: { user: { id: string } }) => unknown) => {
        return (req: Request) => handler(req, { user: { id: "u1" } })
      },
    }))
    vi.doMock("@/lib/oss/upload-reservation", () => ({
      createAssetUploadReservation: vi.fn(),
    }))

    const { POST } = await import("@/app/api/assets/upload-url/route")
    const req = new Request("http://localhost/api/assets/upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: "a.jpg",
        contentType: "image/jpeg",
        assetType: "image",
      }),
    })
    const res = await POST(req as never, undefined as never)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("UPLOAD_CLIENT_REFRESH_REQUIRED")
  })
})
