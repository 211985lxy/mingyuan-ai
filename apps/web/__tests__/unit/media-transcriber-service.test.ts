import { beforeEach, describe, expect, it, vi } from "vitest"
import { runMediaTranscriptionTask } from "@/lib/media-transcriber/service"

const INPUT = {
  externalMessageId: "om_media_1",
  externalChatId: "oc_media_1",
  userId: "user_1",
  projectId: "project_1",
  sourceUrl: "https://www.douyin.com/video/7000000000000000000",
  executionMode: "live" as const,
}

function makeDeps() {
  return {
    findTask: vi.fn().mockResolvedValue(null),
    createTask: vi.fn().mockResolvedValue({ id: "task-1" }),
    updateTask: vi.fn().mockResolvedValue(undefined),
    extract: vi.fn().mockResolvedValue({
      status: "completed",
      platform: "douyin",
      title: "门店经营访谈",
      transcript: "王老师说，门店从12家增长到27家。",
    }),
    purify: vi.fn().mockResolvedValue({
      markdown: "## 业务增长\n\n王老师说，门店从12家增长到27家。",
      usedFallback: false,
    }),
    createDoc: vi.fn().mockResolvedValue({
      token: "doc-1",
      url: "https://feishu.cn/docx/doc-1",
      title: "【小D整理】门店经营访谈",
    }),
    fetchDoc: vi.fn().mockResolvedValue({
      token: "doc-1",
      title: "【小D整理】门店经营访谈",
      content: "# 门店经营访谈\n\n正文",
    }),
  }
}

describe("runMediaTranscriptionTask", () => {
  let deps: ReturnType<typeof makeDeps>

  beforeEach(() => {
    deps = makeDeps()
  })

  it("creates and verifies one document for one external message", async () => {
    const result = await runMediaTranscriptionTask(INPUT, deps)

    expect(deps.extract).toHaveBeenCalledTimes(1)
    expect(deps.createDoc).toHaveBeenCalledWith(expect.objectContaining({
      title: "【小D整理】门店经营访谈",
      content: expect.stringContaining("原始链接"),
    }))
    expect(deps.fetchDoc).toHaveBeenCalledWith(expect.objectContaining({ documentId: "doc-1" }))
    expect(result).toEqual(expect.objectContaining({
      status: "completed",
      documentUrl: "https://feishu.cn/docx/doc-1",
    }))
    expect(deps.updateTask).toHaveBeenCalledWith("task-1", expect.objectContaining({ status: "completed" }))
  })

  it("reuses the saved document for a replayed completed message", async () => {
    deps.findTask.mockResolvedValue({
      id: "task-1",
      status: "completed",
      documentToken: "doc-1",
      documentUrl: "https://feishu.cn/docx/doc-1",
      sourceTitle: "门店经营访谈",
      platform: "douyin",
    })

    const result = await runMediaTranscriptionTask(INPUT, deps)

    expect(result.status).toBe("duplicate")
    expect(deps.extract).not.toHaveBeenCalled()
    expect(deps.createDoc).not.toHaveBeenCalled()
  })

  it("does not report completion when document read-back is empty", async () => {
    deps.fetchDoc.mockResolvedValue({ token: "doc-1", title: "", content: "" })

    await expect(runMediaTranscriptionTask(INPUT, deps)).rejects.toMatchObject({ code: "DOC_VERIFY_FAILED" })
    expect(deps.updateTask).toHaveBeenCalledWith("task-1", expect.objectContaining({
      status: "failed",
      errorCode: "DOC_VERIFY_FAILED",
    }))
  })
})
