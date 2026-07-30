/**
 * 技能跨引擎委托 —— 纯解析层契约。
 *
 * 钉死三件事：
 *   1. 只有合法 AimAgentId 能换引擎，非法值一律回落会话智能体（不抛错、不落默认 agent）；
 *   2. 委托目标 id 能取到目标引擎自己的 handler（质检技能 → ContentReviewHandler）；
 *   3. 委托后知识策略按目标引擎解析（content_review → quality_review）。
 */
import { describe, expect, it } from "vitest"

import { resolveAimExecutionAgent } from "@/lib/aim/services/aim-execution-agent"
import { resolveSkillExecutionAgentId } from "@/features/aim/aim-skill-utils"
import { getAgentHandler } from "@/lib/aim-agent-handlers"
import { ContentReviewHandler } from "@/lib/aim-agent-content-review"
import { WorkEditorHandler } from "@/lib/aim-agent-work-editor"
import { resolveAimRuntimeTask } from "@/lib/aim-knowledge-strategy"

describe("resolveAimExecutionAgent", () => {
  it("技能声明质检引擎时委托生效，会话归属不变", () => {
    const resolved = resolveAimExecutionAgent({
      sessionAgentId: "work_editor",
      requestedExecutionAgentId: "content_review",
    })
    expect(resolved).toEqual({
      sessionAgentId: "work_editor",
      executionAgentId: "content_review",
      delegated: true,
    })
  })

  it("没带引擎字段时行为完全不变", () => {
    for (const requested of [undefined, null, "", "   ", 42, {}]) {
      const resolved = resolveAimExecutionAgent({
        sessionAgentId: "work_editor",
        requestedExecutionAgentId: requested,
      })
      expect(resolved.delegated).toBe(false)
      expect(resolved.executionAgentId).toBe("work_editor")
      expect(resolved.rejectedExecutionAgentId).toBeUndefined()
    }
  })

  it("引擎等于当前智能体时不算委托", () => {
    const resolved = resolveAimExecutionAgent({
      sessionAgentId: "work_editor",
      requestedExecutionAgentId: "work_editor",
    })
    expect(resolved.delegated).toBe(false)
    expect(resolved.executionAgentId).toBe("work_editor")
  })

  it("旧别名归一化后与当前智能体同源时不算委托，会话 id 逐字保留", () => {
    const resolved = resolveAimExecutionAgent({
      sessionAgentId: "deep_copywriter",
      requestedExecutionAgentId: "work_editor",
    })
    expect(resolved.delegated).toBe(false)
    // 未委托路径必须逐字回传原值，避免给现有链路引入归一化差异
    expect(resolved.executionAgentId).toBe("deep_copywriter")
  })

  it("旧别名作为委托目标时归一化成规范 id", () => {
    const resolved = resolveAimExecutionAgent({
      sessionAgentId: "content_producer",
      requestedExecutionAgentId: "deep_copywriter",
    })
    expect(resolved.delegated).toBe(true)
    expect(resolved.executionAgentId).toBe("work_editor")
  })

  it("非法引擎安全回落到当前智能体，并留下被拒值", () => {
    for (const bogus of ["content_reviewer", "../../etc/passwd", "DEFAULT", "Content_Review"]) {
      const resolved = resolveAimExecutionAgent({
        sessionAgentId: "work_editor",
        requestedExecutionAgentId: bogus,
      })
      expect(resolved.delegated).toBe(false)
      // 关键：不落到 DEFAULT_AIM_AGENT（content_producer），否则会串台
      expect(resolved.executionAgentId).toBe("work_editor")
      expect(resolved.rejectedExecutionAgentId).toBe(bogus)
    }
  })

  it("引擎字段先去空白再严格校验", () => {
    const resolved = resolveAimExecutionAgent({
      sessionAgentId: "work_editor",
      requestedExecutionAgentId: "  content_review  ",
    })
    expect(resolved.executionAgentId).toBe("content_review")
    expect(resolved.delegated).toBe(true)
  })

  it("非法引擎不抛错", () => {
    expect(() => resolveAimExecutionAgent({
      sessionAgentId: "work_editor",
      requestedExecutionAgentId: "not_an_agent",
    })).not.toThrow()
  })
})

describe("resolveSkillExecutionAgentId", () => {
  it("质检技能挂在作品编辑面板上时返回质检引擎", () => {
    expect(resolveSkillExecutionAgentId({ agentId: "content_review" }, "work_editor"))
      .toBe("content_review")
  })

  it("技能没有 agentId 时不委托", () => {
    expect(resolveSkillExecutionAgentId({ agentId: undefined }, "work_editor")).toBeUndefined()
  })

  it("技能 agentId 等于当前智能体时不委托", () => {
    expect(resolveSkillExecutionAgentId({ agentId: "work_editor" }, "work_editor")).toBeUndefined()
    expect(resolveSkillExecutionAgentId({ agentId: "work_editor" }, "deep_copywriter")).toBeUndefined()
  })

  it("非法 agentId 不委托（回落到当前智能体）", () => {
    expect(resolveSkillExecutionAgentId(
      { agentId: "content_reviewer" as never },
      "work_editor",
    )).toBeUndefined()
  })

  it("不知道当前智能体时照常上报，由服务端再判一次", () => {
    expect(resolveSkillExecutionAgentId({ agentId: "content_review" })).toBe("content_review")
  })
})

describe("委托目标引擎的配置来源", () => {
  it("委托 id 取到的是质检 handler，不是作品编辑 handler", () => {
    expect(getAgentHandler("content_review")).toBeInstanceOf(ContentReviewHandler)
    expect(getAgentHandler("work_editor")).toBeInstanceOf(WorkEditorHandler)
  })

  it("委托执行时知识检索策略解析成 quality_review", () => {
    const delegated = resolveAimExecutionAgent({
      sessionAgentId: "work_editor",
      requestedExecutionAgentId: "content_review",
    })
    expect(resolveAimRuntimeTask({
      agentId: delegated.executionAgentId,
      input: "请基于当前文案做标题质检：指出标题是否准确、有钩子。",
    })).toBe("quality_review")
  })

  it("同一句话在未委托的作品编辑会话里不会变成 quality_review", () => {
    const notDelegated = resolveAimExecutionAgent({
      sessionAgentId: "work_editor",
      requestedExecutionAgentId: undefined,
    })
    expect(resolveAimRuntimeTask({
      agentId: notDelegated.executionAgentId,
      input: "请基于当前文案做标题质检：指出标题是否准确、有钩子。",
    })).not.toBe("quality_review")
  })
})
