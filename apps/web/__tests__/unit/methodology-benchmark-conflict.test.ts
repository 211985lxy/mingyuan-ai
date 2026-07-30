import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { BENCHMARK_REWRITE_GUARDRAIL } from "@/lib/aim-agent-prompts"

const METHODOLOGY_MD_PATH = resolve(
  __dirname,
  "../../../../docs/methodologies/ip-copywriting-methodology-core.md",
)

function readMethodology(): string {
  return readFileSync(METHODOLOGY_MD_PATH, "utf8")
}

describe("方法论种子不与对标改写硬规则（benchmark）冲突", () => {
  it("方法论不再出现与 benchmark 冲突的措辞", () => {
    const md = readMethodology()
    expect(md).not.toContain("保留第一句话")
    expect(md).not.toContain("第一句话不要轻易")
    expect(md).not.toContain("开头第一句话不要轻易变")
  })

  it("benchmark 规则仍要求开头重写、不连续沿用原文", () => {
    expect(BENCHMARK_REWRITE_GUARDRAIL).toContain("至少 30% 可感知重写")
    expect(BENCHMARK_REWRITE_GUARDRAIL).toContain("不要连续沿用原文 12 个字以上")
  })

  it("方法论「改写对标文案」段落与 benchmark 口径一致", () => {
    const md = readMethodology()
    expect(md).toMatch(/开头第一句要按当前 IP 的口吻重写/)
    expect(md).toMatch(/不照搬原句/)
  })
})
