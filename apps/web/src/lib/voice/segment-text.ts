/**
 * 长文分段切分：按句子边界把长文切成 ≤maxLen 的段，供客户端逐段合成后拼接。
 * 纯函数、无环境依赖，服务端与浏览器共用。
 */

/** 免费档实测约 12.5 字/秒（1000 字 80s）；1200 字单段约 100s，处于安全超时窗口内 */
export const VOICE_SEGMENT_MAX_LENGTH = 1200

/**
 * 按句子边界把长文切成 ≤maxLen 的段；无断句符时按硬上限兜底切分。
 */
export function splitTextForSynthesis(
  text: string,
  maxLen: number = VOICE_SEGMENT_MAX_LENGTH,
): string[] {
  const source = text.trim()
  if (!source) return []
  if (source.length <= maxLen) return [source]

  // 优先按强断句符切；保留分隔符在段尾，避免语气丢失
  const sentences: string[] = []
  const pattern = /[^。！？!?；;\n]*[。！？!?；;\n]+|[^。！？!?；;\n]+$/g
  for (const match of source.match(pattern) ?? []) {
    const sentence = match.trim()
    if (sentence) sentences.push(sentence)
  }

  const segments: string[] = []
  let current = ""
  for (const sentence of sentences) {
    if (sentence.length > maxLen) {
      if (current) {
        segments.push(current)
        current = ""
      }
      // 单句超长：按硬上限切，避免丢内容
      for (let i = 0; i < sentence.length; i += maxLen) {
        segments.push(sentence.slice(i, i + maxLen))
      }
      continue
    }
    if (current.length + sentence.length > maxLen) {
      segments.push(current)
      current = sentence
    } else {
      current = current ? `${current}${sentence}` : sentence
    }
  }
  if (current) segments.push(current)
  return segments
}
