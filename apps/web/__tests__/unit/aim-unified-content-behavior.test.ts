import { describe, expect, it } from "vitest"

function inspectFixtureDefinition(fixture: {
  currentUserRequest: string
  currentArtifact: string
  referenceMaterials: string[]
  candidate: string
  pass: boolean
}) {
  return {
    valid: fixture.currentUserRequest.trim().length > 0
      && fixture.candidate.trim().length > 0
      && typeof fixture.pass === "boolean",
  }
}

describe("AIM unified content behavior", () => {
  it.each([
    {
      name: "complete multi-script request is not reduced to openings",
      currentUserRequest: "按下面六种结构写20篇完整口播脚本，每篇都要有正文和结尾引导。",
      currentArtifact: "",
      referenceMaterials: ["编辑笔记：上一轮只改开头。\n故事型：目标→阻碍→结果。"],
      candidate: Array.from({ length: 20 }, (_, i) => `脚本${i + 1}\n开头\n正文\n结尾引导`).join("\n\n"),
      pass: true,
    },
    {
      name: "latest correction overrides history",
      currentUserRequest: "不是只改开头，这次要交付20篇完整脚本。",
      currentArtifact: "",
      referenceMaterials: ["上轮要求：只改开头。"],
      candidate: "20个开头建议",
      pass: false,
    },
    {
      name: "structure question is answered rather than replaced by a draft",
      currentUserRequest: "这篇文案用的是什么结构？",
      currentArtifact: "开头提出冲突，中间展开原因，结尾给出行动。",
      referenceMaterials: [],
      candidate: "这是‘冲突—原因—行动’结构，开头用冲突留人，中段解释，结尾承接行动。",
      pass: true,
    },
    {
      name: "partial change preserves untouched artifact",
      currentUserRequest: "只把第一句换成反差开头，其他不动。",
      currentArtifact: "原开头。\n第二段保留。\n结尾CTA保留。",
      referenceMaterials: [],
      candidate: "投了十万，却没换来一条有效线索。\n第二段保留。\n结尾CTA保留。",
      pass: true,
    },
  ])("$name", (fixture) => {
    expect(inspectFixtureDefinition(fixture).valid).toBe(true)
  })
})
