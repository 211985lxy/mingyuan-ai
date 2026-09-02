import { describe, expect, it } from "vitest"

import { AIM_AGENT_OPTIONS, buildAimAgentHref, getAimAgent, listVisibleAimAgents } from "@/lib/aim-ui-config"
import {
  buildAimNextActionPrompt,
  getAimAgentGuide,
} from "@/lib/aim-agent-guides"

describe("aim agent guides", () => {
  it("defines a guide for every AIM agent", () => {
    for (const agent of AIM_AGENT_OPTIONS) {
      const guide = getAimAgentGuide(agent.id)

      expect(guide.intro).toBeTruthy()
      expect(guide.inputTemplate.length).toBeGreaterThan(0)
      expect(guide.outputAssets.length).toBeGreaterThan(0)
      expect(guide.nextActions.length).toBeGreaterThan(0)
      if (agent.id !== "free_copywriter") {
        expect(guide.skills.length).toBeGreaterThan(0)
      }
    }
  })

  it("keeps content_review away from new-copy actions", () => {
    const guide = getAimAgentGuide("content_review")
    const actionText = guide.nextActions.map((action) => `${action.label} ${action.prompt}`).join("\n")

    expect(actionText).not.toContain("生成新文案")
    expect(actionText).toContain("复检")
    expect(actionText).toContain("保存")
  })

  it("does not expose structural copyVariants beside purpose skills", () => {
    const guide = getAimAgentGuide("content_producer")
    const purposeSkills = guide.skills.filter((skill) => skill.group === "内容目的")
    expect((guide as { copyVariants?: unknown }).copyVariants).toBeUndefined()
    expect(purposeSkills.map((s) => s.label)).toEqual(["我要搞流量", "我要获客", "我要讲故事"])
  })

  it("uses task-based workflow names on the visible agent list", () => {
    expect(getAimAgent("business_system_diagnosis").title).toBe("商业诊断")
    expect(getAimAgent("business_diagnosis").title).toBe("选题策划")
    expect(getAimAgent("content_producer").title).toBe("内容创作")
    expect(getAimAgent("work_editor").title).toBe("作品编辑")
    expect(getAimAgent("content_review").title).toBe("发布质检")
    expect(getAimAgent("persona").title).toBe("内容创作") // legacy alias
  })

  it("keeps content pillars under topic planning instead of separate agents", () => {
    const guideText = [
      getAimAgentGuide("business_diagnosis").defaultInstruction,
      ...getAimAgentGuide("business_diagnosis").outputAssets,
    ].join("\n")

    expect(guideText).toContain("热点类")
    expect(guideText).toContain("人设类")
    expect(guideText).toContain("问题解答类")
  })

  it("preloads content producer around three content purposes", () => {
    const guide = getAimAgentGuide("content_producer")
    const guideText = [
      guide.intro,
      guide.defaultInstruction,
      ...guide.quickPrompts,
      ...guide.scenarios,
      ...guide.outputAssets,
    ].join("\n")

    expect(guideText).toContain("我要搞流量")
    expect(guideText).toContain("我要获客")
    expect(guideText).toContain("我要讲故事")
    expect(guide.quickPrompts).toHaveLength(3)
    expect(guide.scenarios).toEqual(["我要搞流量口播", "我要获客口播", "我要讲故事口播"])
    expect(guide.defaultInstruction).toContain("未说明内容目的时先追问一句")
    expect(guide.defaultInstruction).not.toContain("未说明时默认按流量漏斗处理")
    expect(guide.defaultInstruction).not.toContain("对标再创作")
    expect(guide.quickPrompts.join("\n")).not.toContain("多平台")
  })

  it("keeps content producer knowledge use lightweight by default", () => {
    const guideText = getAimAgentGuide("content_producer").defaultInstruction

    expect(guideText).toContain("不是每次都重度结合知识库")
    expect(guideText).toContain("少量带 1-2 句人设")
  })

  it("builds next-action prompts with the original deliverable content", () => {
    const action = getAimAgentGuide("content_producer").nextActions.find((item) => item.id === "publish_package")
    const content = "这是一段已经生成好的口播文案。"

    expect(action).toBeTruthy()
    expect(buildAimNextActionPrompt(action!, content)).toContain(content)
  })

  it("turns the publishing action into a 12-item publishing plan", () => {
    const action = getAimAgentGuide("content_producer").nextActions.find((item) => item.id === "publish_package")

    expect(action?.label).toBe("生成发布计划")
    expect(action?.prompt).toContain("内容排产表")
    expect(action?.prompt).toContain("排产数量只服从用户指令")
    expect(action?.prompt).toContain("序号、选题标题、核心钩子、内容角度、适合平台/形式、发布话题、承接动作")
    expect(action?.prompt).toContain("品牌/IP/账号相关话题")
  })

  it("resolves the legacy ip_video alias to the content_producer guide (backward compat)", () => {
    const canonical = getAimAgentGuide("content_producer")
    const aliased = getAimAgentGuide("ip_video")

    expect(aliased).toBe(canonical)
  })

  it("splits content producer purpose skills into three independent oral skills", () => {
    const skills = getAimAgentGuide("content_producer").skills.filter((skill) => skill.group === "内容目的")
    const labels = skills.map((skill) => skill.label)
    const ids = skills.map((skill) => skill.id)

    expect(ids).toEqual(["traffic_funnel", "lead_acquisition", "general_story"])
    expect(labels).toEqual(["我要搞流量", "我要获客", "我要讲故事"])
    expect(skills.every((skill) => skill.group === "内容目的")).toBe(true)

    const traffic = skills.find((s) => s.id === "traffic_funnel")!
    const lead = skills.find((s) => s.id === "lead_acquisition")!
    const story = skills.find((s) => s.id === "general_story")!

    expect(traffic.description).toBe("结合热点以及经典话题创作。")
    expect(traffic.prompt).toContain("流量漏斗")
    expect(traffic.prompt).toContain("结合当下热点与经典常青话题")
    expect(traffic.prompt).toContain("可收藏抓手")
    expect(traffic.prompt).not.toContain("线索获客")
    expect(traffic.prompt).not.toContain("通用故事")

    expect(lead.prompt).toContain("线索获客")
    expect(lead.prompt).toContain("评论/私信/领清单/预约其一")
    expect(lead.prompt).toContain("做镜子不做自己")
    expect(lead.prompt).toContain("谁适合/谁不适合")

    expect(story.prompt).toContain("通用故事")
    expect(story.prompt).toContain("不强行推产品")
    expect(story.prompt).toContain("人设故事")
  })

  it("keeps topic planning skills including market search action", () => {
    const guide = getAimAgentGuide("business_diagnosis")
    const labels = guide.skills.map((skill) => skill.label)

    expect(labels).toEqual(["搜对标选题", "对标选题池", "按目的出题", "筛高潜", "会议提炼"])
    expect(guide.skills.every((skill) => skill.group === "选题动作")).toBe(true)
    expect(guide.scenarios).toEqual(["搜对标选题", "对标选题池", "按目的出题", "筛高潜", "会议提炼"])
    expect(guide.skills.find((skill) => skill.id === "market_benchmark_search")?.workbenchAction)
      .toBe("open_benchmark_search")
    expect(guide.defaultInstruction).toContain("优先按目的出题")
  })

  it("keeps review skills to full check and publish decision", () => {
    const guide = getAimAgentGuide("content_review")
    const labels = guide.skills.map((skill) => skill.label)

    expect(labels).toEqual(["发布前全检", "发布前判断"])
    expect(guide.skills.every((skill) => skill.group === "质检动作")).toBe(true)
    expect(guide.scenarios).toEqual(["发布前全检", "发布前判断"])
    expect(guide.quickPrompts).toHaveLength(2)
    expect(guide.defaultInstruction).toContain("未说明时默认做发布前全检")
    expect(guide.skills.find((s) => s.id === "full_publish_review")?.prompt).toContain("复检清单")
  })

  it("keeps topic goals decided before copywriting", () => {
    const purposeSkill = getAimAgentGuide("business_diagnosis").skills.find((item) => item.id === "purpose_topics")

    expect(purposeSkill?.label).toBe("按目的出题")
    expect(purposeSkill?.prompt).toContain("曝光/获客/信任/成交")
    expect(purposeSkill?.prompt).toContain("不要直接写文案")
    expect(purposeSkill?.prompt).toContain("为什么不是另外三个目的")
  })

  it("keeps benchmark topic pool as graded asset package", () => {
    const skill = getAimAgentGuide("business_diagnosis").skills.find((item) => item.id === "benchmark_topic_pool")
    const guideText = [
      ...getAimAgentGuide("business_diagnosis").quickPrompts,
      ...getAimAgentGuide("business_diagnosis").outputAssets,
    ].join("\n")

    expect(skill?.label).toBe("对标选题池")
    expect(skill?.prompt).toContain("30 条可直接开拍的候选选题")
    expect(skill?.prompt).toContain("5 条 S 级优先选题")
    expect(skill?.prompt).toContain("10 条 A 级连续栏目选题")
    expect(guideText).toContain("S级优先选题")
    expect(guideText).toContain("A级连续栏目选题")
  })

  it("keeps meeting topic skill grounded and able to add execution materials", () => {
    const skill = getAimAgentGuide("business_diagnosis").skills.find((item) => item.id === "meeting_topics")

    expect(skill?.prompt).toContain("单核心选题")
    expect(skill?.prompt).toContain("完整资产包")
    expect(skill?.prompt).toContain("选题 + 执行物料")
    expect(skill?.prompt).toContain("关键信息抽取表")
    expect(skill?.prompt).toContain("至少 12 条")
    expect(skill?.prompt).toContain("不要结尾反问")
  })

  it("keeps skill prompts actionable and aligned with labels", () => {
    for (const agent of AIM_AGENT_OPTIONS) {
      for (const skill of getAimAgentGuide(agent.id).skills) {
        if (skill.workbenchAction) continue
        expect(skill.prompt.trim()).toBeTruthy()
        expect(skill.prompt).toContain("请")
      }
    }
  })

  it("keeps single-content retro on content_retro, not business diagnosis", () => {
    const guide = getAimAgentGuide("business_system_diagnosis")
    const businessSystemText = [
      guide.intro,
      ...guide.quickPrompts,
      ...guide.outputAssets,
      ...guide.skills.map((skill) => `${skill.label} ${skill.prompt}`),
    ].join("\n")

    expect(guide.skills.map((s) => s.label)).toEqual(["生意诊断"])
    expect(guide.skills.map((s) => s.label)).not.toContain("内容复盘")
    expect(businessSystemText).not.toContain("飞轮")
    expect(businessSystemText).not.toContain("闭环")

    const retro = getAimAgentGuide("content_retro")
    expect(retro.intro).toContain("数据复盘")
    expect(retro.skills.length).toBeGreaterThan(0)
    expect(retro.skills.map((s) => s.label).join("\n")).toContain("复盘这条内容")
  })

  it("keeps publish plan scheduling on nextActions, not skills", () => {
    const skills = getAimAgentGuide("content_producer").skills
    const publishAction = getAimAgentGuide("content_producer").nextActions.find((a) => a.id === "publish_package")

    expect(skills.find((s) => s.id === "content_fission")).toBeUndefined()
    expect(publishAction?.prompt).toContain("内容排产表")
    expect(publishAction?.prompt).toContain("排产数量只服从用户指令")
    expect(publishAction?.prompt).not.toContain("裂变为短视频")
  })

  it("separates traffic, lead and story purposes without rewrite clutter", () => {
    const skills = getAimAgentGuide("content_producer").skills
    const labels = skills.map((skill) => skill.label)

    expect(labels).not.toContain("改开头钩子")
    expect(labels).not.toContain("重写这版文案")
    expect(labels).not.toContain("借热点写观点")
    const traffic = skills.find((s) => s.id === "traffic_funnel")
    expect(traffic?.prompt).toContain("断裂感")
    const lead = skills.find((s) => s.id === "lead_acquisition")
    expect(lead?.prompt).toContain("评论/私信/领清单/预约其一")
    const story = skills.find((s) => s.id === "general_story")
    expect(story?.prompt).toContain("不强行推产品")
  })

  it("routes persona/story work through the independent general_story skill (still on content_producer)", () => {
    const story = getAimAgentGuide("content_producer").skills.find((s) => s.id === "general_story")

    expect(story?.label).toBe("我要讲故事")
    expect(story?.prompt).toContain("来时路")
    expect(story?.prompt).toContain("置顶视频")
    expect(story?.prompt).toContain("不强行推产品")
    // persona 仍是 content_producer 的 legacy alias，不拆成独立 agent
    expect(getAimAgentGuide("persona")).toBe(getAimAgentGuide("content_producer"))
  })

  it("assigns a group to every skill for UI rendering", () => {
    for (const agent of AIM_AGENT_OPTIONS) {
      for (const skill of getAimAgentGuide(agent.id).skills) {
        expect(skill.group, `${agent.id}/${skill.id} missing group`).toBeTruthy()
      }
    }
  })

  it("folds publish review skills into work_editor while keeping their engine id", () => {
    const skills = getAimAgentGuide("work_editor").skills
    const editSkill = skills.find((skill) => skill.id === "text_polish")
    const fullReview = skills.find((skill) => skill.id === "full_publish_review")
    const publishDecision = skills.find((skill) => skill.id === "publish_decision")

    expect(editSkill).toBeTruthy()
    expect(fullReview).toBeTruthy()
    expect(publishDecision).toBeTruthy()
    // 质检技能挂在作品编辑的技能列表里，但执行引擎仍归 content_review
    expect(fullReview?.agentId).toBe("content_review")
    expect(publishDecision?.agentId).toBe("content_review")
    expect(fullReview?.group).toBe("质检动作")
    expect(publishDecision?.group).toBe("质检动作")
  })

  it("keeps content_review hidden from the visible agent list but still resolvable by guide", () => {
    const reviewAgent = AIM_AGENT_OPTIONS.find((agent) => agent.id === "content_review")

    expect(reviewAgent?.hidden).toBe(true)
    expect(listVisibleAimAgents().map((a) => a.id)).toEqual([
      "business_system_diagnosis",
      "business_diagnosis",
      "content_producer",
      "work_editor",
      "content_retro",
    ])
    expect(buildAimAgentHref("content_producer")).toBe("/aim?agent=content_producer")
    expect(buildAimAgentHref("work_editor", { stage: "publish" })).toBe(
      "/aim?agent=work_editor&stage=publish",
    )
    expect(getAimAgentGuide("content_review").intro).toContain("发布质检")
    expect(getAimAgentGuide("content_review").skills.length).toBeGreaterThan(0)
  })

  it("ensures all skill prompts reference context to avoid awkward prefix", () => {
    const CONTEXT_REFS = [
      "当前内容", "当前文案", "当前素材", "当前业务", "当前热点",
      "当前信息", "当前人设", "当前核心", "当前选题", "当前会议",
      "当前对标", "当前商业模式", "当前来时路", "当前人设故事", "当前成稿",
    ]
    for (const agent of AIM_AGENT_OPTIONS) {
      for (const skill of getAimAgentGuide(agent.id).skills) {
        if (skill.workbenchAction) continue
        const hasRef = CONTEXT_REFS.some((ref) => skill.prompt.includes(ref))
        expect(hasRef, `${agent.id}/${skill.id} lacks context ref`).toBe(true)
      }
    }
  })
})
