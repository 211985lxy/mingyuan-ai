import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

/**
 * content-pipeline 类型安全守护测试。
 *
 * 历史 bug：content-pipeline 目录曾有 3 个文件（video-link-detector /
 * copy-inspiration-bridge / video-processor）长期挂 @ts-nocheck，注释自述
 * "接口待对齐/待修复/待合入"，但实际依赖模块早已就绪——@ts-nocheck 是过时的
 * 临时补丁未清理，导致 3 个接入生产（飞书/公众号/视频 API）的文件类型裸奔。
 *
 * 本测试扫描整个 content-pipeline 目录，禁止任何 .ts 文件再出现 @ts-nocheck，
 * 防止"临时跳过类型检查"再次变成永久技术债。
 */
const PIPELINE_DIR = resolve(__dirname, "../../src/lib/content-pipeline")

function listTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listTsFiles(fullPath))
    } else if (entry.name.endsWith(".ts")) {
      out.push(fullPath)
    }
  }
  return out
}

describe("content-pipeline 禁止 @ts-nocheck", () => {
  it("目录下无任何 .ts 文件使用 @ts-nocheck", () => {
    const offenders: string[] = []
    for (const file of listTsFiles(PIPELINE_DIR)) {
      const content = readFileSync(file, "utf8")
      if (content.includes("@ts-nocheck")) {
        offenders.push(file.replace(PIPELINE_DIR + "/", ""))
      }
    }
    expect(
      offenders,
      `以下文件重新挂上了 @ts-nocheck（类型裸奔）：${offenders.join(", ")}。请修复类型问题而非跳过检查。`,
    ).toEqual([])
  })
})
