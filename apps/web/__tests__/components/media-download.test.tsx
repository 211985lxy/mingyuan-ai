import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { buildVideoFileName, downloadMedia } from "@/lib/media-download"

const toastInfo = vi.fn()
const toastError = vi.fn()
vi.mock("sonner", () => ({
  toast: {
    info: (...args: unknown[]) => toastInfo(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))

beforeEach(() => {
  toastInfo.mockReset()
  toastError.mockReset()
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:mock"),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("downloadMedia", () => {
  it("CORS 允许时走 fetch → blob 并触发本地下载", async () => {
    // 用真实 a 元素，只拦截 click：mock createElement 会因 appendChild 需要真实节点而失真
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["x"], { type: "video/mp4" }),
    }))

    const result = await downloadMedia("https://oss.example.com/v.mp4", "片名.mp4")

    expect(result).toBe("downloaded")
    expect(clickSpy).toHaveBeenCalledTimes(1)
    clickSpy.mockRestore()
  })

  it("HTTP 非 2xx（如签名过期 403）降级为新标签打开并明确告知", async () => {
    const open = vi.fn(() => ({}))
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }))
    vi.stubGlobal("window", { open, setTimeout })

    const result = await downloadMedia("https://oss.example.com/expired.mp4", "片名.mp4")

    expect(result).toBe("opened")
    expect(open).toHaveBeenCalled()
    // 关键：不能静默失败，必须告诉用户去哪里另存
    expect(toastInfo).toHaveBeenCalledWith(expect.stringContaining("另存"))
  })

  it("fetch 抛错（CORS 拦截）同样降级，不抛给调用方", async () => {
    const open = vi.fn(() => ({}))
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
    vi.stubGlobal("window", { open, setTimeout })

    await expect(downloadMedia("https://oss.example.com/v.mp4", "片名.mp4")).resolves.toBe("opened")
    expect(open).toHaveBeenCalled()
  })

  it("降级打开也被拦截时给出可行动的错误提示", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
    vi.stubGlobal("window", { open: vi.fn(() => null), setTimeout })

    const result = await downloadMedia("https://oss.example.com/v.mp4", "片名.mp4")

    expect(result).toBe("failed")
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining("下载失败"))
  })
})

describe("buildVideoFileName", () => {
  it("用形象名与日期命名，便于用户识别", () => {
    expect(buildVideoFileName("李老师", "2026-09-15T10:00:00Z")).toBe("李老师-2026-09-15.mp4")
  })

  it("无形象名时用兜底文案", () => {
    expect(buildVideoFileName(null, "2026-09-15T10:00:00Z")).toBe("数字人成片-2026-09-15.mp4")
  })

  it("剔除文件名非法字符", () => {
    expect(buildVideoFileName("a/b:c*d", "2026-09-15T10:00:00Z")).toBe("abcd-2026-09-15.mp4")
  })
})
