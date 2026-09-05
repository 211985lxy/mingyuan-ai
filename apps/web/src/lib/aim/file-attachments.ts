import type { AimFileAttachment } from "@/lib/aim/workbench-types"

/** 单个文件注入模型上下文的字符上限：超过则保留头尾并标记截断。
 *  聊天请求总预算 120KB（chat-payload-budget），3 个文件按上限计仍留有余量。 */
export const AIM_FILE_ATTACHMENT_MAX_CHARS = 24_000
/** 所有文件合计字符上限：避免多文件叠加挤爆上下文。 */
export const AIM_FILE_ATTACHMENTS_TOTAL_MAX_CHARS = 60_000

/** 输入框一次最多挂载的文件附件数（与图片上限 4 同量级）。 */
export const AIM_FILE_ATTACHMENT_MAX_COUNT = 3

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
    if (remaining <= 0) {
      blocks.push(`【附件 ${file.name}】内容过长，本次未随消息发送`)
      continue
    }
    const budget = Math.min(AIM_FILE_ATTACHMENT_MAX_CHARS, remaining)
    blocks.push(`【附件 ${file.name}】\n${clampFileText(file.content, budget)}`)
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
