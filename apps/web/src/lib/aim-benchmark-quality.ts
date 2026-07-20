export interface AimBenchmarkQualityReport {
  originalChars: number
  outputChars: number
  lengthRatio: number | null
  lengthPassed: boolean
  reuseRatio: number
  tooSimilar: boolean
  reusedSamples: string[]
}

function compactText(text: string) {
  return text.replace(/\s+/g, "").replace(/[，。！？、；：,.!?;:"“”‘’'\uff08\uff09()《》【】\[\]{}]/g, "")
}

/**
 * @description 从原始输入中提取对标原文内容
 * @param rawInput - 包含对标原文标记的原始输入
 * @returns 提取的对标原文，未找到时返回空字符串
 */
export function extractBenchmarkOriginalCopy(rawInput: string) {
  const marker = rawInput.match(/对标原文[：:]\s*/)
  if (marker?.index == null) return ""
  const rest = rawInput.slice(marker.index + marker[0].length).trim()
  const nextSection = rest.search(/\n(?:已有拆解|结构化拆解|改写原则|创作原则|来源链接|字数硬规则|硬规则|对标标题|对标话题|对标账号|爆款拆解|===)[：:：]?/)
  return (nextSection >= 0 ? rest.slice(0, nextSection) : rest).trim()
}

/**
 * @description 计算对标文案与输出文案的复用率（基于 N-gram 匹配）
 * @param benchmark - 对标原文
 * @param output - 输出文案
 * @param size - N-gram 窗口大小
 * @returns 复用率（0-1）
 */
export function benchmarkCopyReuseRatio(benchmark: string, output: string, size = 12) {
  const source = compactText(benchmark)
  const target = compactText(output)
  if (source.length < size || target.length < size) {
    return source && target && source.includes(target) ? 1 : 0
  }

  const sourceChunks = new Set<string>()
  for (let index = 0; index <= source.length - size; index += 1) {
    sourceChunks.add(source.slice(index, index + size))
  }

  let reused = 0
  const total = target.length - size + 1
  for (let index = 0; index <= target.length - size; index += 1) {
    if (sourceChunks.has(target.slice(index, index + size))) reused += 1
  }

  return total > 0 ? reused / total : 0
}

function collectReusedSamples(benchmark: string, output: string, size = 12, limit = 5) {
  const source = compactText(benchmark)
  const target = compactText(output)
  if (source.length < size || target.length < size) return []

  const sourceChunks = new Set<string>()
  for (let index = 0; index <= source.length - size; index += 1) {
    sourceChunks.add(source.slice(index, index + size))
  }

  const samples: string[] = []
  for (let index = 0; index <= target.length - size; index += 1) {
    const chunk = target.slice(index, index + size)
    if (sourceChunks.has(chunk) && !samples.includes(chunk)) {
      samples.push(chunk)
      if (samples.length >= limit) break
    }
  }
  return samples
}

/**
 * @description 评估对标改写质量（长度比例、复用率、相似度）
 * @param benchmark - 对标原文
 * @param output - 输出文案
 * @returns 对标质量评估报告
 */
export function assessBenchmarkRewrite(benchmark: string, output: string): AimBenchmarkQualityReport {
  const originalChars = compactText(benchmark).length
  const outputChars = compactText(output).length
  const lengthRatio = originalChars > 0 ? outputChars / originalChars : null
  const reuseRatio = benchmarkCopyReuseRatio(benchmark, output)

  return {
    originalChars,
    outputChars,
    lengthRatio,
    lengthPassed: lengthRatio != null && lengthRatio >= 0.95 && lengthRatio <= 1.05,
    reuseRatio,
    tooSimilar: reuseRatio >= 0.35,
    reusedSamples: collectReusedSamples(benchmark, output),
  }
}

/**
 * @description 判断输出文案是否与对标原文过于相似
 * @param rawInput - 包含对标原文的原始输入
 * @param output - 输出文案
 * @returns 过于相似返回 true
 */
export function isBenchmarkCopyTooSimilar(rawInput: string, output: string) {
  const benchmark = extractBenchmarkOriginalCopy(rawInput)
  const source = compactText(benchmark)
  const target = compactText(output)
  if (source.length < 30 || target.length < 30) return false
  if (source === target || source.includes(target) || target.includes(source)) return true
  return benchmarkCopyReuseRatio(benchmark, output) >= 0.35
}
