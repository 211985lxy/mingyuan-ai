import { describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api/core"
import { createLiteChatController } from "@/features/lite/lite-chat-controller"

function createStreamMock(impl?: (options: { onDelta: (delta: string, content: string) => void; signal: AbortSignal }) => Promise<{ content: string }>) {
  return vi.fn(async (messages: Array<{ role: string; content: string }>, options: { onDelta: (delta: string, content: string) => void; signal: AbortSignal }) => {
    if (impl) return impl(options)
    void messages
    void options
    return { content: "" }
  })
}

describe("createLiteChatController", () => {
  it("send 追加 user 与 assistant 消息，并按流式回调更新 assistant 内容", async () => {
    const stream = createStreamMock(async ({ onDelta }) => {
      onDelta("你", "你")
      onDelta("好", "你好")
      return { content: "你好" }
    })
    const controller = createLiteChatController({ stream })

    await controller.send("打招呼")

    expect(controller.getMessages()).toEqual([
      { role: "user", content: "打招呼" },
      { role: "assistant", content: "你好" },
    ])
    expect(controller.getBusy()).toBe(false)
    // 请求 payload 携带完整历史
    expect(stream).toHaveBeenCalledWith(
      [{ role: "user", content: "打招呼" }],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it("用户主动停止（499）保留已生成的部分内容，且不触发 onError", async () => {
    const onError = vi.fn()
    const stream = createStreamMock(async ({ onDelta }) => {
      onDelta("已生成", "已生成")
      throw new ApiError("请求已停止", 499, { code: "ABORTED" })
    })
    const controller = createLiteChatController({ stream, onError })

    await controller.send("写文案")

    expect(controller.getMessages()).toEqual([
      { role: "user", content: "写文案" },
      { role: "assistant", content: "已生成" },
    ])
    expect(controller.getBusy()).toBe(false)
    expect(onError).not.toHaveBeenCalled()
  })

  it("服务端错误移除空的 assistant 占位并触发 onError", async () => {
    const onError = vi.fn()
    const stream = createStreamMock(async () => {
      throw new ApiError("服务开小差", 500, null)
    })
    const controller = createLiteChatController({ stream, onError })

    await controller.send("出错的请求")

    expect(controller.getMessages()).toEqual([{ role: "user", content: "出错的请求" }])
    expect(onError).toHaveBeenCalledWith("服务开小差")
    expect(controller.getBusy()).toBe(false)
  })

  it("空文本与 busy 期间的重复发送被忽略", async () => {
    const stream = vi.fn(async () => ({ content: "ok" }))
    const controller = createLiteChatController({ stream })

    await controller.send("   ")
    expect(controller.getMessages()).toEqual([])
    expect(stream).not.toHaveBeenCalled()

    // busy 期间第二条被丢弃（不等第一条 await 完成）
    const first = controller.send("第一条")
    await controller.send("第二条")
    await first

    expect(stream).toHaveBeenCalledTimes(1)
    expect(controller.getMessages().filter((m) => m.role === "user")).toEqual([
      { role: "user", content: "第一条" },
    ])
  })

  it("reset 清空会话", async () => {
    const stream = createStreamMock()
    const controller = createLiteChatController({ stream })

    await controller.send("你好")
    controller.reset()

    expect(controller.getMessages()).toEqual([])
  })
})
