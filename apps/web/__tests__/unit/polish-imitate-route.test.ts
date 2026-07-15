import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "src/lib/aim/services/script-polish.ts"),
  "utf8"
) + readFileSync(
  join(process.cwd(), "src/lib/aim/services/script-polish-context.ts"),
  "utf8"
) + readFileSync(
  join(process.cwd(), "src/lib/aim/services/script-polish-prompts.ts"),
  "utf8"
)

// imitate（跨行业爆款仿写）从废弃的 aim-agents/script-agent.ts 迁移到活路径
// /api/scripts/polish。这里用源码静态断言锁住三模式路由与仿写关键规则，
// 防止 imitate 分支被误删或退回单分支（mode === "proofread" ? ... : "polish"）。

describe("polish route imitate mode", () => {
  it("routes three modes explicitly (proofread / imitate / polish)", () => {
    expect(source).toContain('body.mode === "proofread"')
    expect(source).toContain('body.mode === "imitate"')
    // 不再是二选一的兜底，否则 imitate 会被吞成 polish
    expect(source).not.toContain('? "proofread" : "polish"')
  })

  it("reads viralSourceText and styleId from request body", () => {
    expect(source).toContain("body.viralSourceText")
    expect(source).toContain("body.styleId")
    expect(source).toContain("body.projectId")
  })

  it("rejects imitate without a viral source", () => {
    expect(source).toContain('请提供对标爆款原文')
  })

  it("grounds imitate in user style profile + project knowledge", () => {
    // 用户写作风格档案打底（这个 IP 真实文风）
    expect(source).toContain("getStyleProfileBlock")
    // 12 风格可选覆盖
    expect(source).toContain("getStylePromptBlock(input.styleId)")
    // 项目知识库填充新内容
    expect(source).toContain("loadProjectKnowledge")
    expect(source).toContain("企业知识库")
  })

  it("enforces cross-industry rewrite rules (no original-industry terms, no AI jargon)", () => {
    expect(source).toContain("爆款文案仿写专家")
    expect(source).toContain("禁止保留对标原文的行业特定词汇")
    expect(source).toContain("FORBIDDEN_TERMS")
  })
})
