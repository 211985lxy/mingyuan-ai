import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { AIM_ASSISTANT_PERSONA } from "@/lib/aim/assistant-persona"
import { buildContentProducerChatPrompt } from "@/lib/aim-agent-prompts"
import { buildUnifiedProducerSystemPrompt } from "@/lib/aim/unified-content-prompts"
import type { AimGenerateContext } from "@/lib/aim/agent-types"

const source = (relative: string) => readFileSync(join(process.cwd(), relative), "utf8")

describe("助手人设唯一来源（三套人格已合并）", () => {
  it("聊天与统一生成都自称「内容创作官」，旧称谓不再出现", () => {
    const chatPrompt = buildContentProducerChatPrompt({
      knowledgeBlock: "", methodologyBlock: "", ipWikiBlock: "",
    })
    expect(chatPrompt).toContain(AIM_ASSISTANT_PERSONA)
    expect(chatPrompt).not.toContain("太极营销创意总监")

    const context = { ipWikiBlock: "", knowledgeBlock: "", methodologyBlock: "", selectedMethodologyBlock: "" } as unknown as AimGenerateContext
    expect(buildUnifiedProducerSystemPrompt(context)).toContain("内容创作官")
    expect(buildUnifiedProducerSystemPrompt(context)).not.toContain("你是企业营销内容专家，")
  })

  it("三条生成链的源码都从 assistant-persona 取人设（唯一来源绊线）", () => {
    for (const file of [
      "src/lib/aim-agent-prompts.ts",
      "src/lib/aim-agent-content-producer.ts",
      "src/lib/aim/unified-content-prompts.ts",
    ]) {
      expect(source(file)).toContain("AIM_ASSISTANT_PERSONA")
      expect(source(file)).not.toContain("太极营销创意总监")
    }
  })
})
