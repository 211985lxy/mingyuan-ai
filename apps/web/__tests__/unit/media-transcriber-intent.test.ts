import { describe, expect, it } from "vitest"
import { isMediaTranscriptionIntent } from "@/lib/media-transcriber/intent"

describe("isMediaTranscriptionIntent", () => {
  it.each([
    "小D，整理一下这个视频",
    "帮我转录这个内容",
    "把它整理成可读文稿",
    "请提纯这段访谈",
  ])("accepts explicit media-transcription wording: %s", (text) => {
    expect(isMediaTranscriptionIntent(text)).toBe(true)
  })

  it.each([
    "https://v.douyin.com/demo/",
    "收选题 https://v.douyin.com/demo/",
    "分析一下这个视频",
  ])("does not steal existing routes: %s", (text) => {
    expect(isMediaTranscriptionIntent(text)).toBe(false)
  })
})
