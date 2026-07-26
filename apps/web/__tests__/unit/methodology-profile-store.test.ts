import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  env: { AIM_NAMED_METHODOLOGY_ENABLED: "true" } as { AIM_NAMED_METHODOLOGY_ENABLED?: string },
  profileFindUnique: vi.fn(),
  profileFindMany: vi.fn(),
  profileUpdate: vi.fn(),
  versionFindFirst: vi.fn(),
  versionFindUnique: vi.fn(),
  versionCreate: vi.fn(),
  versionUpdate: vi.fn(),
}))

vi.mock("@/env", () => ({ env: mocks.env }))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    methodologyProfile: {
      findUnique: mocks.profileFindUnique,
      findMany: mocks.profileFindMany,
      update: mocks.profileUpdate,
    },
    methodologyProfileVersion: {
      findFirst: mocks.versionFindFirst,
      findUnique: mocks.versionFindUnique,
      create: mocks.versionCreate,
      update: mocks.versionUpdate,
    },
  },
}))

const {
  buildMethodologyProfileBlock,
  getMethodologyProfileVersion,
  MethodologyProfileError,
  resolveMethodologyPolicy,
} = await import("@/lib/methodology-profile-store")

const {
  createMethodologyProfileVersion,
  publishMethodologyProfileVersion,
  updateMethodologyProfileMeta,
} = await import("@/lib/methodology-profile-admin")

const PUBLISHED_AT = new Date("2026-07-26T00:00:00.000Z")

function publishedVersionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ver-1",
    profileId: "prof-1",
    version: 1,
    compiledPrompt: "选题必须先问：这条内容替谁说话？",
    checksum: "abc123def456789",
    createdAt: PUBLISHED_AT,
    publishedAt: PUBLISHED_AT,
    ...overrides,
  }
}

function activeGlobalProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "prof-1",
    userId: null,
    scope: "global",
    status: "active",
    ...overrides,
  }
}

describe("resolveMethodologyPolicy", () => {
  beforeEach(() => {
    mocks.env.AIM_NAMED_METHODOLOGY_ENABLED = "true"
    mocks.profileFindUnique.mockReset()
    mocks.profileFindMany.mockReset()
    mocks.profileUpdate.mockReset()
    mocks.versionFindFirst.mockReset()
    mocks.versionFindUnique.mockReset()
    mocks.versionCreate.mockReset()
    mocks.versionUpdate.mockReset()
    mocks.profileFindMany.mockResolvedValue([])
    mocks.versionFindFirst.mockResolvedValue(null)
  })

  it("开关关闭时整体短路，不查库", async () => {
    mocks.env.AIM_NAMED_METHODOLOGY_ENABLED = "false"

    const policy = await resolveMethodologyPolicy({
      userId: "user-1",
      methodologyProfileIds: ["prof-1"],
      rawInput: "用徐沪生方法论写一条",
    })

    expect(policy.source).toBe("none")
    expect(policy.versionRows).toEqual([])
    expect(mocks.profileFindUnique).not.toHaveBeenCalled()
    expect(mocks.profileFindMany).not.toHaveBeenCalled()
  })

  it("显式 ID 优先于文本命中，不再走文本匹配", async () => {
    mocks.profileFindUnique.mockResolvedValue(activeGlobalProfile())
    mocks.versionFindFirst.mockResolvedValue(publishedVersionRow())

    const policy = await resolveMethodologyPolicy({
      userId: "user-1",
      methodologyProfileIds: ["prof-1"],
      rawInput: "用徐沪生方法论写一条",
    })

    expect(policy.source).toBe("explicit_parameter")
    expect(policy.selections).toEqual([
      { profileId: "prof-1", versionId: "ver-1", version: 1, mode: "primary", reason: "explicit_parameter" },
    ])
    expect(mocks.profileFindMany).not.toHaveBeenCalled()
  })

  it("MVP 只取第一个显式 ID", async () => {
    mocks.profileFindUnique.mockResolvedValue(activeGlobalProfile())
    mocks.versionFindFirst.mockResolvedValue(publishedVersionRow())

    const policy = await resolveMethodologyPolicy({
      methodologyProfileIds: ["prof-1", "prof-2"],
    })

    expect(policy.versionRows).toHaveLength(1)
    expect(mocks.profileFindUnique).toHaveBeenCalledTimes(1)
  })

  it("显式 ID 不存在时抛错，而非静默忽略", async () => {
    mocks.profileFindUnique.mockResolvedValue(null)

    await expect(
      resolveMethodologyPolicy({ methodologyProfileIds: ["missing"] }),
    ).rejects.toThrow(MethodologyProfileError)
  })

  it("拒绝跨用户访问 scope=user 的私有方法论", async () => {
    mocks.profileFindUnique.mockResolvedValue(
      activeGlobalProfile({ scope: "user", userId: "owner-1" }),
    )

    await expect(
      resolveMethodologyPolicy({ userId: "intruder", methodologyProfileIds: ["prof-1"] }),
    ).rejects.toThrow(/无权访问/)
    expect(mocks.versionFindFirst).not.toHaveBeenCalled()
  })

  it("已归档的方法论不可用", async () => {
    mocks.profileFindUnique.mockResolvedValue(activeGlobalProfile({ status: "archived" }))

    await expect(
      resolveMethodologyPolicy({ methodologyProfileIds: ["prof-1"] }),
    ).rejects.toThrow(/已归档/)
  })

  it("显式 ID 命中但没有 published 版本时抛错", async () => {
    mocks.profileFindUnique.mockResolvedValue(activeGlobalProfile())
    mocks.versionFindFirst.mockResolvedValue(null)

    await expect(
      resolveMethodologyPolicy({ methodologyProfileIds: ["prof-1"] }),
    ).rejects.toThrow(/暂无可用的已发布版本/)
  })

  it("只读 published 版本，draft 不参与", async () => {
    mocks.profileFindUnique.mockResolvedValue(activeGlobalProfile())
    mocks.versionFindFirst.mockResolvedValue(publishedVersionRow())

    await resolveMethodologyPolicy({ methodologyProfileIds: ["prof-1"] })

    expect(mocks.versionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { profileId: "prof-1", status: "published" },
        orderBy: { version: "desc" },
      }),
    )
  })

  it("文本精确命中 aliases 时走 explicit_text", async () => {
    mocks.profileFindMany.mockResolvedValue([
      { id: "prof-1", name: "徐沪生内容创作方法论", aliases: ["徐沪生"] },
    ])
    mocks.versionFindFirst.mockResolvedValue(publishedVersionRow())

    const policy = await resolveMethodologyPolicy({
      userId: "user-1",
      rawInput: "用徐沪生的路子写一条口播",
    })

    expect(policy.source).toBe("explicit_text")
    expect(policy.selections[0]?.reason).toBe("explicit_text")
  })

  it("文本没命中任何名称时返回 none", async () => {
    mocks.profileFindMany.mockResolvedValue([
      { id: "prof-1", name: "徐沪生内容创作方法论", aliases: ["徐沪生"] },
    ])

    const policy = await resolveMethodologyPolicy({ userId: "user-1", rawInput: "随便写一条" })

    expect(policy.source).toBe("none")
    expect(mocks.versionFindFirst).not.toHaveBeenCalled()
  })

  it("文本命中但只有 draft 版本时视为未命中，不抛错", async () => {
    mocks.profileFindMany.mockResolvedValue([
      { id: "prof-1", name: "徐沪生内容创作方法论", aliases: ["徐沪生"] },
    ])
    mocks.versionFindFirst.mockResolvedValue(null)

    const policy = await resolveMethodologyPolicy({ userId: "user-1", rawInput: "用徐沪生写一条" })

    expect(policy.source).toBe("none")
  })

  it("文本匹配只看全局方法论和本人私有方法论", async () => {
    await resolveMethodologyPolicy({ userId: "user-1", rawInput: "写一条" })

    expect(mocks.profileFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "active",
          OR: [{ scope: "global" }, { scope: "user", userId: "user-1" }],
        },
      }),
    )
  })
})

describe("getMethodologyProfileVersion", () => {
  beforeEach(() => {
    mocks.env.AIM_NAMED_METHODOLOGY_ENABLED = "true"
    mocks.versionFindUnique.mockReset()
  })

  it("未发布的版本不可直读", async () => {
    mocks.versionFindUnique.mockResolvedValue({
      ...publishedVersionRow(),
      status: "draft",
      profile: { userId: null, scope: "global", status: "active" },
    })

    await expect(getMethodologyProfileVersion("ver-1")).rejects.toThrow(/未发布/)
  })

  it("checksum 缺失时按 compiledPrompt 现算", async () => {
    mocks.versionFindUnique.mockResolvedValue({
      ...publishedVersionRow({ checksum: "" }),
      status: "published",
      profile: { userId: null, scope: "global", status: "active" },
    })

    const row = await getMethodologyProfileVersion("ver-1")

    expect(row.checksum).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("buildMethodologyProfileBlock", () => {
  it("没有命中版本时不产出任何 prompt", () => {
    expect(buildMethodologyProfileBlock({ source: "none", selections: [], versionRows: [] })).toBe("")
  })

  it("装配时带上边界声明与方法论正文", () => {
    const block = buildMethodologyProfileBlock({
      source: "explicit_parameter",
      selections: [],
      versionRows: [
        {
          versionId: "ver-1",
          profileId: "prof-1",
          version: 3,
          compiledPrompt: "选题必须先问：这条内容替谁说话？",
          checksum: "abcdef0123456789",
          updatedAt: PUBLISHED_AT.toISOString(),
        },
      ],
    })

    expect(block).toContain("本次指定方法论（强参考）")
    expect(block).toContain("不要模仿作者的身份、立场与语言口吻")
    expect(block).toContain("均不得覆盖或替换当前项目的真实资料")
    expect(block).toContain("方法论版本：v3")
    expect(block).toContain("选题必须先问：这条内容替谁说话？")
  })
})

describe("指定方法论进入 prompt", () => {
  const block = buildMethodologyProfileBlock({
    source: "explicit_parameter",
    selections: [],
    versionRows: [
      {
        versionId: "ver-1",
        profileId: "prof-1",
        version: 1,
        compiledPrompt: "选题必须先问：这条内容替谁说话？",
        checksum: "abcdef0123456789",
        updatedAt: PUBLISHED_AT.toISOString(),
      },
    ],
  })

  it("系统方法论也存在时，两者都要注入", async () => {
    const { buildContentProducerChatPrompt } = await import("@/lib/aim-agent-prompts")

    const prompt = buildContentProducerChatPrompt({
      knowledgeBlock: "",
      methodologyBlock: "系统方法论：先讲结论再讲过程。",
      ipWikiBlock: "",
      selectedMethodologyBlock: block,
    })

    expect(prompt).toContain("选题必须先问：这条内容替谁说话？")
    expect(prompt).toContain("系统方法论：先讲结论再讲过程。")
  })

  it("没有系统方法论时，指定方法论仍然注入", async () => {
    const { buildContentProducerChatPrompt } = await import("@/lib/aim-agent-prompts")

    const prompt = buildContentProducerChatPrompt({
      knowledgeBlock: "",
      methodologyBlock: "",
      ipWikiBlock: "",
      selectedMethodologyBlock: block,
    })

    expect(prompt).toContain("本次指定方法论（强参考）")
    expect(prompt).toContain("选题必须先问：这条内容替谁说话？")
  })

  it("未选择方法论时 prompt 里不出现该段落", async () => {
    const { buildContentProducerChatPrompt } = await import("@/lib/aim-agent-prompts")

    const prompt = buildContentProducerChatPrompt({
      knowledgeBlock: "",
      methodologyBlock: "",
      ipWikiBlock: "",
      selectedMethodologyBlock: "",
    })

    expect(prompt).not.toContain("本次指定方法论（强参考）")
  })
})

describe("后台版本管理", () => {
  beforeEach(() => {
    mocks.profileFindUnique.mockReset()
    mocks.profileUpdate.mockReset()
    mocks.versionFindFirst.mockReset()
    mocks.versionFindUnique.mockReset()
    mocks.versionCreate.mockReset()
    mocks.versionUpdate.mockReset()
  })

  it("内容未变时拒绝重复发布", async () => {
    mocks.profileFindUnique.mockResolvedValue({ id: "prof-1", status: "active" })
    mocks.versionFindFirst.mockResolvedValue({
      version: 1,
      checksum: "8d502ee6cc1c0dad8d502ee6cc1c0dad8d502ee6cc1c0dad8d502ee6cc1c0dad",
      status: "published",
    })
    // 用固定内容让 checksum 可预测：先算一次
    const { createHash } = await import("node:crypto")
    const prompt = "固定内容"
    const checksum = createHash("sha256").update(prompt, "utf8").digest("hex")
    mocks.versionFindFirst.mockResolvedValue({ version: 1, checksum, status: "published" })

    await expect(
      createMethodologyProfileVersion({ profileId: "prof-1", compiledPrompt: prompt, status: "published" }),
    ).rejects.toThrow(/内容未变化/)
    expect(mocks.versionCreate).not.toHaveBeenCalled()
  })

  it("内容变化时新建 version+1 并标记 published", async () => {
    mocks.profileFindUnique.mockResolvedValue({ id: "prof-1", status: "active" })
    mocks.versionFindFirst.mockResolvedValue({ version: 2, checksum: "old", status: "published" })
    mocks.versionCreate.mockResolvedValue({
      id: "ver-3",
      profileId: "prof-1",
      version: 3,
      status: "published",
      checksum: "new",
      publishedAt: PUBLISHED_AT,
      createdAt: PUBLISHED_AT,
    })

    const created = await createMethodologyProfileVersion({
      profileId: "prof-1",
      compiledPrompt: "新规则：先问替谁说话",
      status: "published",
    })

    expect(created.version).toBe(3)
    expect(mocks.versionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 3, status: "published" }),
      }),
    )
  })

  it("归档方法论不可新建版本", async () => {
    mocks.profileFindUnique.mockResolvedValue({ id: "prof-1", status: "archived" })

    await expect(
      createMethodologyProfileVersion({ profileId: "prof-1", compiledPrompt: "x" }),
    ).rejects.toThrow(/已归档/)
  })

  it("发布草稿只改状态不新建号", async () => {
    mocks.versionFindUnique.mockResolvedValue({
      id: "ver-2",
      profileId: "prof-1",
      version: 2,
      status: "draft",
      checksum: "abc",
      profile: { status: "active" },
    })
    mocks.versionUpdate.mockResolvedValue({
      id: "ver-2",
      profileId: "prof-1",
      version: 2,
      status: "published",
      checksum: "abc",
      publishedAt: PUBLISHED_AT,
    })

    const published = await publishMethodologyProfileVersion("ver-2")
    expect(published.status).toBe("published")
    expect(mocks.versionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ver-2" },
        data: expect.objectContaining({ status: "published" }),
      }),
    )
  })

  it("可把方法论归档", async () => {
    mocks.profileFindUnique.mockResolvedValue({ id: "prof-1" })
    mocks.profileUpdate.mockResolvedValue({
      id: "prof-1",
      name: "徐沪生创作方法论",
      status: "archived",
      updatedAt: PUBLISHED_AT,
    })

    const updated = await updateMethodologyProfileMeta("prof-1", { status: "archived" })
    expect(updated.status).toBe("archived")
  })
})
