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
  return text.replace(/\s/g, "")
}

export function benchmarkCopyReuseRatio(benchmark: string, output: string, size = 12) {
  const source = compactText(benchmark)
  const target = compactText(output)
  if (source.length < size || target.length < size) return 0

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
