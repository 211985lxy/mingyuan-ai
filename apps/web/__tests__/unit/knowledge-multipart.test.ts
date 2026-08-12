import { afterEach, describe, expect, it } from "vitest"
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  KnowledgeMultipartError,
  assertKnowledgeUploadLimits,
  cleanupTempDir,
  detectMagicMismatch,
  writeKnowledgeUploadsFromFormData,
} from "@/lib/knowledge-multipart"

function makeFile(name: string, bytes: number, type: string): File {
  const buf = Buffer.alloc(bytes, 0x41)
  return new File([buf], name, { type })
}

describe("knowledge multipart limits", () => {
  const dirs: string[] = []

  afterEach(async () => {
    for (const dir of dirs.splice(0)) {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("rejects single file over 10MiB", () => {
    expect(() =>
      assertKnowledgeUploadLimits({
        fileCount: 1,
        contentLength: 11 * 1024 * 1024,
        files: [{ name: "a.pdf", size: 11 * 1024 * 1024 }],
      }),
    ).toThrow(KnowledgeMultipartError)
  })

  it("rejects request over 20MiB", () => {
    expect(() =>
      assertKnowledgeUploadLimits({
        fileCount: 2,
        contentLength: 21 * 1024 * 1024,
        files: [
          { name: "a.pdf", size: 10 * 1024 * 1024 },
          { name: "b.pdf", size: 10 * 1024 * 1024 },
        ],
      }),
    ).toThrow(/20|请求|总大小/i)
  })

  it("rejects more than 10 files", () => {
    expect(() =>
      assertKnowledgeUploadLimits({
        fileCount: 11,
        contentLength: 1000,
        files: Array.from({ length: 11 }, (_, i) => ({
          name: `f${i}.txt`,
          size: 10,
        })),
      }),
    ).toThrow(/10|过多|too many/i)
  })

  it("detects extension/MIME/magic mismatch", () => {
    // PDF magic but named .txt
    const pdfMagic = Buffer.from("%PDF-1.4 fake")
    expect(detectMagicMismatch("note.txt", "text/plain", pdfMagic)).toMatch(/magic|不符|不匹配/i)
  })

  it("writes files to temp and cleans up in finally", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "km-test-"))
    dirs.push(root)
    const form = new FormData()
    form.append("file", makeFile("ok.txt", 32, "text/plain"))
    form.append("category", "product_usp")

    const result = await writeKnowledgeUploadsFromFormData(form, { tempRoot: root })
    expect(result.files.length).toBe(1)
    expect(result.files[0].tempPath).toContain(root)
    const before = await readdir(result.tempDir)
    expect(before.length).toBeGreaterThan(0)

    await cleanupTempDir(result.tempDir)
    await expect(readdir(result.tempDir)).rejects.toThrow()
  })
})
