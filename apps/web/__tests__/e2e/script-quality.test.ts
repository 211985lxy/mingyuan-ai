/**
 * Script Quality Integration Test
 *
 * Calls the real 3-step LLM pipeline (meta-prompt → script creation → AI scoring)
 * to verify that generated scripts meet quality thresholds across different
 * structure × template combinations.
 *
 * Requires: THEROUTER_API_KEY in environment
 */
import { config } from "dotenv"
import { resolve } from "path"
// Load real .env so we have THEROUTER_API_KEY
config({ path: resolve(__dirname, "../../.env") })

// Reset LLM singleton so it picks up the loaded env vars
import { LLMClient } from "@/lib/llm/client"
LLMClient.reset()

import { describe, expect, it } from "vitest"
import { generateScriptCandidates } from "@/lib/script-generator"
import type { StructureBlueprint } from "@/lib/script-generator"

// ─── Test fixtures ──────────────────────────────────────────

const IP_PROFILE = {
  displayName: "老吴",
  nickname: "老吴说茶",
  industry: "茶叶零售",
  primaryOffer: "源头直采口粮茶，性价比优选",
  targetAudience: "25-45岁想喝好茶但怕踩坑的消费者",
  ipTraits: "不讲玄学、性价比把控、行业半透明、敢说真话、做长期生意、不割韭菜",
  toneOfVoice: "朋友聊天式、理性不装、真诚不忽悠、偶尔避坑拆解",
  proofPoints: "从业10年、走访过核心产区、服务1000+客户",
  callToAction: "评论区按预算+用途告诉我（办公/送礼/养生），我直接给你配单",
  promptSnapshot: [
    "你正在为个人 IP「老吴」创作文案。",
    "行业：茶叶零售",
    "主营内容：源头直采口粮茶，性价比优选",
    "目标受众：25-45岁想喝好茶但怕踩坑的消费者",
    "IP特征：不讲玄学、性价比把控、行业半透明、敢说真话、做长期生意、不割韭菜",
    "表达口吻：朋友聊天式、理性不装、真诚不忽悠、偶尔避坑拆解",
    "可信背书：从业10年、走访过核心产区、服务1000+客户",
    "行动号召：评论区按预算+用途告诉我（办公/送礼/养生），我直接给你配单",
  ].join("\n"),
}

const STRUCTURES: Record<string, { displayName: string; blueprint: StructureBlueprint }> = {
  empathy: {
    displayName: "共情代入法",
    blueprint: {
      openingPattern: "共情提问",
      narrativeBeats: ["共情开场", "痛点放大", "解决方案", "信任背书", "行动号召"],
      evidenceSlots: 2,
      ctaSlot: "评论引导",
      durationRange: { min: 30, max: 60 },
    },
  },
  contrast: {
    displayName: "对比反差法",
    blueprint: {
      openingPattern: "反常识冲击",
      narrativeBeats: ["反常识开场", "正反对比", "真相揭示", "专业建议", "行动号召"],
      evidenceSlots: 2,
      ctaSlot: "私信咨询",
      durationRange: { min: 30, max: 60 },
    },
  },
  story: {
    displayName: "故事叙述法",
    blueprint: {
      openingPattern: "故事引入",
      narrativeBeats: ["故事开场", "冲突展开", "转折揭示", "经验总结", "行动号召"],
      evidenceSlots: 1,
      ctaSlot: "关注引导",
      durationRange: { min: 40, max: 90 },
    },
  },
}

const TEMPLATES: Record<string, {
  id: string
  displayName: string
  description: string
  scriptTemplate: string
  hookType: string
  variables: { key: string; label: string; placeholder: string; required: boolean; type: "text" }[]
}> = {
  teaProduct: {
    id: "tpl-tea-product",
    displayName: "茶叶产品种草",
    description: "适合推广具体茶叶产品，突出性价比和品质",
    scriptTemplate: "在{{city}}，很多人想喝好茶但总怕买贵了。{{brandName}}主打{{serviceType}}，核心优势是{{coreAdvantage}}。{{offer}}",
    hookType: "price",
    variables: [
      { key: "city", label: "城市", placeholder: "如：广州", required: true, type: "text" },
      { key: "brandName", label: "品牌名", placeholder: "如：老吴茶铺", required: true, type: "text" },
      { key: "serviceType", label: "服务类型", placeholder: "如：源头直采口粮茶", required: true, type: "text" },
      { key: "coreAdvantage", label: "核心优势", placeholder: "如：产区直连，没有中间商", required: true, type: "text" },
      { key: "offer", label: "优惠", placeholder: "如：首单立减30元", required: false, type: "text" },
    ],
  },
  healthKnowledge: {
    id: "tpl-health-knowledge",
    displayName: "健康知识科普",
    description: "适合分享健康饮茶知识，建立专业权威",
    scriptTemplate: "{{healthPoint}}，{{badHabit}}导致{{consequence}}。作为{{role}}，从业{{years}}年，我建议{{advice}}。{{symptom}}的朋友尤其要注意，{{actionAdvice}}。",
    hookType: "authority",
    variables: [
      { key: "healthPoint", label: "健康知识点", placeholder: "如：80%的人维生素D不足", required: true, type: "text" },
      { key: "badHabit", label: "不良习惯", placeholder: "如：长期久坐不运动", required: true, type: "text" },
      { key: "consequence", label: "后果", placeholder: "如：腰椎间盘突出", required: true, type: "text" },
      { key: "role", label: "职业身份", placeholder: "如：茶叶品鉴师", required: true, type: "text" },
      { key: "years", label: "从业年限", placeholder: "如：15", required: true, type: "text" },
      { key: "advice", label: "建议", placeholder: "如：每天站立活动至少30分钟", required: true, type: "text" },
      { key: "symptom", label: "症状", placeholder: "如：腰酸背痛", required: false, type: "text" },
      { key: "actionAdvice", label: "行动建议", placeholder: "如：建议尽早就医检查", required: false, type: "text" },
    ],
  },
}

const INPUTS: Record<string, Record<string, string>> = {
  teaProduct: {
    city: "广州",
    brandName: "老吴茶铺",
    serviceType: "源头直采口粮茶",
    coreAdvantage: "产区直连没有中间商，50元以内喝到干净好茶",
    offer: "新客首单送试饮装",
  },
  healthKnowledge: {
    healthPoint: "长期喝劣质茶比不喝茶伤害更大",
    badHabit: "随便在超市买便宜茶叶",
    consequence: "农残超标、重金属富集",
    role: "茶叶品鉴师",
    years: "10",
    advice: "认准核心产区、看工艺透明度",
    symptom: "喝完肠胃不适",
    actionAdvice: "建议选口粮茶认准产区直采",
  },
}

// ─── Tests ──────────────────────────────────────────────────

const MIN_SCORE = 60

describe("Script Quality - Real LLM Pipeline", () => {
  // Test each structure × template combination
  const testCases = [
    { structure: "empathy", template: "teaProduct", label: "共情代入法 × 茶叶种草" },
    { structure: "contrast", template: "teaProduct", label: "对比反差法 × 茶叶种草" },
    { structure: "story", template: "healthKnowledge", label: "故事叙述法 × 健康科普" },
    { structure: "contrast", template: "healthKnowledge", label: "对比反差法 × 健康科普" },
  ]

  for (const tc of testCases) {
    it(
      `${tc.label}: all scripts score >= ${MIN_SCORE}`,
      { timeout: 120_000 },
      async () => {
        const result = await generateScriptCandidates({
          template: TEMPLATES[tc.template],
          inputs: INPUTS[tc.template],
          ipProfile: IP_PROFILE,
          structure: STRUCTURES[tc.structure],
        })

        console.log(`\n━━━ ${tc.label} ━━━`)
        console.log(`Model: ${result.model}`)
        console.log(`Degraded: ${result.isDegraded}`)

        for (let i = 0; i < result.candidates.length; i++) {
          const score = result.scores[i]
          const preview = result.candidates[i].slice(0, 80) + "..."
          console.log(`\n[Script ${i + 1}] Score: ${score.overall}`)
          console.log(`  structural=${score.structuralCompliance} brief=${score.viewpointClarity} evidence=${score.evidenceStrength} cta=${score.ctaClarity} voice=${score.voiceFit} length=${score.lengthInRange}`)
          console.log(`  Preview: ${preview}`)

          // Script should not contain structural metadata
          expect(result.candidates[i]).not.toMatch(/本条文案采用/)
          expect(result.candidates[i]).not.toMatch(/^【[^】]+】/)
        }

        // All scripts should score above threshold
        const scores = result.scores.map((s) => s.overall)
        console.log(`\nScores: ${scores.join(", ")}`)

        expect(result.candidates.length).toBe(3)
        const expectedMinScore = result.isDegraded ? 50 : MIN_SCORE
        for (const score of result.scores) {
          expect(score.overall).toBeGreaterThanOrEqual(expectedMinScore)
        }

        // Scripts should be different from each other (diversity check)
        const [s1, s2, s3] = result.candidates
        expect(s1).not.toBe(s2)
        expect(s2).not.toBe(s3)
        expect(s1).not.toBe(s3)

        // First 10 chars should differ (different openings)
        const openings = result.candidates.map((c) => c.slice(0, 10))
        const uniqueOpenings = new Set(openings)
        expect(uniqueOpenings.size).toBeGreaterThanOrEqual(2)
      },
    )
  }
})
