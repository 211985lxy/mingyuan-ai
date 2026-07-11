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

export function extractBenchmarkOriginalCopy(rawInput: string) {
  const marker = rawInput.match(/对标原文[：:]\s*/)
  if (marker?.index == null) return ""
  const rest = rawInput.slice(marker.index + marker[0].length).trim()
  const nextSection = rest.search(/\n(?:已有拆解|结构化拆解|改写原则|创作原则|来源链接|字数硬规则|硬规则|===)[：:：]?/)
  return (nextSection >= 0 ? rest.slice(0, nextSection) : rest).trim()
}

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

export function isBenchmarkCopyTooSimilar(rawInput: string, output: string) {
  const benchmark = extractBenchmarkOriginalCopy(rawInput)
  const source = compactText(benchmark)
  const target = compactText(output)
  if (source.length < 30 || target.length < 30) return false
  if (source === target || source.includes(target) || target.includes(source)) return true
  return benchmarkCopyReuseRatio(benchmark, output) >= 0.35
}
