import { describe, expect, it } from "vitest"

import {
  AIM_FILE_ATTACHMENTS_TOTAL_MAX_CHARS,
  AIM_FILE_ATTACHMENT_MAX_CHARS,
  appendAimFileAttachmentsToContent,
  collectPasteFiles,
  formatAimFileSize,
  splitPastedFiles,
} from "@/lib/aim/file-attachments"
import { canSubmitWithPasteAttachment } from "@/lib/aim/paste-copy-attachment"
import { AttachmentTextError, extractSniffedText } from "@/lib/aim/attachment-text"
import type { AimFileAttachment } from "@/lib/aim/workbench-types"

function makeFile(name: string, content: string, status: AimFileAttachment["status"] = "ready"): AimFileAttachment {
  return { id: `file-${name}`, name, size: content.length, content, status }
}

describe("splitPastedFiles", () => {
  it("routes images to images and everything else to documents", () => {
    const image = new File([new Blob(["x"])], "a.png", { type: "image/png" })
    const document = new File([new Blob(["hello"])], "data.tst", { type: "" })
    const result = splitPastedFiles([image, document])
    expect(result.images.map((file) => file.name)).toEqual(["a.png"])
    expect(result.documents.map((file) => file.name)).toEqual(["data.tst"])
  })
})

describe("collectPasteFiles", () => {
  it("prefers clipboardData.files when present", () => {
    const file = new File(["x"], "a.tst", { type: "" })
    const result = collectPasteFiles({ files: [file] as unknown as FileList, items: [] as unknown as DataTransferItemList })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("a.tst")
  })

  it("falls back to image items for screenshot pastes (files empty)", () => {
    const png = new File(["bitmap"], "screenshot.png", { type: "image/png" })
    const result = collectPasteFiles({
      files: [] as unknown as FileList,
      items: [
        { kind: "string", type: "text/plain" },
        { kind: "file", type: "image/png", getAsFile: () => png },
      ] as unknown as DataTransferItemList,
    })
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe("image/png")
  })

  it("returns empty when neither files nor image items exist", () => {
    expect(collectPasteFiles(null)).toEqual([])
    expect(collectPasteFiles(undefined)).toEqual([])
  })
})

describe("appendAimFileAttachmentsToContent", () => {
  it("returns content unchanged when no ready files", () => {
    expect(appendAimFileAttachmentsToContent("你好", [])).toBe("你好")
    expect(appendAimFileAttachmentsToContent("你好", [makeFile("a.tst", "x", "uploading")])).toBe("你好")
    expect(appendAimFileAttachmentsToContent("你好", null)).toBe("你好")
  })

  it("wraps file content with a labelled block", () => {
    const output = appendAimFileAttachmentsToContent("帮我看下", [makeFile("data.tst", "第一行\n第二行")])
    expect(output).toContain("帮我看下")
    expect(output).toContain("【附件 data.tst】")
    expect(output).toContain("第一行\n第二行")
  })

  it("truncates a single oversized file and marks it", () => {
    const big = "字".repeat(AIM_FILE_ATTACHMENT_MAX_CHARS + 500)
    const output = appendAimFileAttachmentsToContent("", [makeFile("big.txt", big)])
    expect(output).toContain("已截断")
    expect(output.length).toBeLessThan(big.length)
  })

  it("keeps total budget across multiple files", () => {
    const files = [
      makeFile("a.txt", "a".repeat(AIM_FILE_ATTACHMENT_MAX_CHARS)),
      makeFile("b.txt", "b".repeat(AIM_FILE_ATTACHMENT_MAX_CHARS)),
      makeFile("c.txt", "c".repeat(AIM_FILE_ATTACHMENT_MAX_CHARS)),
    ]
    const output = appendAimFileAttachmentsToContent("", files)
    // 前两个文件占满各自单文件额度后，第三个只分到剩余总额度并标记截断
    expect(output).toContain("【附件 c.txt】")
    expect(output).toContain("已截断")
    expect(output.length).toBeLessThan(AIM_FILE_ATTACHMENTS_TOTAL_MAX_CHARS + 600)
  })

  it("marks files beyond the total budget as not sent", () => {
    const files = [
      makeFile("a.txt", "a".repeat(AIM_FILE_ATTACHMENT_MAX_CHARS)),
      makeFile("b.txt", "b".repeat(AIM_FILE_ATTACHMENT_MAX_CHARS)),
      makeFile("c.txt", "c".repeat(AIM_FILE_ATTACHMENT_MAX_CHARS)),
      makeFile("d.txt", "d".repeat(100)),
    ]
    const output = appendAimFileAttachmentsToContent("", files)
    expect(output).toContain("【附件 d.txt】内容过长，本次未随消息发送")
  })
})

describe("canSubmitWithPasteAttachment with file attachments", () => {
  it("allows submit with files and no text", () => {
    expect(canSubmitWithPasteAttachment({ text: "", attachment: null, hasFiles: true })).toBe(true)
  })

  it("still requires usage selection when a copy attachment exists", () => {
    expect(canSubmitWithPasteAttachment({
      text: "",
      attachment: { content: "文案", usage: undefined } as never,
      hasFiles: true,
    })).toBe(false)
  })
})

describe("extractSniffedText", () => {
  it("reads plain utf-8 text from unknown extensions", () => {
    expect(extractSniffedText(Buffer.from("标题,播放量\nA,100", "utf8"), "data.tst")).toContain("标题")
  })

  it("strips a utf-8 BOM", () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("内容", "utf8")])
    expect(extractSniffedText(withBom, "a.log")).toBe("内容")
  })

  it("decodes utf-16le with BOM", () => {
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("中文内容", "utf16le")])
    expect(extractSniffedText(utf16, "export.csv")).toBe("中文内容")
  })

  it("rejects binary content containing NUL bytes", () => {
    const binary = Buffer.concat([Buffer.from("PK"), Buffer.from([0x00, 0x01, 0x02])])
    expect(() => extractSniffedText(binary, "arch.zip")).toThrow(AttachmentTextError)
  })

  it("rejects binary made only of non-NUL control bytes", () => {
    const binary = Buffer.concat([Buffer.from("PK\x03\x04"), Buffer.alloc(64, 0x11)])
    expect(() => extractSniffedText(binary, "pack.zip")).toThrow(AttachmentTextError)
  })

  it("accepts text with a stray control byte ratio", () => {
    const text = Buffer.from("正常文本\n第二行", "utf8")
    expect(extractSniffedText(text, "note.tst")).toContain("正常文本")
  })

  it("rejects oversized input", () => {
    const huge = Buffer.alloc(1024 * 1024 + 1, 0x61)
    expect(() => extractSniffedText(huge, "huge.log")).toThrow(AttachmentTextError)
  })

  it("rejects empty files", () => {
    expect(() => extractSniffedText(Buffer.alloc(0), "empty.tst")).toThrow(AttachmentTextError)
  })
})

describe("formatAimFileSize", () => {
  it("formats bytes, kilobytes and megabytes", () => {
    expect(formatAimFileSize(512)).toBe("512 B")
    expect(formatAimFileSize(2048)).toBe("2 KB")
    expect(formatAimFileSize(1.5 * 1024 * 1024)).toBe("1.5 MB")
  })
})
