import type { Prisma, PrismaClient } from "../src/generated/prisma/client"

// ─── 12 Golden Elements (TOPIC-01) ──────────────────────

export const TOPIC_ELEMENTS = [
  { code: "cost", name: "低成本", typeLabel: "痛点解决", description: "强调省钱、性价比、避免浪费，让观众觉得「不用花大钱也能解决问题」", conflictCodes: ["authority", "emotion"], sortOrder: 1 },
  { code: "authority", name: "权威背书", typeLabel: "信任建立", description: "用专家身份、资质认证、行业经验等权威信号建立可信度", conflictCodes: ["cost", "identity"], sortOrder: 2 },
  { code: "curiosity", name: "好奇驱动", typeLabel: "注意力钩子", description: "用悬念、反常识、未知答案激发观众「想知道结果」的冲动", conflictCodes: ["trust"], sortOrder: 3 },
  { code: "trust", name: "信任铺垫", typeLabel: "信任建立", description: "通过真实案例、用户见证、过程展示降低观众的心理防线", conflictCodes: ["curiosity"], sortOrder: 4 },
  { code: "emotion", name: "情绪共鸣", typeLabel: "情感连接", description: "用共情、故事、场景还原触动观众的情绪开关", conflictCodes: ["cost"], sortOrder: 5 },
  { code: "identity", name: "身份认同", typeLabel: "情感连接", description: "让观众觉得「这说的就是我」，通过圈层标签和生活场景建立归属感", conflictCodes: ["authority"], sortOrder: 6 },
  { code: "novelty", name: "新奇刺激", typeLabel: "注意力钩子", description: "用新方法、新视角、新发现打破观众的信息疲劳", conflictCodes: [], sortOrder: 7 },
  { code: "practical", name: "实用干货", typeLabel: "价值交付", description: "直接给方法、给步骤、给工具，让观众觉得「学到了」", conflictCodes: [], sortOrder: 8 },
  { code: "social", name: "社交货币", typeLabel: "传播驱动", description: "让内容值得分享：有趣、有用、有谈资，观众愿意转发给朋友", conflictCodes: [], sortOrder: 9 },
  { code: "scarcity", name: "稀缺紧迫", typeLabel: "行动驱动", description: "通过限时、限量、限定条件制造「现在不行动就来不及」的紧迫感", conflictCodes: [], sortOrder: 10 },
  { code: "story", name: "故事叙事", typeLabel: "情感连接", description: "用起承转合的叙事弧线包裹信息，让硬信息变成软故事", conflictCodes: [], sortOrder: 11 },
  { code: "contrast", name: "对比反差", typeLabel: "注意力钩子", description: "通过前后对比、正反对比、预期与现实的反差制造记忆锚点", conflictCodes: [], sortOrder: 12 },
] as const

// ─── 7 Opening Types (TOPIC-02) — 七大爆款开头 ─────────

export const OPENING_TYPES = [
  {
    code: "curiosity_open",
    name: "好奇类开场",
    description: "用体验提问、假设推演或反常结果激发观众好奇心，让「想知道答案」成为回看与收藏的驱动力",
    formulas: [
      "{话题}是一种什么体验？",
      "如何不{代价}也能{结果}？",
      "如果你{假设条件}，你会怎么样？",
      "为什么{其他人}{做法}，却{意外结果}？",
    ],
    examples: [
      { title: "素食体验", script: "10年不吃肉，只吃素食，你的身体会发生什么样的变化？" },
      { title: "低成本豪宅", script: "月薪3000住豪华大别墅是怎样的一个体验？" },
    ],
    sortOrder: 1,
  },
  {
    code: "leverage_open",
    name: "借势类开场",
    description: "借用名人、热剧、热点事件的流量和关注度，将观众的好奇心自然引导到你的内容上",
    formulas: [
      "曾经被{名人}{事件}，如今却{反转结果}",
      "{热门话题}大火，我却只关心里面的{细节}",
      "{名人/明星}都在用的{产品/方法}",
    ],
    examples: [
      { title: "明星身材", script: "繁花大火了，但是我却只关注胡歌的身材，他怎么保持这么好？" },
      { title: "大佬书单", script: "张一鸣创业初期读的这本书，建议你收藏起来慢慢看" },
    ],
    sortOrder: 2,
  },
  {
    code: "pain_open",
    name: "痛点类开场",
    description: "直接说出目标观众的困境和不甘，用精准的痛点描述让观众觉得「这说的就是我」",
    formulas: [
      "为什么{你/对方}{努力}，却{不好结果}？",
      "不知道{知识点}一定要{行动}！",
      "{领域}最新{变化}，你不会不知道吧？",
    ],
    examples: [
      { title: "职场困境", script: "为什么你的闺蜜没有你优秀，却比你混得好？" },
      { title: "行业新规", script: "电商最新规则变了，你不会还不知道吧？" },
    ],
    sortOrder: 3,
  },
  {
    code: "extreme_open",
    name: "极限类开场",
    description: "用「全网最」「99%的人不知道」等极限化表达制造信息稀缺感，触发观众的收藏和观看冲动",
    formulas: [
      "这是全网最{极限描述}的{主题}",
      "一定要{行动}！",
      "99%的人都不知道的{秘密/方法}",
    ],
    examples: [
      { title: "喝水技巧", script: "99%的人都不知道这样喝水更解渴" },
      { title: "网红小区", script: "杭州最多网红住的小区就是这里" },
    ],
    sortOrder: 4,
  },
  {
    code: "fear_open",
    name: "恐吓类开场",
    description: "用「千万不要」「再不XX就会XX」等警示句式制造紧迫感，让观众因担心错过或踩坑而停留",
    formulas: [
      "揭秘！千万不要{危险行为}",
      "如果你再不{改变}，就会{后果}",
      "{变化}将迎来，赶紧{行动}",
    ],
    examples: [
      { title: "深夜安全", script: "千万不要凌晨2点一个人出门" },
      { title: "熬夜危害", script: "如果你再不改掉熬夜的这个习惯，那你的身体就……" },
    ],
    sortOrder: 5,
  },
  {
    code: "contrast_open",
    name: "反差类开场",
    description: "用违反常识的对比或出人意料的能力反差制造认知冲突，让观众因好奇「为什么」而继续观看",
    formulas: [
      "你知道{A}，却不知道{B}",
      "我能{做到A}，却不能{做到B}",
      "他只需要{小代价}，就能{大结果}",
    ],
    examples: [
      { title: "躺赚秘密", script: "我为什么每天躺着还能够财富自由？" },
      { title: "吃瘦方法", script: "你只知道运动能瘦，却不知道吃饭也能瘦" },
    ],
    sortOrder: 6,
  },
  {
    code: "benefit_open",
    name: "利益输送开场",
    description: "直接展示解决方案带来的好处或效果，用「没想到XXX就能XXX」让观众觉得看完就能受益",
    formulas: [
      "没想到{简单方法}就可以{好结果}",
      "有了{工具/方法}再也不用{痛苦行为}",
    ],
    examples: [
      { title: "颈椎偏方", script: "没想到这么睡觉治好了我20年的颈椎病" },
      { title: "护肤捷径", script: "有了这个方法，再也不用花大价钱去美容院了" },
    ],
    sortOrder: 7,
  },
] as const

// Old opening type codes to clean up during migration
const DEPRECATED_OPENING_CODES = [
  "suspense_open", "contrast_hook", "pain_resonance", "proof_first",
  "identity_call", "question_challenge", "story_hook",
]

// ─── 9 Copy Structures (TOPIC-03) ───────────────────────

export const COPY_STRUCTURES = [
  {
    code: "suspense_reveal",
    name: "悬念递延法",
    description: "先抛结果或疑问，把答案延后几个节拍揭开，提升复访与后段留存",
    beats: [
      { label: "悬念抛出", instruction: "用一个有信息缺口的句子开场，让观众产生「想知道答案」的冲动" },
      { label: "背景铺垫", instruction: "简要交代背景或问题的严重性，加强观众继续看的动力" },
      { label: "逐步揭示", instruction: "分2-3个层次逐步揭开答案，每层都要有新信息增量" },
      { label: "核心揭晓", instruction: "给出最关键的答案或方法，要有「原来如此」的顿悟感" },
      { label: "行动引导", instruction: "基于揭晓的内容引导观众下一步行动" },
    ],
    caseStudy: [{ title: "空调省电法", outline: "90%人不知道的按钮 → 电费为什么高 → 三个步骤 → 节能模式揭秘 → 试试看" }],
    sortOrder: 1,
  },
  {
    code: "contrast_hook",
    name: "反差钩子法",
    description: "先给观众一个和常识相反的句子或画面，再快速完成解释和转化",
    beats: [
      { label: "反差开场", instruction: "用一个打破常识的陈述或对比制造认知冲突" },
      { label: "冲突放大", instruction: "解释为什么大多数人的认知是错的，放大冲突感" },
      { label: "真相重构", instruction: "给出正确的理解方式，让观众有「被刷新」的感觉" },
      { label: "行动转化", instruction: "基于新认知引导观众采取行动" },
    ],
    caseStudy: [{ title: "健身真相", outline: "跑步让人老更快 → 有氧误区 → 正确运动方式 → 开始改变" }],
    sortOrder: 2,
  },
  {
    code: "three_beat_ramp",
    name: "三拍递进法",
    description: "把关键信息拆成三个连续节拍，每一拍都比上一拍更有价值",
    beats: [
      { label: "第一拍:基础", instruction: "给出最基础但有用的第一个要点，建立「有干货」的预期" },
      { label: "第二拍:进阶", instruction: "给出比第一点更深入的第二个要点，提升价值感" },
      { label: "第三拍:杀手锏", instruction: "给出最核心最有价值的第三个要点，制造「值了」的满足感" },
      { label: "行动收尾", instruction: "总结三个要点并引导行动" },
    ],
    caseStudy: [{ title: "开店三件事", outline: "选址看人流 → 装修看动线 → 定价看心理 → 记住这三点" }],
    sortOrder: 3,
  },
  {
    code: "proof_first",
    name: "现场证明法",
    description: "先给观众看过程、细节或结果，让证据先于解释出现",
    beats: [
      { label: "证据展示", instruction: "先展示最有说服力的结果或过程画面" },
      { label: "细节拆解", instruction: "拆解证据中的关键细节，增强可信度" },
      { label: "方法解释", instruction: "解释实现这个结果的方法或原因" },
      { label: "结果强化", instruction: "再次强调结果，并与观众建立关联" },
      { label: "信任转化", instruction: "基于已建立的信任引导下一步" },
    ],
    caseStudy: [{ title: "护肤效果", outline: "看这皮肤 → 28天前的样子 → 用了什么方法 → 现在的状态 → 你也可以" }],
    sortOrder: 4,
  },
  {
    code: "pain_solution",
    name: "痛点解药法",
    description: "先准确描述痛点场景和感受，再提供解决方案",
    beats: [
      { label: "痛点描述", instruction: "用具体场景还原观众的痛苦体验，让他们觉得「说的就是我」" },
      { label: "痛因分析", instruction: "解释痛点产生的真实原因，给观众新的理解" },
      { label: "方案呈现", instruction: "给出针对痛因的解决方案，要具体可执行" },
      { label: "效果预期", instruction: "描述执行方案后的改善效果" },
      { label: "行动引导", instruction: "引导观众开始执行第一步" },
    ],
    caseStudy: [{ title: "失眠解决", outline: "翻来覆去睡不着 → 不是你的问题是方法错了 → 478呼吸法 → 一周见效 → 今晚试试" }],
    sortOrder: 5,
  },
  {
    code: "pov_walkthrough",
    name: "POV带入法",
    description: "让观众像跟着你一起经历和观察一个过程",
    beats: [
      { label: "场景进入", instruction: "用第一人称或第二人称带观众进入场景" },
      { label: "过程观察", instruction: "一步步展示过程中的关键节点" },
      { label: "发现时刻", instruction: "在过程中制造一个「注意到了吗？」的发现点" },
      { label: "结果揭示", instruction: "展示过程的最终结果" },
      { label: "引导跟随", instruction: "邀请观众也来体验同样的过程" },
    ],
    caseStudy: [{ title: "探店体验", outline: "跟我来看 → 先看环境 → 注意这个细节 → 最终效果 → 你也来试试" }],
    sortOrder: 6,
  },
  {
    code: "objection_dialogue",
    name: "对话碰撞法",
    description: "先把观众心里的质疑说出来，再用回应完成说服",
    beats: [
      { label: "质疑提出", instruction: "代替观众说出他们最可能的质疑或反对意见" },
      { label: "初步回应", instruction: "用事实或逻辑回应第一层质疑" },
      { label: "深层质疑", instruction: "提出更深层的质疑，让观众觉得你很坦诚" },
      { label: "核心化解", instruction: "用最有力的证据或逻辑化解深层质疑" },
      { label: "共识引导", instruction: "在化解质疑后建立共识并引导行动" },
    ],
    caseStudy: [{ title: "价格质疑", outline: "「太贵了吧」→ 算笔账 → 「便宜的不靠谱」→ 品质对比 → 值不值你说了算" }],
    sortOrder: 7,
  },
  {
    code: "before_after",
    name: "对比翻转法",
    description: "把旧状态和新状态并列，让变化本身成为说服力",
    beats: [
      { label: "旧状态展示", instruction: "展示改变前的真实状态，要具体可感" },
      { label: "问题定位", instruction: "指出旧状态中的核心问题" },
      { label: "新状态展示", instruction: "展示改变后的状态，制造视觉或感受上的强反差" },
      { label: "差异归因", instruction: "解释造成这个变化的关键因素" },
      { label: "行动转化", instruction: "引导观众也去实现同样的改变" },
    ],
    caseStudy: [{ title: "店铺改造", outline: "改造前冷清 → 问题在动线 → 改造后排队 → 就改了这一点 → 你的店也可以" }],
    sortOrder: 8,
  },
  {
    code: "universal",
    name: "通用结构",
    description: "适用于任何主题的通用文案结构，灵活度最高",
    beats: [
      { label: "开场吸引", instruction: "用任意有效方式吸引观众注意力" },
      { label: "核心内容", instruction: "清晰表达核心信息或价值" },
      { label: "收尾转化", instruction: "引导观众采取下一步行动" },
    ],
    caseStudy: [{ title: "通用示例", outline: "吸引注意 → 传递价值 → 引导行动" }],
    sortOrder: 9,
  },
] as const

// ─── 4 Ending Types (TOPIC-04) ──────────────────────────

export const ENDING_TYPES = [
  {
    code: "interactive",
    name: "互动引导式",
    description: "通过提问、投票、评论引导等方式激发观众互动，提升评论区活跃度",
    guidance: "在结尾设置一个低门槛的互动问题或行动指令。问题要具体（不要问「你觉得呢」），要让观众容易回答（比如选A还是选B）。可以用「评论区告诉我」「在评论区打1」等直接指令。",
    patterns: [
      "你觉得{选项A}还是{选项B}？评论区告诉我",
      "如果你也{行为}，在评论区打{数字}",
      "你最想知道{主题}的哪个部分？评论区留言，下期安排",
    ],
    sortOrder: 1,
  },
  {
    code: "empathy",
    name: "共情收尾式",
    description: "用情感共鸣收尾，让观众带着情绪离开，提升收藏和转发",
    guidance: "结尾要回到观众的情感层面，用「我理解你」「我也经历过」的姿态收尾。避免说教，用温度代替力度。可以用祝福、鼓励、陪伴感来结束。",
    patterns: [
      "我知道{困境}不容易，但{鼓励}",
      "希望每个{身份}都能{美好愿望}",
      "你不是一个人在{状态}，{陪伴性语言}",
    ],
    sortOrder: 2,
  },
  {
    code: "slogan",
    name: "金句收尾式",
    description: "用一句有力的总结金句收尾，制造记忆锚点和传播素材",
    guidance: "结尾金句要简短有力（10字以内最佳），最好有节奏感或对仗。金句要和视频核心观点直接相关，不要用泛泛的人生哲理。可以重复说两遍加深印象。",
    patterns: [
      "记住：{核心金句}",
      "{金句}，{金句重复或变体}",
      "一句话总结：{简短金句}",
    ],
    sortOrder: 3,
  },
  {
    code: "reversal",
    name: "反转收尾式",
    description: "在结尾制造一个小反转或意外，让观众重新回味整个视频",
    guidance: "在结尾揭示一个之前没提到的信息、角度或结果，让观众产生「原来还有这层意思」的感觉。反转要和主题相关，不要为反转而反转。轻微反转比剧烈反转更适合营销内容。",
    patterns: [
      "不过你可能没想到，{反转信息}",
      "其实真正的原因是{意外角度}",
      "但故事到这里还没结束，{后续信息}",
    ],
    sortOrder: 4,
  },
] as const

// ─── Seed Functions ─────────────────────────────────────

async function seedTopicElements(prisma: PrismaClient) {
  for (const el of TOPIC_ELEMENTS) {
    await prisma.topicElement.upsert({
      where: { code: el.code },
      update: {
        name: el.name,
        typeLabel: el.typeLabel,
        description: el.description,
        conflictCodes: [...el.conflictCodes] as Prisma.InputJsonValue,
        sortOrder: el.sortOrder,
        status: "published",
      },
      create: {
        code: el.code,
        name: el.name,
        typeLabel: el.typeLabel,
        description: el.description,
        conflictCodes: [...el.conflictCodes] as Prisma.InputJsonValue,
        sortOrder: el.sortOrder,
        status: "published",
      },
    })
  }
  console.log(`  ✓ Upserted ${TOPIC_ELEMENTS.length} topic elements`)
}

async function seedOpeningTypes(prisma: PrismaClient) {
  // Clean up deprecated opening types from previous version
  const deleted = await prisma.openingType.deleteMany({
    where: { code: { in: DEPRECATED_OPENING_CODES } },
  })
  if (deleted.count > 0) {
    console.log(`  ✓ Removed ${deleted.count} deprecated opening types`)
  }

  for (const ot of OPENING_TYPES) {
    await prisma.openingType.upsert({
      where: { code: ot.code },
      update: {
        name: ot.name,
        description: ot.description,
        formulas: [...ot.formulas] as Prisma.InputJsonValue,
        examples: [...ot.examples] as Prisma.InputJsonValue,
        sortOrder: ot.sortOrder,
        status: "published",
      },
      create: {
        code: ot.code,
        name: ot.name,
        description: ot.description,
        formulas: [...ot.formulas] as Prisma.InputJsonValue,
        examples: [...ot.examples] as Prisma.InputJsonValue,
        sortOrder: ot.sortOrder,
        status: "published",
      },
    })
  }
  console.log(`  ✓ Upserted ${OPENING_TYPES.length} opening types`)
}

async function seedCopyStructures(prisma: PrismaClient) {
  for (const cs of COPY_STRUCTURES) {
    await prisma.copyStructure.upsert({
      where: { code: cs.code },
      update: {
        name: cs.name,
        description: cs.description,
        beats: [...cs.beats] as Prisma.InputJsonValue,
        caseStudy: cs.caseStudy as Prisma.InputJsonValue,
        sortOrder: cs.sortOrder,
        status: "published",
      },
      create: {
        code: cs.code,
        name: cs.name,
        description: cs.description,
        beats: [...cs.beats] as Prisma.InputJsonValue,
        caseStudy: cs.caseStudy as Prisma.InputJsonValue,
        sortOrder: cs.sortOrder,
        status: "published",
      },
    })
  }
  console.log(`  ✓ Upserted ${COPY_STRUCTURES.length} copy structures`)
}

async function seedEndingTypes(prisma: PrismaClient) {
  for (const et of ENDING_TYPES) {
    await prisma.endingType.upsert({
      where: { code: et.code },
      update: {
        name: et.name,
        description: et.description,
        guidance: et.guidance,
        patterns: [...et.patterns] as Prisma.InputJsonValue,
        sortOrder: et.sortOrder,
        status: "published",
      },
      create: {
        code: et.code,
        name: et.name,
        description: et.description,
        guidance: et.guidance,
        patterns: [...et.patterns] as Prisma.InputJsonValue,
        sortOrder: et.sortOrder,
        status: "published",
      },
    })
  }
  console.log(`  ✓ Upserted ${ENDING_TYPES.length} ending types`)
}

export async function seedTopicEngine(prisma: PrismaClient) {
  console.log("--- Seeding topic engine...")
  await seedTopicElements(prisma)
  await seedOpeningTypes(prisma)
  await seedCopyStructures(prisma)
  await seedEndingTypes(prisma)
  console.log("--- Topic engine seed complete")
}
