import { beforeEach, describe, expect, it } from "vitest"

import {
  loadAimDraft,
  saveAimDraft,
  stripPendingGenerationMessages,
  type AimDraft,
} from "@/lib/aim/draft-storage"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"

// draft-storage 走 window.sessionStorage，测试里用最小桩实现
function stubSessionStorage() {
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  ;(globalThis as Record<string, unknown>).window = { sessionStorage: storage }
  return storage as unknown as Storage
}

const AGENT = "content_producer" as const

function draftWithMessages(messages: AimWorkbenchMessage[]): AimDraft {
  return {
    selectedAgentId: AGENT,
    selectedProjectId: "",
    input: "",
    messages,
  }
}

describe("stripPendingGenerationMessages（草稿不含「生成中」占位）", () => {
  it("过滤带 pendingGeneration 标记的占位消息，保留普通消息", () => {
    const messages: AimWorkbenchMessage[] = [
      { id: "u1", role: "user", content: "写一条法拍房口播" },
      { id: "a1", role: "assistant", content: "正在生成口播文案，会读取当前项目资料并匹配知识库，再生成交付物…", pendingGeneration: true },
      { id: "a0", role: "assistant", content: "上一条已完成的交付" },
    ]
    const stripped = stripPendingGenerationMessages(messages)
    expect(stripped.map((m) => m.id)).toEqual(["u1", "a0"])
  })

  it("旧版草稿没有标记时，按占位文案特征过滤（含进度阶段文案）", () => {
    const messages: AimWorkbenchMessage[] = [
      { id: "u1", role: "user", content: "写一条法拍房口播" },
      { id: "a1", role: "assistant", content: "正在生成口播文案，会读取当前项目资料并匹配知识库，再生成交付物…" },
      { id: "a2", role: "assistant", content: "正在连接模型生成口播文案，请稍候…" },
      { id: "a3", role: "assistant", content: "生成仍在进行，复杂任务可能需要 2–3 分钟；也可点停止后重试。" },
      { id: "a4", role: "assistant", content: "比市场价低两三成的房子，挂了两轮没人举牌。" },
    ]
    const stripped = stripPendingGenerationMessages(messages)
    expect(stripped.map((m) => m.id)).toEqual(["u1", "a4"])
  })

  it("用户消息和真实成稿不受影响", () => {
    const messages: AimWorkbenchMessage[] = [
      { id: "u1", role: "user", content: "正在做的问题：帮我看看这篇" },
      { id: "a1", role: "assistant", content: "正在生成的内容是法拍房主题，这个开头不错。" },
    ]
    expect(stripPendingGenerationMessages(messages)).toEqual(messages)
  })
})

describe("saveAimDraft / loadAimDraft（生成中刷新不留下假生成状态）", () => {
  beforeEach(() => {
    stubSessionStorage()
  })

  it("保存时过滤占位消息，读回的会话不含「生成中」", () => {
    saveAimDraft(draftWithMessages([
      { id: "u1", role: "user", content: "写一条口播" },
      { id: "a1", role: "assistant", content: "正在生成口播文案，将根据本次输入生成交付物…", pendingGeneration: true },
    ]), "quick")

    const loaded = loadAimDraft(AGENT)
    expect(loaded?.messages.map((m) => m.id)).toEqual(["u1"])
  })

  it("全部是占位消息时等同于空草稿（清除存储）", () => {
    saveAimDraft(draftWithMessages([
      { id: "a1", role: "assistant", content: "正在生成口播文案，将根据本次输入生成交付物…", pendingGeneration: true },
    ]), "quick")

    expect(loadAimDraft(AGENT)).toBeNull()
  })

  it("读回旧版脏草稿（无标记但内容是占位文案）同样被清理", () => {
    const legacy = {
      selectedAgentId: AGENT,
      selectedProjectId: "",
      input: "",
      messages: [
        { id: "u1", role: "user", content: "写一条口播" },
        { id: "a1", role: "assistant", content: "正在读取项目资料并匹配知识库…" },
      ],
    }
    const key = `aim-workbench-draft-v3:${AGENT}:quick`
    ;(globalThis as { window: { sessionStorage: Storage } }).window.sessionStorage
      .setItem(key, JSON.stringify(legacy))

    const loaded = loadAimDraft(AGENT)
    expect(loaded?.messages.map((m) => m.id)).toEqual(["u1"])
  })
})
