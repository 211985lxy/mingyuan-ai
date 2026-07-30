import { describe, expect, it } from "vitest"

import { AIM_AGENT_OPTIONS, getAimAgent } from "@/lib/aim-ui-config"
import {
  AIM_COPY_VARIANTS,
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

  it("offers the three visible content-production variants", () => {
    const labels = AIM_COPY_VARIANTS.map((variant) => variant.label)
    const guide = getAimAgentGuide("content_producer")

    expect(labels).toEqual(expect.arrayContaining(["独白流", "结论先行", "问答型"]))
    expect(guide.copyVariants?.map((variant) => variant.label)).toEqual(labels)
  })

  it("uses task-based workflow names on the visible agent list", () => {
    expect(getAimAgent("business_system_diagnosis").title).toBe("商业诊断")
    expect(getAimAgent("business_diagnosis").title).toBe("选题策划")
    expect(getAimAgent("content_producer").title).toBe("内容创作")
    expect(getAimAgent("work_editor").title).toBe("作品编辑")
    expect(getAimAgent("content_review").title).toBe("发布质检")
    expect(getAimAgent("persona").title).toBe("人设故事")
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

  it("surfaces high-frequency creation tasks under content writing", () => {
    const guideText = [
      getAimAgentGuide("content_producer").defaultInstruction,
      ...getAimAgentGuide("content_producer").quickPrompts,
      ...getAimAgentGuide("content_producer").outputAssets,
    ].join("\n")

    expect(guideText).toContain("改写")
    expect(guideText).toContain("对标再创作")
    expect(guideText).toContain("追热点")
    expect(guideText).toContain("获客文案")
    expect(guideText).toContain("公众号文章/深度长文")
    expect(guideText).toContain("Vlog 分镜脚本")
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
    expect(action?.prompt).toContain("12 条内容排产表")
    expect(action?.prompt).toContain("序号、选题标题、核心钩子、内容角度、适合平台/形式、发布话题、承接动作")
    expect(action?.prompt).toContain("品牌/IP/账号相关话题")
  })

  it("resolves the legacy ip_video alias to the content_producer guide (backward compat)", () => {
    const canonical = getAimAgentGuide("content_producer")
    const aliased = getAimAgentGuide("ip_video")

    expect(aliased).toBe(canonical)
  })

  it("defines the high-frequency content producer skills", () => {
    const labels = getAimAgentGuide("content_producer").skills.map((skill) => skill.label)

    expect(labels).toEqual(expect.arrayContaining([
      "改开头钩子",
      "重写这版文案",
      "按爆款逻辑重写",
      "借热点写观点",
      "口播脚本",
      "生成小红书图文",
      "生成获客成交文案",
      "内容裂变",
    ]))
  })

  it("adds a unified oral script skill with type-based routing", () => {
    const guide = getAimAgentGuide("content_producer")
    const skill = guide.skills.find((item) => item.id === "oral_script")
    const guideText = [guide.defaultInstruction, ...guide.quickPrompts].join("\n")

    expect(skill?.label).toBe("口播脚本")
    expect(skill?.prompt).toContain("类型 A")
    expect(skill?.prompt).toContain("类型 B")
    expect(skill?.prompt).toContain("类型 C")
    expect(skill?.prompt).toContain("类型 D")
    expect(skill?.prompt).toContain("适配度")
    expect(skill?.prompt).toContain("不得照抄原句")
    expect(skill?.prompt).toContain("3-5 条")
    expect(skill?.prompt).toContain("前 3 秒钩子")
    expect(skill?.prompt).toContain("镜头表现建议")
    expect(skill?.prompt).toContain("结尾行动引导")
    expect(guideText).toContain("热点口播")
    expect(guideText).toContain("参考同行文案")
  })

  it("keeps oral script and xiaohongshu skills tied to their methodology", () => {
    const guide = getAimAgentGuide("content_producer")
    const oralScript = guide.skills.find((item) => item.id === "oral_script")
    const xhs = guide.skills.find((item) => item.id === "xiaohongshu_image_text")

    expect(oralScript?.prompt).toContain("事件内容化五步法")
    expect(oralScript?.prompt).toContain("真实事件 -> 关键矛盾 -> 核心观点 -> 用户价值 -> 内容表达")
    expect(xhs?.prompt).toContain("小红书图文视觉导演结构")
    expect(xhs?.prompt).toContain("8 页图文结构")
    expect(xhs?.prompt).toContain("品牌/IP/账号相关标签")
  })

  it("defines topic planning and review skills", () => {
    const planningLabels = getAimAgentGuide("business_diagnosis").skills.map((skill) => skill.label)
    expect(planningLabels.slice(0, 4)).toEqual([
      "选择对标账号 / 对标内容",
      "按目的生成选题",
      "按主线生成选题池",
      "筛选高潜选题",
    ])
    expect(planningLabels).toContain("判断这条值不值得做")

    const reviewLabels = getAimAgentGuide("content_review").skills.map((skill) => skill.label)
    expect(reviewLabels).toEqual(expect.arrayContaining([
      "标题质检",
      "开头钩子质检",
      "内容结构质检",
      "人设一致性质检",
      "平台适配质检",
      "转化路径质检",
      "风险表达质检",
      "发布前判断",
    ]))
  })

  it("keeps topic goals decided before copywriting", () => {
    const purposeSkill = getAimAgentGuide("business_diagnosis").skills.find((item) => item.id === "purpose_topics")

    expect(purposeSkill?.prompt).toContain("曝光/获客/信任/成交")
    expect(purposeSkill?.prompt).toContain("不要直接写文案")
    expect(purposeSkill?.prompt).toContain("为什么不是另外三个目的")
  })

  it("adds a benchmark-asset flywheel skill for topic planning", () => {
    const skill = getAimAgentGuide("business_diagnosis").skills.find((item) => item.id === "benchmark_asset_flywheel")
    const guideText = [
      ...getAimAgentGuide("business_diagnosis").quickPrompts,
      ...getAimAgentGuide("business_diagnosis").outputAssets,
    ].join("\n")

    expect(skill?.label).toBe("对标资产生成选题池")
    expect(skill?.prompt).toContain("30 条可直接开拍的候选选题")
    expect(skill?.prompt).toContain("5 条 S 级优先选题")
    expect(skill?.prompt).toContain("10 条 A 级连续栏目选题")
    expect(guideText).toContain("S级优先选题")
    expect(guideText).toContain("A级连续栏目选题")
  })

  it("keeps meeting-minutes topic skill grounded and non-generic", () => {
    const skill = getAimAgentGuide("business_diagnosis").skills.find((item) => item.id === "meeting_minutes_topics")

    expect(skill?.prompt).toContain("单核心选题")
    expect(skill?.prompt).toContain("完整资产包")
    expect(skill?.prompt).toContain("关键信息抽取表")
    expect(skill?.prompt).toContain("至少 12 条")
    expect(skill?.prompt).toContain("不要结尾反问")
  })

  it("keeps skill prompts actionable and aligned with labels", () => {
    for (const agent of AIM_AGENT_OPTIONS) {
      for (const skill of getAimAgentGuide(agent.id).skills) {
        expect(skill.prompt.trim()).toBeTruthy()
        expect(skill.prompt).toContain("请")
      }
    }
  })

  it("keeps single-content retro out of business diagnosis (moved to a future retro agent)", () => {
    const businessSystemText = [
      getAimAgentGuide("business_system_diagnosis").intro,
      ...getAimAgentGuide("business_system_diagnosis").quickPrompts,
      ...getAimAgentGuide("business_system_diagnosis").outputAssets,
      ...getAimAgentGuide("business_system_diagnosis").skills.map((skill) => `${skill.label} ${skill.prompt}`),
    ].join("\n")

    expect(businessSystemText).not.toContain("数据复盘")
    expect(businessSystemText).not.toContain("飞轮")
    expect(businessSystemText).not.toContain("闭环")
  })

  it("separates content fission from publish plan scheduling", () => {
    const fission = getAimAgentGuide("content_producer").skills.find((s) => s.id === "content_fission")
    const publishAction = getAimAgentGuide("content_producer").nextActions.find((a) => a.id === "publish_package")

    // 裂变技能不输出排产表
    expect(fission?.prompt).toContain("不要输出排产表")
    expect(fission?.prompt).toContain("生成发布计划")
    // 发布计划 nextAction 承担排产职责
    expect(publishAction?.prompt).toContain("12 条内容排产表")
    // 发布计划不再做平台裂变（与 content_fission 职责分离）
    expect(publishAction?.prompt).not.toContain("裂变为短视频")
  })

  it("disambiguates hot topic opinion from oral script", () => {
    const hotTopic = getAimAgentGuide("content_producer").skills.find((s) => s.id === "hot_topic_copy")
    const oralScript = getAimAgentGuide("content_producer").skills.find((s) => s.id === "oral_script")

    // 热点观点明确声明不是口播
    expect(hotTopic?.label).toBe("借热点写观点")
    expect(hotTopic?.prompt).toContain("不是口播脚本")
    expect(hotTopic?.group).toBe("改写优化")
    // 口播脚本保持独立分组
    expect(oralScript?.group).toBe("热点口播")
  })

  it("requires persona progress check before generating pinned video", () => {
    const skill = getAimAgentGuide("persona").skills.find((s) => s.id === "pinned_story_video")

    expect(skill?.prompt).toContain("6 维尚未收齐")
    expect(skill?.prompt).toContain("进度未到 100%")
    expect(skill?.prompt).toContain("追问最关键的一个缺口")
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
    const titleReview = skills.find((skill) => skill.id === "title_review")
    const publishDecision = skills.find((skill) => skill.id === "publish_decision")

    expect(editSkill).toBeTruthy()
    expect(titleReview).toBeTruthy()
    expect(publishDecision).toBeTruthy()
    // 质检技能挂在作品编辑的技能列表里，但执行引擎仍归 content_review
    expect(titleReview?.agentId).toBe("content_review")
    expect(publishDecision?.agentId).toBe("content_review")
    expect(titleReview?.group).toBe("单项质检")
    expect(publishDecision?.group).toBe("综合判断")
  })

  it("keeps content_review hidden from the visible agent list but still resolvable by guide", () => {
    const reviewAgent = AIM_AGENT_OPTIONS.find((agent) => agent.id === "content_review")

    expect(reviewAgent?.hidden).toBe(true)
    expect(getAimAgentGuide("content_review").intro).toContain("发布质检")
    expect(getAimAgentGuide("content_review").skills.length).toBeGreaterThan(0)
  })

  it("ensures all skill prompts reference context to avoid awkward prefix", () => {
    const CONTEXT_REFS = [
      "当前内容", "当前文案", "当前素材", "当前业务", "当前热点",
      "当前信息", "当前人设", "当前核心", "当前选题", "当前会议",
      "当前对标", "当前商业模式", "当前来时路", "当前人设故事",
    ]
    for (const agent of AIM_AGENT_OPTIONS) {
      for (const skill of getAimAgentGuide(agent.id).skills) {
        const hasRef = CONTEXT_REFS.some((ref) => skill.prompt.includes(ref))
        expect(hasRef, `${agent.id}/${skill.id} lacks context ref`).toBe(true)
      }
    }
  })
})
