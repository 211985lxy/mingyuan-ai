import { readFileSync } from "fs"
import { join } from "path"

import { describe, expect, it } from "vitest"

import {
  buildAgentCapabilities,
  findInvalidAgentTargetFormats,
  parseAgentTargetFormats,
  summarizeAgentInput,
} from "@/lib/agent-api-contract"

describe("Agent API contract", () => {
  it("returns the external AIM agents with content_producer (was ip_video)", () => {
    const capabilities = buildAgentCapabilities()
    const ids = capabilities.agents.map((agent) => agent.id)

    expect(ids).toEqual([
      "business_system_diagnosis",
      "business_diagnosis",
      "content_producer",
      "free_copywriter",
      "work_editor",
      "content_review",
    ])
    // 旧别名 ip_video 不应再出现在公开契约里
    expect(ids).not.toContain("ip_video")
  })

  it("accepts only whitelisted target formats", () => {
    const formats = parseAgentTargetFormats([
      "video_script",
      "moments_post",
      "auto_publish",
      "webhook",
    ])

    expect(formats).toEqual(["video_script", "moments_post"])
    expect(findInvalidAgentTargetFormats(["video_script", "auto_publish"])).toEqual([
      "auto_publish",
    ])
  })

  it("keeps call log input summaries bounded", () => {
    const summary = summarizeAgentInput(`${"生成文案 ".repeat(120)}\n\n继续生成`)

    expect(summary.length).toBeLessThanOrEqual(503)
    expect(summary).toContain("生成文案")
  })

  it("publishes a skill document with draft-only boundaries", () => {
    const skill = readFileSync(join(process.cwd(), "public/skill.md"), "utf8")

    expect(skill).toContain("name: mingdong-aim-agent-skill")
    expect(skill).toContain("description: Call Mingdong AIM agents")
    expect(skill).toContain("明动 AIM Agent Skill")
    expect(skill).toContain("只允许生成草稿")
    expect(skill).toContain("修改 IP 营销全案")
    expect(skill).toContain("Authorization: Bearer maim_xxx")
  })

  it("publishes a dedicated wechat chat import skill document", () => {
    const skill = readFileSync(join(process.cwd(), "public/skill-wechat-chat.md"), "utf8")
    const capabilities = buildAgentCapabilities()

    expect(skill).toContain("name: mingdong-wechat-chat-skill")
    expect(skill).toContain("微信聊天导入 Skill")
    expect(skill).toContain("/api/agent/v1/knowledge/wechat-chat/import")
    expect(skill).toContain("/api/agent/v1/knowledge/wechat-chat/confirm")
    expect(capabilities.extraSkills?.[0]?.id).toBe("wechat_chat_import")
    expect(capabilities.boundaries.allowed).toContain("create_confirmed_wechat_chat_knowledge")
    expect(capabilities.boundaries.denied).toContain("unreviewed_knowledge_mutation")
    expect(capabilities.boundaries.denied).toContain("knowledge_update_or_delete")
  })
})
