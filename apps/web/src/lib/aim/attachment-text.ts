/** 未知扩展名文件的纯文本探测：服务端专用，不进客户端包。 */

export class AttachmentTextError extends Error {
  status: number

  constructor(message: string, status = 415) {
    super(message)
    this.status = status
  }
}

const MAX_SNIFF_BYTES = 1024 * 1024

function decodeWithBomAwareness(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le")
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return buffer.subarray(2).swap16().toString("utf16le")
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString("utf8")
  }
  return buffer.toString("utf8")
}

/** 文本中不应出现的控制字符（排除 \t \n \v \f \r）；占比过高视为二进制。 */
const BINARY_CONTROL_PATTERN = /[\u0001-\u0008\u000E-\u001F\u007F]/g

/**
 * 未知扩展名（如 .tst/.log）按纯文本读取：出现 NUL、大量替换符或大量控制字符视为二进制拒绝。
 * 与 parseDocument 的已知格式互为补充，仅用于聊天附件通道。
 */
export function extractSniffedText(buffer: Buffer, fileName: string): string {
  if (buffer.byteLength === 0) {
    throw new AttachmentTextError(`${fileName} 是空文件`, 422)
  }
  if (buffer.byteLength > MAX_SNIFF_BYTES) {
    throw new AttachmentTextError(`${fileName} 超过 1MB，无法作为文本附件`, 413)
  }
  const text = decodeWithBomAwareness(buffer)
  if (text.includes("\u0000")) {
    throw new AttachmentTextError(`${fileName} 不是文本文件，暂只支持图片与常见文档格式`)
  }
  const total = Math.max(text.length, 1)
  const replacementCount = (text.match(/\uFFFD/g) ?? []).length
  const controlCount = (text.match(BINARY_CONTROL_PATTERN) ?? []).length
  if ((replacementCount + controlCount) / total > 0.01) {
    throw new AttachmentTextError(`${fileName} 不是文本文件，暂只支持图片与常见文档格式`)
  }
  if (!text.trim()) {
    throw new AttachmentTextError(`${fileName} 没有可读文本内容`, 422)
  }
  return text
}
