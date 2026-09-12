/**
 * 选题裁决卡回调的加密体处理测试。
 *
 * 背景（2026-09-12）：选题策划官应用配置了 Encrypt Key，飞书把卡片回调
 * （含保存回调地址时的 url_verification 校验）整体加密为 {"encrypt": "..."}。
 * 路由此前只读明文 body，导致控制台保存时报「Challenge code没有返回」。
 *
 * 加密格式（飞书规范，与 @larksuiteoapi/node-sdk 的 AESCipher.decrypt 对应）：
 * AES-256-CBC，key = SHA256(encryptKey)，密文 = base64(iv[16] + ciphertext)。
 */
import { createCipheriv, createHash, randomBytes } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

const BOT_ENCRYPT_KEY = "unit-test-encrypt-key"
const BOT_VERIFY_TOKEN = "unit-test-verify-token"

/** 与飞书一致的加密实现，用于构造测试输入 */
function feishuEncrypt(encryptKey: string, payload: unknown): string {
  const key = createHash("sha256").update(encryptKey).digest()
  const iv = randomBytes(16)
  const cipher = createCipheriv("aes-256-cbc", key, iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()])
  return Buffer.concat([iv, encrypted]).toString("base64")
}

const registry = vi.hoisted(() => ({
  loadAgentBotRegistry: vi.fn(() => [
    {
      botId: "business_diagnosis",
      displayName: "选题策划官",
      appId: "cli_test",
      appSecret: "s",
      verificationToken: BOT_VERIFY_TOKEN,
      encryptKey: BOT_ENCRYPT_KEY,
      workflowId: "wf",
      defaultAgentId: "business_diagnosis",
      allowedAgentIds: ["business_diagnosis"],
    },
  ]),
  resolveBotByVerificationToken: vi.fn((token: string) =>
    token === BOT_VERIFY_TOKEN
      ? {
          botId: "business_diagnosis",
          displayName: "选题策划官",
          appId: "cli_test",
          appSecret: "s",
          verificationToken: BOT_VERIFY_TOKEN,
          encryptKey: BOT_ENCRYPT_KEY,
          workflowId: "wf",
          defaultAgentId: "business_diagnosis",
          allowedAgentIds: ["business_diagnosis"],
        }
      : null,
  ),
}))

vi.mock("@/lib/feishu-agent-registry", () => registry)

const planTopicReviewDecision = vi.hoisted(() => vi.fn())
vi.mock("@/lib/topic-review", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/topic-review")>()
  return {
    ...actual,
    planTopicReviewDecision,
  }
})

vi.mock("@/lib/prisma", () => ({
  prisma: {
    topicSelection: {
      // 按钮动作路径会先查批次（candidates/model），单元测试返回可用的最小记录
      findUnique: vi.fn(async () => ({
        candidates: [{ title: "卡1" }, { title: "卡2" }, { title: "卡3" }],
        model: "deepseek-flash",
      })),
      update: vi.fn(async () => ({})),
    },
  },
}))
vi.mock("@/lib/background-tasks", () => ({ enqueueBackgroundTask: vi.fn() }))

import { POST } from "@/app/api/integrations/feishu/topic-card-actions/route"

function post(body: unknown) {
  return POST(
    new Request("https://mingyuan-ai.cn/api/integrations/feishu/topic-card-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  registry.loadAgentBotRegistry.mockImplementation(() => [
    {
      botId: "business_diagnosis",
      displayName: "选题策划官",
      appId: "cli_test",
      appSecret: "s",
      verificationToken: BOT_VERIFY_TOKEN,
      encryptKey: BOT_ENCRYPT_KEY,
      workflowId: "wf",
      defaultAgentId: "business_diagnosis",
      allowedAgentIds: ["business_diagnosis"],
    },
  ])
})

describe("裁决卡回调加密体处理", () => {
  it("加密的 url_verification 校验：解密后回显 challenge（控制台保存回调地址的关键路径）", async () => {
    const encrypted = feishuEncrypt(BOT_ENCRYPT_KEY, {
      type: "url_verification",
      challenge: "challenge-abc-123",
      token: BOT_VERIFY_TOKEN,
    })

    const res = await post({ encrypt: encrypted })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ challenge: "challenge-abc-123" })
  })

  it("明文的 url_verification 仍然直接回显（未开加密的兼容路径）", async () => {
    const res = await post({ type: "url_verification", challenge: "plain-challenge" })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ challenge: "plain-challenge" })
  })

  it("加密的按钮动作：解密后按 token 鉴权并继续原流程", async () => {
    planTopicReviewDecision.mockReturnValue({
      ok: true,
      atomicOnPendingStatus: true,
      patch: { status: "selected", selectedIndex: 2 },
    })

    const encrypted = feishuEncrypt(BOT_ENCRYPT_KEY, {
      token: BOT_VERIFY_TOKEN,
      open_id: "ou-reviewer-1",
      action: {
        value: { topic_action: "adopt", topic_selection_id: "sel-1", topic_index: 2 },
        tag: "button",
      },
    })

    const res = await post({ encrypt: encrypted })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.toast?.type).toBe("success")
    expect(planTopicReviewDecision).toHaveBeenCalledWith(
      expect.objectContaining({ action: "adopt", rawIndex: 2, reviewedBy: "ou-reviewer-1", reviewedVia: "feishu" }),
    )
  })

  it("任何已注册 bot 的 key 都解不开时，返回明确报错而非 404", async () => {
    const res = await post({ encrypt: feishuEncrypt("wrong-key-entirely", { type: "url_verification", challenge: "x" }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.toast?.type).toBe("error")
    expect(body.toast?.content).toContain("解密失败")
  })
})
