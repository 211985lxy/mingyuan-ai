import type { AimFileAttachment } from "@/lib/aim/workbench-types"

/** 单个文件注入模型上下文的字符上限：超过则保留头尾并标记截断。
 *  聊天请求总预算 120KB（chat-payload-budget），3 个文件按上限计仍留有余量。 */
export const AIM_FILE_ATTACHMENT_MAX_CHARS = 24_000
/** 所有文件合计字符上限：避免多文件叠加挤爆上下文。 */
export const AIM_FILE_ATTACHMENTS_TOTAL_MAX_CHARS = 60_000

/** 输入框一次最多挂载的文件附件数（与图片上限 4 同量级）。 */
export const AIM_FILE_ATTACHMENT_MAX_COUNT = 3

/** 音频附件自动转写的时长上限（分钟）：控 ASR 计费与转写等待。 */
export const AIM_AUDIO_MAX_MINUTES = 30

/** 音频附件扩展名白名单（mime 常为空，按扩展名识别）。 */
const AUDIO_EXTENSIONS = new Set([
  ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".wma", ".amr", ".opus",
])

/** 判断是否为音频附件（mime audio/* 或扩展名命中白名单）。 */
export function isAudioFile(file: { type?: string; name: string }): boolean {
  if (file.type?.startsWith("audio/")) return true
  const dotIndex = file.name.lastIndexOf(".")
  if (dotIndex === -1) return false
  return AUDIO_EXTENSIONS.has(file.name.slice(dotIndex).toLowerCase())
}

/** 浏览器侧读取本地音频时长（秒）；读不到（非音频/格式不支持）返回 null。 */
export function readAudioDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file)
      const audio = new Audio()
      const cleanup = () => {
        URL.revokeObjectURL(url)
        audio.removeAttribute("src")
      }
      audio.preload = "metadata"
      audio.onloadedmetadata = () => {
        const duration = Number.isFinite(audio.duration) ? audio.duration : null
        cleanup()
        resolve(duration)
      }
      audio.onerror = () => {
        cleanup()
        resolve(null)
      }
      audio.src = url
    } catch {
      resolve(null)
    }
  })
}

/**
 * 附件格式统一分类：
 *  - 图片（image/*）→ 图片通道：原图上传，模型直接看图
 *  - 文档/文本（下方扩展名）→ 文件通道：服务端解析成文字并入上下文
 *  - 未知扩展名的文本类（.tst/.log 等）→ 文本嗅探兜底，能读就收
 *  - 音频/视频/压缩包/可执行 → 暂不支持（各有专门通道或为二进制）
 * 文件选择器的 accept 用此常量，保证所有入口支持面一致。
 */
export const AIM_ATTACHMENT_ACCEPT = [
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif",
  ".pdf", ".docx", ".txt", ".md", ".markdown", ".csv",
  ".xls", ".xlsx", ".pptx", ".html", ".htm", ".rtf", ".json", ".xml",
  "image/*",
].join(",")

const TRUNCATION_NOTE = "\n…（文件过长，已截断）…\n"

/** 粘贴/拖入的文件按现有通道分流：图片走图片上传，其余走文本解析。 */
export function splitPastedFiles(files: FileList | File[]): { images: File[]; documents: File[] } {
  const images: File[] = []
  const documents: File[] = []
  for (const file of Array.from(files)) {
    if (file.type.startsWith("image/")) images.push(file)
    else documents.push(file)
  }
  return { images, documents }
}

/**
 * 从 paste 事件取文件：优先 files（访达复制文件）；
 * 为空时回退读取 items 里的图片（截图后直接 Cmd+V，浏览器以 image/png 位图形式提供）。
 */
export function collectPasteFiles(
  dataTransfer: Pick<DataTransfer, "files" | "items"> | null | undefined,
): File[] {
  const direct = Array.from(dataTransfer?.files ?? [])
  if (direct.length > 0) return direct
  const items = Array.from(dataTransfer?.items ?? [])
  const files: File[] = []
  for (const item of items) {
    if (item.kind !== "file") continue
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  return files
}

function clampFileText(text: string, maxChars: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxChars) return trimmed
  const headChars = Math.ceil(maxChars * 0.7)
  const tailChars = Math.max(0, maxChars - headChars)
  return `${trimmed.slice(0, headChars)}${TRUNCATION_NOTE}${trimmed.slice(-tailChars)}`.trim()
}

/** 把文件附件正文并入模型可见文本：UI 气泡仍只显示原话，不显示整段正文。 */
export function appendAimFileAttachmentsToContent(
  content: string,
  files?: AimFileAttachment[] | null,
): string {
  const readyFiles = (files ?? []).filter((file) => file.status === "ready" && file.content.trim())
  if (readyFiles.length === 0) return content

  const blocks: string[] = []
  let remaining = AIM_FILE_ATTACHMENTS_TOTAL_MAX_CHARS
  for (const file of readyFiles) {
    const label = file.kind === "audio"
      ? `【音频 ${file.name} · 转写稿】`
      : `【附件 ${file.name}】`
    if (remaining <= 0) {
      blocks.push(`${label}内容过长，本次未随消息发送`)
      continue
    }
    const budget = Math.min(AIM_FILE_ATTACHMENT_MAX_CHARS, remaining)
    blocks.push(`${label}\n${clampFileText(file.content, budget)}`)
    remaining -= budget
  }
  const prefix = content.trim() ? `${content.trim()}\n\n` : ""
  return `${prefix}以下为本次随消息附带的文件内容：\n\n${blocks.join("\n\n")}`
}

/** chip 上展示的体积文案。 */
export function formatAimFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
