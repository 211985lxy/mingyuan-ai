import type { ChatMessage } from "@/lib/llm/types"
import { getAgentLLM } from "@/lib/llm/agent-router"

/** 扫描件 PDF 视觉兜底：解析出的文字过少时，把 PDF 页转成图片交给视觉模型转写。
 *  零新依赖：复用已有 LLM 网关（image_url 多模态），页面数有硬上限控成本。 */

const OCR_MAX_PAGES = 5
/** 低于此字符数视为「几乎没有文字层」（扫描件或空文档）。 */
const SCAN_TEXT_THRESHOLD = 40

export function isLikelyScannedPdf(parseResult: {
  fileName: string
  textLength: number
}): boolean {
  const isPdf = /\.pdf$/i.test(parseResult.fileName)
  return isPdf && parseResult.textLength < SCAN_TEXT_THRESHOLD
}

/** 用 pdf 页数构造渲染占位提示；真实页图由调用方用 pdftoppm 渲染后传入。 */
export async function ocrPdfPagesWithVision(input: {
  /** 每页一张的 PNG/JPG base64（data URL），由 pdftoppm 渲染产出 */
  pageImages: string[]
  fileName: string
}): Promise<{ text: string }> {
  const pages = input.pageImages.slice(0, OCR_MAX_PAGES)
  if (pages.length === 0) return { text: "" }

  const client = getAgentLLM("vision_analysis")
  const message: ChatMessage = {
    role: "user",
    content: [
      {
        type: "text",
        text:
          `这是文件《${input.fileName}》的 ${pages.length} 页扫描图。` +
          "请逐页把图中所有文字完整转写为纯文本（保持阅读顺序，不要添加任何评论、总结或格式），" +
          "页与页之间用空行分隔。若某页完全没有文字，输出（空白页）。",
      },
      ...pages.map((page) => ({ type: "image_url" as const, image_url: { url: page } })),
    ],
  }
  const result = await client.complete({
    messages: [message],
    temperature: 0,
    maxTokens: 8000,
  })
  return { text: result.content ?? "" }
}

/** 渲染 PDF 前 N 页为图片（依赖系统 pdftoppm/poppler），失败返回空数组。 */
export async function renderPdfPagesToImages(
  buffer: Buffer,
  maxPages = OCR_MAX_PAGES,
): Promise<string[]> {
  const { execFile } = await import("node:child_process")
  const { mkdtemp, readFile, readdir, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const path = await import("node:path")

  let dir: string | null = null
  try {
    dir = await mkdtemp(path.join(tmpdir(), "aim-pdf-ocr-"))
    const pdfPath = path.join(dir, "input.pdf")
    await (await import("node:fs/promises")).writeFile(pdfPath, buffer)
    await new Promise<void>((resolveRender, rejectRender) => {
      execFile(
        "pdftoppm",
        ["-png", "-r", "110", "-f", "1", "-l", String(maxPages), pdfPath, path.join(dir!, "page")],
        { timeout: 30_000, maxBuffer: 32 * 1024 * 1024 },
        (error) => (error ? rejectRender(error) : resolveRender()),
      )
    })
    const pages = (await readdir(dir)).filter((name) => name.startsWith("page") && name.endsWith(".png")).sort()
    const images: string[] = []
    for (const page of pages) {
      const bytes = await readFile(path.join(dir, page))
      images.push(`data:image/png;base64,${bytes.toString("base64")}`)
    }
    return images
  } catch {
    return []
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
