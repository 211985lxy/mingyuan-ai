/**
 * v2 Quality Regression Test
 *
 * Compares script generation quality between v1 (flat fields) and v2 (3D positioning)
 * IP profiles across 5 industries. Uses real LLM calls.
 *
 * Requires: THEROUTER_API_KEY in environment
 */
import { config } from "dotenv"
import { resolve } from "path"
config({ path: resolve(__dirname, "../../.env") })

import { LLMClient } from "@/lib/llm/client"
LLMClient.reset()

import { describe, expect, it } from "vitest"
import { generateScriptCandidates } from "@/lib/script-generator"
import { buildIpProfilePromptSnapshot } from "@/lib/ip-profile"
import type { StructureBlueprint } from "@/lib/script-generator"

type GenerateScriptParams = Parameters<typeof generateScriptCandidates>[0]
type ScriptTemplateParam = GenerateScriptParams["template"]
type ScriptIpProfileParam = NonNullable<GenerateScriptParams["ipProfile"]>
type PromptSnapshotProfileParam = Parameters<typeof buildIpProfilePromptSnapshot>[0]

// ─── Env guard ─────────────────────────────────────────────

const HAS_API_KEY = !!process.env.THEROUTER_API_KEY
const describeIfKey = HAS_API_KEY ? describe : describe.skip

// ─── Shared fixtures ────────────────────────────────────────

const STRUCTURE = {
  displayName: "共情代入法",
  blueprint: {
    openingPattern: "共情提问",
    narrativeBeats: ["共情开场", "痛点放大", "解决方案", "信任背书", "行动号召"],
    evidenceSlots: 2,
    ctaSlot: "评论引导",
    durationRange: { min: 30, max: 60 },
  } as StructureBlueprint,
}

const TEMPLATE = {
  id: "quality-test-template",
  displayName: "通用口播",
  description: "通用短视频口播模板",
  scriptTemplate: "请围绕以下主题创作一段口播文案：{topic}",
  hookType: "empathy",
  variables: [{ key: "topic", label: "主题", required: true }],
  expressionBlueprint: null,
}

// ─── Industry fixture type ──────────────────────────────────

interface IndustryFixture {
  name: string
  briefInputs: Record<string, string>
  v1Profile: {
    displayName: string
    nickname: string | null
    industry: string
    primaryOffer: string
    targetAudience: string
    ipTraits: string
    toneOfVoice: string
    proofPoints: string
    callToAction: string
    promptSnapshot: string
    profileVersion?: number
    business?: unknown
    persona?: unknown
    content?: unknown
  }
  v2Profile: {
    displayName: string
    nickname: string | null
    industry: string | null
    primaryOffer: string | null
    targetAudience: string | null
    ipTraits: string | null
    toneOfVoice: string | null
    proofPoints: string | null
    callToAction: string | null
    promptSnapshot: string
    profileVersion: number
    business: unknown
    persona: unknown
    content: unknown
  }
}

// ─── Industry fixtures ──────────────────────────────────────

const INDUSTRIES: IndustryFixture[] = [
  // 1. 空调维修
  {
    name: "空调维修",
    briefInputs: { topic: "夏天空调不制冷的三大原因" },
    v1Profile: {
      displayName: "王师傅",
      nickname: "空调王",
      industry: "空调维修",
      primaryOffer: "快速上门维修空调，24小时服务",
      targetAudience: "中小商户老板和家庭用户",
      ipTraits: "经验丰富、实操型、讲真话",
      toneOfVoice: "老师傅唠嗑式、接地气、不忽悠",
      proofPoints: "15年从业经验，维修过5000+台空调",
      callToAction: "评论区留下你的空调型号，我免费帮你诊断",
      promptSnapshot: "", // computed below
      profileVersion: 1,
    },
    v2Profile: {
      displayName: "王师傅",
      nickname: "空调王",
      industry: null,
      primaryOffer: null,
      targetAudience: null,
      ipTraits: null,
      toneOfVoice: null,
      proofPoints: null,
      callToAction: null,
      promptSnapshot: "", // computed below
      profileVersion: 2,
      business: {
        core: "空调维修专家",
        audience: "中小商户老板和家庭用户",
        value: "快速解决制冷问题，24小时上门",
        differentiator: "15年经验+质保一年",
      },
      persona: {
        expertiseLevel: "资深从业者",
        expressionStyle: "老师傅唠嗑式",
        traits: ["经验丰富", "实操型", "讲真话"],
      },
      content: {
        themes: [
          { name: "维修技巧", ratio: 40 },
          { name: "避坑指南", ratio: 30 },
          { name: "客户案例", ratio: 30 },
        ],
        formats: ["真人出镜", "数字人"],
        rhythm: "每周3更",
      },
    },
  },

  // 2. 餐饮
  {
    name: "餐饮",
    briefInputs: { topic: "小餐馆提升翻台率的三个实用技巧" },
    v1Profile: {
      displayName: "张老板",
      nickname: "餐饮老张",
      industry: "餐饮",
      primaryOffer: "帮小餐馆老板提升经营效益，减少亏损",
      targetAudience: "准备开店或已开店的小餐馆老板",
      ipTraits: "实战派、不讲虚的、踩过坑、现在赚钱了",
      toneOfVoice: "老板朋友式、直接、有干货、偶尔拆解同行套路",
      proofPoints: "开餐馆12年，管理过5家门店，月流水最高破百万",
      callToAction: "评论区说你开的是什么餐厅，我给你出具体的提升方案",
      promptSnapshot: "", // computed below
      profileVersion: 1,
    },
    v2Profile: {
      displayName: "张老板",
      nickname: "餐饮老张",
      industry: null,
      primaryOffer: null,
      targetAudience: null,
      ipTraits: null,
      toneOfVoice: null,
      proofPoints: null,
      callToAction: null,
      promptSnapshot: "", // computed below
      profileVersion: 2,
      business: {
        core: "餐饮经营顾问",
        audience: "准备开店或已开店的小餐馆老板",
        value: "用实战方法提升翻台率和利润率",
        differentiator: "12年亲身经营经验，非理论派",
      },
      persona: {
        expertiseLevel: "资深从业者",
        expressionStyle: "直给型",
        traits: ["实战派", "不讲虚的", "踩过坑", "现在赚钱了"],
      },
      content: {
        themes: [
          { name: "经营技巧", ratio: 40 },
          { name: "踩坑复盘", ratio: 30 },
          { name: "成功案例", ratio: 30 },
        ],
        formats: ["真人出镜", "混剪"],
        rhythm: "每周4更",
      },
    },
  },

  // 3. 电商
  {
    name: "电商",
    briefInputs: { topic: "新手做电商选品最容易犯的三个错误" },
    v1Profile: {
      displayName: "李姐",
      nickname: "电商李姐",
      industry: "电商",
      primaryOffer: "电商选品和运营策略指导，帮新手少走弯路",
      targetAudience: "想做电商副业或全职的新手卖家",
      ipTraits: "数据驱动、踩坑无数、只讲实操、拒绝割韭菜",
      toneOfVoice: "大姐姐式、亲切不装、讲真话、有时候会揭行业黑幕",
      proofPoints: "做电商8年，单品最高月销5000件，孵化过3个细分类目爆款",
      callToAction: "评论区告诉我你想做哪个类目，我帮你分析选品逻辑",
      promptSnapshot: "", // computed below
      profileVersion: 1,
    },
    v2Profile: {
      displayName: "李姐",
      nickname: "电商李姐",
      industry: null,
      primaryOffer: null,
      targetAudience: null,
      ipTraits: null,
      toneOfVoice: null,
      proofPoints: null,
      callToAction: null,
      promptSnapshot: "", // computed below
      profileVersion: 2,
      business: {
        core: "电商选品运营专家",
        audience: "想做电商副业或全职的新手卖家",
        value: "用数据选品策略帮新手快速起盘，少交学费",
        differentiator: "8年实战+类目爆款孵化经验，非课程贩卖者",
      },
      persona: {
        expertiseLevel: "行业专家",
        expressionStyle: "温和型",
        traits: ["数据驱动", "踩坑无数", "只讲实操", "拒绝割韭菜"],
      },
      content: {
        themes: [
          { name: "选品方法论", ratio: 35 },
          { name: "运营踩坑", ratio: 35 },
          { name: "案例拆解", ratio: 30 },
        ],
        formats: ["真人出镜", "数字人"],
        rhythm: "每周3更",
      },
    },
  },

  // 4. 教育
  {
    name: "教育",
    briefInputs: { topic: "孩子注意力不集中的根本原因和解决方法" },
    v1Profile: {
      displayName: "陈老师",
      nickname: "专注力陈老师",
      industry: "教育",
      primaryOffer: "儿童专注力训练，帮助6-12岁孩子提升学习效率",
      targetAudience: "有6-12岁孩子、担心孩子学习效率的家长",
      ipTraits: "科学方法、有耐心、不贩卖焦虑、真实案例多",
      toneOfVoice: "专业温和式、以理服人、给家长实际可操作的方法",
      proofPoints: "儿童心理学硕士，辅导过1000+孩子，成功率超80%",
      callToAction: "评论区说你孩子的年龄和具体表现，我给你定制训练方案",
      promptSnapshot: "", // computed below
      profileVersion: 1,
    },
    v2Profile: {
      displayName: "陈老师",
      nickname: "专注力陈老师",
      industry: null,
      primaryOffer: null,
      targetAudience: null,
      ipTraits: null,
      toneOfVoice: null,
      proofPoints: null,
      callToAction: null,
      promptSnapshot: "", // computed below
      profileVersion: 2,
      business: {
        core: "儿童专注力训练专家",
        audience: "有6-12岁孩子、担心孩子学习效率的家长",
        value: "用科学方法帮孩子建立专注力，提升学习效率",
        differentiator: "儿童心理学背景+1000+成功案例，不贩卖焦虑",
      },
      persona: {
        expertiseLevel: "行业专家",
        expressionStyle: "专业型",
        traits: ["科学方法", "有耐心", "不贩卖焦虑", "真实案例多"],
      },
      content: {
        themes: [
          { name: "专注力方法", ratio: 40 },
          { name: "家长误区", ratio: 30 },
          { name: "成功案例", ratio: 30 },
        ],
        formats: ["真人出镜", "数字人"],
        rhythm: "每周3更",
      },
    },
  },

  // 5. 健身
  {
    name: "健身",
    briefInputs: { topic: "上班族每天只有30分钟如何高效减脂" },
    v1Profile: {
      displayName: "赵教练",
      nickname: "减脂赵教练",
      industry: "健身",
      primaryOffer: "忙碌上班族的高效减脂方案，不需要大量时间",
      targetAudience: "25-40岁、工作忙没时间健身但想减脂的上班族",
      ipTraits: "科学减脂、反对极端节食、注重可持续、有温度",
      toneOfVoice: "教练陪跑式、鼓励为主、实操第一、数据说话",
      proofPoints: "国家体能训练师认证，帮助500+学员成功减脂，平均减脂8斤",
      callToAction: "评论区说你的身高体重和作息时间，我给你制定专属方案",
      promptSnapshot: "", // computed below
      profileVersion: 1,
    },
    v2Profile: {
      displayName: "赵教练",
      nickname: "减脂赵教练",
      industry: null,
      primaryOffer: null,
      targetAudience: null,
      ipTraits: null,
      toneOfVoice: null,
      proofPoints: null,
      callToAction: null,
      promptSnapshot: "", // computed below
      profileVersion: 2,
      business: {
        core: "上班族高效减脂专家",
        audience: "25-40岁、工作忙没时间健身但想减脂的上班族",
        value: "30分钟高效训练方案，可持续减脂不反弹",
        differentiator: "国家认证体能师+500+成功案例，反对极端方法",
      },
      persona: {
        expertiseLevel: "行业专家",
        expressionStyle: "温和型",
        traits: ["科学减脂", "反对极端节食", "注重可持续", "有温度"],
      },
      content: {
        themes: [
          { name: "减脂方法", ratio: 40 },
          { name: "饮食误区", ratio: 30 },
          { name: "学员案例", ratio: 30 },
        ],
        formats: ["真人出镜", "混剪"],
        rhythm: "每周4更",
      },
    },
  },
]

// ─── Compute promptSnapshots before tests ───────────────────

for (const fixture of INDUSTRIES) {
  fixture.v1Profile.promptSnapshot = buildIpProfilePromptSnapshot(fixture.v1Profile as PromptSnapshotProfileParam)
  fixture.v2Profile.promptSnapshot = buildIpProfilePromptSnapshot(fixture.v2Profile as PromptSnapshotProfileParam)
}

// ─── Tests ───────────────────────────────────────────────────

describeIfKey("v2 quality regression", () => {
  for (const industry of INDUSTRIES) {
    it(`${industry.name}: v2 scores >= v1 scores (within 5-point tolerance)`, { timeout: 120_000 }, async () => {
      const v1Result = await generateScriptCandidates({
        template: TEMPLATE as ScriptTemplateParam,
        inputs: industry.briefInputs,
        ipProfile: industry.v1Profile as ScriptIpProfileParam,
        structure: STRUCTURE,
      })

      const v2Result = await generateScriptCandidates({
        template: TEMPLATE as ScriptTemplateParam,
        inputs: industry.briefInputs,
        ipProfile: industry.v2Profile as ScriptIpProfileParam,
        structure: STRUCTURE,
      })

      // Both should produce 3 candidates
      expect(v1Result.candidates.length).toBe(3)
      expect(v2Result.candidates.length).toBe(3)

      // Both should have non-empty scripts
      for (const c of v1Result.candidates) {
        expect(c.length).toBeGreaterThan(50)
      }
      for (const c of v2Result.candidates) {
        expect(c.length).toBeGreaterThan(50)
      }

      // v2 best score should be within 5 points of v1 best score
      const v1BestScore = Math.max(...v1Result.scores.map(s => s.overall))
      const v2BestScore = Math.max(...v2Result.scores.map(s => s.overall))

      // v2 should score at least v1 - 5 (5-point tolerance for LLM variance)
      expect(v2BestScore).toBeGreaterThanOrEqual(v1BestScore - 5)

      // Both should pass minimum quality threshold
      expect(v1BestScore).toBeGreaterThanOrEqual(40)
      expect(v2BestScore).toBeGreaterThanOrEqual(40)

      // Log for human review
      console.log(`[${industry.name}] v1 best: ${v1BestScore}, v2 best: ${v2BestScore}, delta: ${v2BestScore - v1BestScore}`)
    })
  }
})
