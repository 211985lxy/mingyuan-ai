import { describe, expect, it } from "vitest"
import {
  resolveAimChannelIntent,
  extractCommandPrefix,
  listAimChannelCommands,
  buildAimChannelHelpText,
} from "@/lib/aim-channel-router"

describe("extractCommandPrefix", () => {
  it("解析半角斜杠命令", () => {
    expect(extractCommandPrefix("/内容创作 写一条口播")).toEqual({
      command: "内容创作",
      rest: "写一条口播",
    })
  })

  it("解析全角斜杠命令", () => {
    expect(extractCommandPrefix("／内容创作 写一条口播")).toEqual({
      command: "内容创作",
      rest: "写一条口播",
    })
  })

  it("兼容 # 前缀", () => {
    expect(extractCommandPrefix("#作品编辑 润色这段")).toEqual({
      command: "作品编辑",
      rest: "润色这段",
    })
  })

  it("无命令时返回 null", () => {
    expect(extractCommandPrefix("帮我写一条口播")).toBeNull()
    expect(extractCommandPrefix("  /  ")).toBeNull()
  })

  it("容忍命令前的空白", () => {
    expect(extractCommandPrefix("  /内容创作 写口播")).toEqual({
      command: "内容创作",
      rest: "写口播",
    })
  })

  it("命令后无内容时 rest 为空串", () => {
    expect(extractCommandPrefix("/内容创作")).toEqual({
      command: "内容创作",
      rest: "",
    })
  })
})

describe("resolveAimChannelIntent", () => {
  it("命令前缀映射到对应智能体并剥离前缀", () => {
    const result = resolveAimChannelIntent("/内容创作 帮我写一条抖音口播")
    expect(result.agentId).toBe("content_producer")
    expect(result.cleanedInput).toBe("帮我写一条抖音口播")
    expect(result.via).toBe("command")
  })

  it("支持每个智能体的别名", () => {
    expect(resolveAimChannelIntent("/润色 这段").agentId).toBe("work_editor")
    expect(resolveAimChannelIntent("/商业诊断 流量上不来").agentId).toBe("business_system_diagnosis")
    expect(resolveAimChannelIntent("/选题 给我几个题").agentId).toBe("business_diagnosis")
    expect(resolveAimChannelIntent("/质检 看看能不能发").agentId).toBe("content_review")
    expect(resolveAimChannelIntent("/人设 讲讲来时路").agentId).toBe("persona")
    expect(resolveAimChannelIntent("/自由 按我说的写").agentId).toBe("free_copywriter")
  })

  it("命令别名大小写无关（normalize 小写化）", () => {
    // 中文无大小写差异，这里主要验证 normalize 不破坏中文命令匹配
    expect(resolveAimChannelIntent("/内容创作 写口播").agentId).toBe("content_producer")
  })

  it("无命令但有默认智能体时走 default，保留整段文本", () => {
    const result = resolveAimChannelIntent("帮我写一条口播", "content_producer")
    expect(result.agentId).toBe("content_producer")
    expect(result.cleanedInput).toBe("帮我写一条口播")
    expect(result.via).toBe("default")
  })

  it("无命令且无默认时返回 unknown", () => {
    const result = resolveAimChannelIntent("帮我写一条口播")
    expect(result.via).toBe("unknown")
    expect(result.cleanedInput).toBe("帮我写一条口播")
  })

  it("无法识别的命令 + 无默认 → unknown", () => {
    const result = resolveAimChannelIntent("/随便写写 内容")
    expect(result.via).toBe("unknown")
  })

  it("无法识别的命令 + 有默认 → 走 default，命令当作普通文本", () => {
    const result = resolveAimChannelIntent("/随便写写 内容", "content_producer")
    expect(result.via).toBe("default")
    expect(result.agentId).toBe("content_producer")
    // 命令无法识别时整段文本保留，避免吞掉用户输入
    expect(result.cleanedInput).toBe("/随便写写 内容")
  })
})

describe("help text", () => {
  it("列出全部 7 个智能体的命令", () => {
    const commands = listAimChannelCommands()
    const agentIds = commands.map((c) => c.agentId)
    expect(agentIds).toEqual(
      expect.arrayContaining([
        "content_producer",
        "work_editor",
        "free_copywriter",
        "business_diagnosis",
        "business_system_diagnosis",
        "content_review",
        "persona",
      ]),
    )
    expect(commands).toHaveLength(7)
  })

  it("帮助文案包含示例与全部智能体", () => {
    const help = buildAimChannelHelpText()
    expect(help).toContain("/命令")
    expect(help).toContain("内容创作")
    expect(help).toContain("作品编辑")
    expect(help).toContain("人设故事")
  })
})
