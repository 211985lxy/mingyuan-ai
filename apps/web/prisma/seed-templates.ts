import { Prisma } from "../src/generated/prisma/client"
import type { PrismaClient } from "../src/generated/prisma/client"
import type { ContentType, ExpressionBlueprint, TemplateVariable } from "../src/types/content-template"

interface CanonicalContentTemplateSeed {
  name: string
  displayName: string
  description: string
  scriptTemplate: string
  expressionBlueprint: ExpressionBlueprint
  variables: TemplateVariable[]
  hookType: string
  contentType: ContentType
  tags: string[]
  hotTopicKeywords: string[]
  featured?: boolean
}

const SHARED_FIELDS = {
  industry: [] as string[],
  seasonalEvents: [] as Array<{ id: string; startDate: string; endDate: string }>,
} as const

export const GENERIC_EXPRESSION_TEMPLATES: CanonicalContentTemplateSeed[] = [
  {
    name: "problem-solution",
    displayName: "痛点解决",
    description: "先把用户的不舒服说准，再给出一条可信、可执行的解决路径。",
    scriptTemplate:
      "如果你正被{{painPoint}}困住，先别急着乱试。很多{{targetAudience}}之所以迟迟没结果，往往是因为一直在{{commonMistake}}。真正更有效的做法，是先{{solution}}。如果你想少走弯路，这次我给出的方案是{{offer}}。",
    expressionBlueprint: {
      argumentPattern: "problem_solution",
      proofBurden: "medium",
      ctaStyle: "consult",
      hotTopicModes: ["bridge_angle", "reactive_commentary"],
      recommendedStructures: ["pain-resonance", "contrast-hook"],
    },
    variables: [
      { key: "targetAudience", label: "目标对象", placeholder: "如：想提升到店转化的老板", required: true, type: "text" },
      { key: "painPoint", label: "核心痛点", placeholder: "如：流量不少，但就是没人下单", required: true, type: "textarea" },
      { key: "commonMistake", label: "常见误区", placeholder: "如：只顾着打折，没有先讲清价值", required: true, type: "textarea" },
      { key: "solution", label: "关键解法", placeholder: "如：先用一个明确场景把需求讲透，再给具体动作", required: true, type: "textarea" },
      { key: "offer", label: "本次动作/方案", placeholder: "如：评论区留言，我把完整方案发你", required: true, type: "text" },
    ],
    hookType: "pain",
    contentType: "problem_solution",
    tags: ["共鸣", "解法", "转化"],
    hotTopicKeywords: ["问题", "困扰", "为什么", "怎么解决"],
    featured: true,
  },
  {
    name: "how-to-steps",
    displayName: "教程步骤",
    description: "把一件事拆成清晰步骤，让用户马上获得可执行感。",
    scriptTemplate:
      "今天直接教你怎么把{{desiredOutcome}}做出来。第一步先{{stepOne}}，第二步再{{stepTwo}}，第三步一定记得{{stepThree}}。很多人最后没做成，往往就卡在{{keyTip}}。如果你想继续照着做，{{offer}}。",
    expressionBlueprint: {
      argumentPattern: "how_to",
      proofBurden: "medium",
      ctaStyle: "save",
      hotTopicModes: ["bridge_angle", "timely_offer"],
      recommendedStructures: ["three-beat-ramp", "proof-first"],
    },
    variables: [
      { key: "desiredOutcome", label: "目标结果", placeholder: "如：拍出更容易成交的短视频", required: true, type: "text" },
      { key: "stepOne", label: "步骤一", placeholder: "如：先确定只讲一个核心动作", required: true, type: "textarea" },
      { key: "stepTwo", label: "步骤二", placeholder: "如：把证明素材按顺序排好", required: true, type: "textarea" },
      { key: "stepThree", label: "步骤三", placeholder: "如：结尾给一个明确行动口令", required: true, type: "textarea" },
      { key: "keyTip", label: "关键提醒", placeholder: "如：别一上来讲太多背景", required: true, type: "textarea" },
      { key: "offer", label: "收尾动作", placeholder: "如：先收藏，照着拍一条试试", required: true, type: "text" },
    ],
    hookType: "curiosity",
    contentType: "tutorial",
    tags: ["教程", "步骤", "可执行"],
    hotTopicKeywords: ["教程", "攻略", "方法", "步骤"],
    featured: true,
  },
  {
    name: "listicle-recommendation",
    displayName: "清单推荐",
    description: "把重点整理成 3-5 条，让用户快速理解和记住。",
    scriptTemplate:
      "如果你正在考虑{{listTitle}}，这 3 点先记住。第一，{{itemOne}}。第二，{{itemTwo}}。第三，{{itemThree}}。很多人一开始抓不住重点，其实只要先看这三件事就够了。想省时间，{{offer}}。",
    expressionBlueprint: {
      argumentPattern: "listicle",
      proofBurden: "medium",
      ctaStyle: "save",
      hotTopicModes: ["bridge_angle", "reactive_commentary"],
      recommendedStructures: ["three-beat-ramp", "loopback-close"],
    },
    variables: [
      { key: "listTitle", label: "清单主题", placeholder: "如：选模板、做引流、提高成交", required: true, type: "text" },
      { key: "itemOne", label: "条目一", placeholder: "如：先选最适合当前目标的表达逻辑", required: true, type: "textarea" },
      { key: "itemTwo", label: "条目二", placeholder: "如：一定要让证明素材跟上", required: true, type: "textarea" },
      { key: "itemThree", label: "条目三", placeholder: "如：结尾只给一个明确动作", required: true, type: "textarea" },
      { key: "offer", label: "收尾动作", placeholder: "如：收藏这条，后面逐条对照", required: true, type: "text" },
    ],
    hookType: "question",
    contentType: "listicle",
    tags: ["清单", "条理", "好记"],
    hotTopicKeywords: ["清单", "盘点", "推荐", "必看"],
    featured: true,
  },
  {
    name: "hero-offer",
    displayName: "爆款主推",
    description: "聚焦一个主产品或主服务，把注意力全部收敛到它的核心价值上。",
    scriptTemplate:
      "今天我只主推一个{{heroOffer}}。不是因为它最便宜，而是因为它最能解决{{targetAudience}}在{{usageScenario}}里的真实问题。它最值得先看的地方，是{{bestSellingPoint}}。如果你现在就要做决定，我给你的理由是{{reasonToBuy}}。想进一步了解，{{offer}}。",
    expressionBlueprint: {
      argumentPattern: "hero_offer",
      proofBurden: "medium",
      ctaStyle: "buy",
      hotTopicModes: ["timely_offer", "bridge_angle"],
      recommendedStructures: ["contrast-hook", "visual-gimmick"],
    },
    variables: [
      { key: "heroOffer", label: "主推对象", placeholder: "如：这套短视频代拍服务", required: true, type: "text" },
      { key: "targetAudience", label: "目标对象", placeholder: "如：没有时间自己出镜的老板", required: true, type: "text" },
      { key: "usageScenario", label: "使用场景", placeholder: "如：需要连续稳定发视频时", required: true, type: "text" },
      { key: "bestSellingPoint", label: "最强卖点", placeholder: "如：从结构到包装一条链帮你定好", required: true, type: "textarea" },
      { key: "reasonToBuy", label: "此刻该行动的原因", placeholder: "如：现在先把第一条跑通，比继续观望更值", required: true, type: "textarea" },
      { key: "offer", label: "收尾动作", placeholder: "如：私信我，我把具体方案给你", required: true, type: "text" },
    ],
    hookType: "effect",
    contentType: "hero_offer",
    tags: ["主推", "聚焦", "成交"],
    hotTopicKeywords: ["爆款", "抢手", "上新", "回归"],
    featured: true,
  },
  {
    name: "social-proof",
    displayName: "社会证明",
    description: "先讲很多人已经选择，再讲为什么值得你继续看。",
    scriptTemplate:
      "这不是一个没人知道的小众选择。光是{{socialProof}}，就足够说明很多人已经在认真看它。大家愿意买单，不是因为跟风，而是因为{{reasonWhyPopular}}。如果你现在也在犹豫，先看清楚这一点：{{decisionSignal}}。想抓住这次机会，{{offer}}。",
    expressionBlueprint: {
      argumentPattern: "social_proof",
      proofBurden: "strong",
      ctaStyle: "buy",
      hotTopicModes: ["timely_offer", "reactive_commentary"],
      recommendedStructures: ["suspense-reveal", "contrast-hook"],
    },
    variables: [
      { key: "socialProof", label: "社会证明", placeholder: "如：连续 3 次售罄、500+ 老客复购", required: true, type: "textarea" },
      { key: "reasonWhyPopular", label: "受欢迎原因", placeholder: "如：把复杂决策直接做成一条工作流", required: true, type: "textarea" },
      { key: "decisionSignal", label: "决策信号", placeholder: "如：如果你最在意效率，这类方案更值得优先看", required: true, type: "textarea" },
      { key: "offer", label: "收尾动作", placeholder: "如：现在留言，我把名额和细节发你", required: true, type: "text" },
    ],
    hookType: "authority",
    contentType: "social_proof",
    tags: ["口碑", "热卖", "信任"],
    hotTopicKeywords: ["售罄", "排队", "回购", "爆单"],
    featured: true,
  },
  {
    name: "testimonial-proof",
    displayName: "真实见证",
    description: "让真实体验者来讲变化和感受，用见证建立信任。",
    scriptTemplate:
      "{{persona}}之前最头疼的，就是{{painPoint}}。后来他之所以愿意尝试，是因为{{whyTry}}。真正让他觉得值的，不只是{{experience}}，而是最后看到了{{result}}。如果你也在类似处境里，这个建议最值得记住：{{recommendationReason}}。想知道怎么开始，{{offer}}。",
    expressionBlueprint: {
      argumentPattern: "testimonial",
      proofBurden: "strong",
      ctaStyle: "consult",
      hotTopicModes: ["bridge_angle", "reactive_commentary"],
      recommendedStructures: ["pain-resonance", "suspense-reveal"],
    },
    variables: [
      { key: "persona", label: "见证人身份", placeholder: "如：一位连锁门店主理人", required: true, type: "text" },
      { key: "painPoint", label: "原始困境", placeholder: "如：拍了很多视频但没什么咨询", required: true, type: "textarea" },
      { key: "whyTry", label: "为什么尝试", placeholder: "如：他需要更稳定的获客入口", required: true, type: "textarea" },
      { key: "experience", label: "真实体验", placeholder: "如：第一次觉得流程终于没那么乱了", required: true, type: "textarea" },
      { key: "result", label: "变化结果", placeholder: "如：一周内就有稳定私信进来", required: true, type: "textarea" },
      { key: "recommendationReason", label: "推荐理由", placeholder: "如：先把可复制流程跑通，比盲目加投更重要", required: true, type: "textarea" },
      { key: "offer", label: "收尾动作", placeholder: "如：如果你也想试，私信我", required: true, type: "text" },
    ],
    hookType: "emotion",
    contentType: "testimonial",
    tags: ["见证", "信任", "案例"],
    hotTopicKeywords: ["反馈", "评价", "真实体验", "复盘"],
    featured: true,
  },
  {
    name: "daily-routine-embed",
    displayName: "日常场景嵌入",
    description: "把价值放回真实生活或工作场景，让用户马上产生代入感。",
    scriptTemplate:
      "我平时在{{dailyScenario}}的时候，最怕的就是{{painPoint}}。后来我把{{solution}}放进这个环节之后，最大的变化就是{{benefit}}。所以如果你也是{{targetAudience}}，真的可以先从这个小动作开始。想把这套做法直接带走，{{offer}}。",
    expressionBlueprint: {
      argumentPattern: "routine_embed",
      proofBurden: "light",
      ctaStyle: "save",
      hotTopicModes: ["bridge_angle", "reactive_commentary"],
      recommendedStructures: ["pov-walkthrough", "loopback-close"],
    },
    variables: [
      { key: "dailyScenario", label: "日常场景", placeholder: "如：每天开店前半小时", required: true, type: "text" },
      { key: "painPoint", label: "场景痛点", placeholder: "如：临时想拍内容但完全没头绪", required: true, type: "textarea" },
      { key: "solution", label: "嵌入动作", placeholder: "如：提前把表达模板和镜头顺序定好", required: true, type: "textarea" },
      { key: "benefit", label: "带来的变化", placeholder: "如：拍摄更顺，产出也更稳定", required: true, type: "textarea" },
      { key: "targetAudience", label: "适用对象", placeholder: "如：需要边做生意边发内容的人", required: true, type: "text" },
      { key: "offer", label: "收尾动作", placeholder: "如：收藏这条，照着安排你的日常流程", required: true, type: "text" },
    ],
    hookType: "audience",
    contentType: "routine_embed",
    tags: ["场景", "代入", "日常"],
    hotTopicKeywords: ["日常", "一天", "上班", "开店"],
    featured: true,
  },
  {
    name: "comparison-choice",
    displayName: "对比选择",
    description: "把两个方案放在一起比较，帮用户更快做决定。",
    scriptTemplate:
      "很多人现在就在{{optionA}}和{{optionB}}之间犹豫。先别急着选，真正要比较的是{{comparisonDimensions}}。如果你更看重{{priorityPoint}}，那我更建议你选{{recommendedChoice}}。原因不是情绪判断，而是{{why}}。如果你想结合自己的情况判断，{{offer}}。",
    expressionBlueprint: {
      argumentPattern: "comparison",
      proofBurden: "strong",
      ctaStyle: "consult",
      hotTopicModes: ["reactive_commentary", "bridge_angle"],
      recommendedStructures: ["before-after-contrast", "objection-dialogue"],
    },
    variables: [
      { key: "optionA", label: "方案 A", placeholder: "如：自己摸索拍视频", required: true, type: "text" },
      { key: "optionB", label: "方案 B", placeholder: "如：直接用成熟流程起号", required: true, type: "text" },
      { key: "comparisonDimensions", label: "比较维度", placeholder: "如：时间成本、稳定性、出片速度", required: true, type: "textarea" },
      { key: "priorityPoint", label: "优先判断点", placeholder: "如：你现在最缺的是持续输出能力", required: true, type: "textarea" },
      { key: "recommendedChoice", label: "推荐方案", placeholder: "如：先用成熟流程跑第一轮", required: true, type: "text" },
      { key: "why", label: "推荐原因", placeholder: "如：这样更容易先建立正反馈，再做个性化优化", required: true, type: "textarea" },
      { key: "offer", label: "收尾动作", placeholder: "如：留言你的情况，我帮你判断", required: true, type: "text" },
    ],
    hookType: "question",
    contentType: "comparison",
    tags: ["对比", "选择", "决策"],
    hotTopicKeywords: ["对比", "怎么选", "哪个好", "区别"],
    featured: true,
  },
  {
    name: "myth-busting",
    displayName: "误区纠偏",
    description: "指出大众误区，再把正确认知建立起来。",
    scriptTemplate:
      "很多人以为{{wrongBelief}}，但这恰恰是最容易把事情做偏的地方。真正的问题不是表面看起来的那个点，而是{{whyWrong}}。如果你想把结果做对，先把认知改成{{correctView}}。只要这一步改了，后面的{{action}}就会顺很多。",
    expressionBlueprint: {
      argumentPattern: "debunk",
      proofBurden: "medium",
      ctaStyle: "follow",
      hotTopicModes: ["reactive_commentary", "bridge_angle"],
      recommendedStructures: ["contrast-hook", "objection-dialogue"],
    },
    variables: [
      { key: "wrongBelief", label: "常见误解", placeholder: "如：视频发得越多越容易成交", required: true, type: "textarea" },
      { key: "whyWrong", label: "为什么错", placeholder: "如：没有结构和表达逻辑，发再多也只是噪音", required: true, type: "textarea" },
      { key: "correctView", label: "正确认知", placeholder: "如：先跑通一条可复制链路，再放大频率", required: true, type: "textarea" },
      { key: "action", label: "后续动作", placeholder: "如：选模板、补素材、做包装", required: true, type: "textarea" },
    ],
    hookType: "reverse",
    contentType: "debunk",
    tags: ["误区", "纠偏", "认知"],
    hotTopicKeywords: ["误区", "真相", "别再", "避坑"],
  },
  {
    name: "faq-reply",
    displayName: "FAQ 回复",
    description: "用一个真实问题驱动整条视频，把它做成公开答疑。",
    scriptTemplate:
      "昨天有人问我：{{question}}。先给你一个直接回答：{{shortAnswer}}。为什么我会这么判断？关键在于{{reasoning}}。如果你现在也卡在这个问题上，先做这个动作：{{action}}。后面还有类似问题，继续留言给我。",
    expressionBlueprint: {
      argumentPattern: "faq_reply",
      proofBurden: "medium",
      ctaStyle: "comment",
      hotTopicModes: ["reactive_commentary"],
      recommendedStructures: ["suspense-reveal", "objection-dialogue"],
    },
    variables: [
      { key: "question", label: "真实问题", placeholder: "如：小白到底该先学剪辑还是先学文案？", required: true, type: "textarea" },
      { key: "shortAnswer", label: "简短回答", placeholder: "如：先把文案和结构跑顺，再谈复杂剪辑", required: true, type: "textarea" },
      { key: "reasoning", label: "判断依据", placeholder: "如：没有说服逻辑，剪得再花也很难转化", required: true, type: "textarea" },
      { key: "action", label: "建议动作", placeholder: "如：先选一套表达模板，照着拍一条", required: true, type: "textarea" },
    ],
    hookType: "question",
    contentType: "faq_reply",
    tags: ["答疑", "评论", "互动"],
    hotTopicKeywords: ["有人问", "评论区", "到底该不该", "怎么做"],
  },
  {
    name: "before-after-outcome",
    displayName: "Before/After 成果",
    description: "用前后差异直接证明价值，让变化本身成为说服。",
    scriptTemplate:
      "先看之前：{{beforeState}}。再看现在：{{afterState}}。真正让结果翻过去的，不是运气，而是中间做了{{intervention}}。为什么这一招会有效？因为{{whyItWorked}}。如果你也想做出这样的变化，{{offer}}。",
    expressionBlueprint: {
      argumentPattern: "before_after",
      proofBurden: "strong",
      ctaStyle: "consult",
      hotTopicModes: ["bridge_angle", "timely_offer"],
      recommendedStructures: ["before-after-contrast", "proof-first"],
    },
    variables: [
      { key: "beforeState", label: "之前状态", placeholder: "如：视频发了很多，但几乎没有咨询", required: true, type: "textarea" },
      { key: "afterState", label: "之后状态", placeholder: "如：开始稳定收到高质量私信", required: true, type: "textarea" },
      { key: "intervention", label: "中间动作", placeholder: "如：把表达模板和包装流程一起重做", required: true, type: "textarea" },
      { key: "whyItWorked", label: "有效原因", placeholder: "如：它同时解决了内容和呈现两端的问题", required: true, type: "textarea" },
      { key: "offer", label: "收尾动作", placeholder: "如：私信我，我把方法拆给你", required: true, type: "text" },
    ],
    hookType: "effect",
    contentType: "before_after",
    tags: ["变化", "成果", "对比"],
    hotTopicKeywords: ["前后对比", "逆袭", "变化", "提升"],
  },
  {
    name: "behind-scenes",
    displayName: "幕后透明",
    description: "把用户平时看不到的过程摊开来，用透明换信任。",
    scriptTemplate:
      "很多人只看到结果，但真正决定结果的，往往是这段看不见的过程：{{process}}。这里面最容易被忽略的，是{{hiddenWork}}。为什么我愿意把它摊开讲？因为这恰恰决定了{{qualityReason}}。如果你想把标准做出来，{{offer}}。",
    expressionBlueprint: {
      argumentPattern: "behind_scenes",
      proofBurden: "medium",
      ctaStyle: "follow",
      hotTopicModes: ["reactive_commentary", "bridge_angle"],
      recommendedStructures: ["proof-first", "pov-walkthrough"],
    },
    variables: [
      { key: "process", label: "幕后过程", placeholder: "如：一条视频从脚本到包装的真实流程", required: true, type: "textarea" },
      { key: "hiddenWork", label: "隐藏工作", placeholder: "如：前面要先把结构、表达和素材角色定清楚", required: true, type: "textarea" },
      { key: "qualityReason", label: "为什么决定结果", placeholder: "如：这会直接影响后面能不能稳定出片", required: true, type: "textarea" },
      { key: "offer", label: "收尾动作", placeholder: "如：关注我，后面继续拆给你看", required: true, type: "text" },
    ],
    hookType: "curiosity",
    contentType: "behind_scenes",
    tags: ["幕后", "透明", "真实"],
    hotTopicKeywords: ["幕后", "流程", "怎么做", "制作"],
  },
  {
    name: "buying-decision",
    displayName: "选购决策",
    description: "帮助用户判断怎么买、怎么选、先看哪些标准。",
    scriptTemplate:
      "如果你现在正准备{{decisionContext}}，先别急着拍板。真正该先看的是{{criteriaOne}}、{{criteriaTwo}}，以及{{criteriaThree}}。很多人最后踩坑，通常都是忽略了{{commonPitfall}}。如果要我先给一个建议，那就是{{recommendation}}。想少走弯路，{{offer}}。",
    expressionBlueprint: {
      argumentPattern: "buying_guide",
      proofBurden: "medium",
      ctaStyle: "save",
      hotTopicModes: ["bridge_angle", "reactive_commentary"],
      recommendedStructures: ["three-beat-ramp", "objection-dialogue"],
    },
    variables: [
      { key: "decisionContext", label: "决策场景", placeholder: "如：选一套适合自己的视频起量方案", required: true, type: "text" },
      { key: "criteriaOne", label: "标准一", placeholder: "如：能不能稳定复用", required: true, type: "text" },
      { key: "criteriaTwo", label: "标准二", placeholder: "如：是不是和自己的身份匹配", required: true, type: "text" },
      { key: "criteriaThree", label: "标准三", placeholder: "如：后面能不能持续产出", required: true, type: "text" },
      { key: "commonPitfall", label: "常见坑点", placeholder: "如：只看表面效果，不看链路完整性", required: true, type: "textarea" },
      { key: "recommendation", label: "先给的建议", placeholder: "如：先跑通最简单、最稳定的一套", required: true, type: "textarea" },
      { key: "offer", label: "收尾动作", placeholder: "如：收藏这条，再去对照自己的选择", required: true, type: "text" },
    ],
    hookType: "authority",
    contentType: "buying_guide",
    tags: ["决策", "选择", "标准"],
    hotTopicKeywords: ["怎么选", "避坑", "指南", "建议"],
  },
  {
    name: "trend-bridge",
    displayName: "热点嫁接",
    description: "借一个正在热起来的话题，把用户自然带进你的内容逻辑。",
    scriptTemplate:
      "这两天大家都在聊{{hotTopic}}，但如果你只看热闹，很容易错过真正和你有关的部分。对{{targetAudience}}来说，这件事更值得看的角度其实是{{bridgeAngle}}。因为一旦看懂了这一点，你就会发现{{whyRelevant}}。如果你想把热点变成机会，{{offer}}。",
    expressionBlueprint: {
      argumentPattern: "trend_bridge",
      proofBurden: "light",
      ctaStyle: "comment",
      hotTopicModes: ["bridge_angle", "timely_offer", "reactive_commentary"],
      recommendedStructures: ["contrast-hook", "suspense-reveal"],
    },
    variables: [
      { key: "hotTopic", label: "热点事件", placeholder: "如：某个刷屏话题或热议新闻", required: true, type: "text" },
      { key: "targetAudience", label: "相关对象", placeholder: "如：想借内容获客的线下老板", required: true, type: "text" },
      { key: "bridgeAngle", label: "借势角度", placeholder: "如：别只看热度，要看背后的消费情绪", required: true, type: "textarea" },
      { key: "whyRelevant", label: "为什么相关", placeholder: "如：这会直接影响用户最近的注意力和决策逻辑", required: true, type: "textarea" },
      { key: "offer", label: "收尾动作", placeholder: "如：想借这波热点，留言我来帮你拆", required: true, type: "text" },
    ],
    hookType: "curiosity",
    contentType: "trend_bridge",
    tags: ["热点", "借势", "相关性"],
    hotTopicKeywords: ["热点", "热搜", "刷屏", "热议"],
  },
  {
    name: "case-breakdown",
    displayName: "案例拆解",
    description: "拿一个具体案例，拆出里面可复用的方法和判断。",
    scriptTemplate:
      "今天拆一个案例：{{caseSummary}}。这件事之所以值得看，不只是结果，而是中间做对了{{keyMove}}。为什么这个动作有效？因为{{whyItWorked}}。如果你也想借这个案例学会方法，先记住这句：{{takeaway}}。想看我继续拆类似案例，{{offer}}。",
    expressionBlueprint: {
      argumentPattern: "case_breakdown",
      proofBurden: "strong",
      ctaStyle: "follow",
      hotTopicModes: ["reactive_commentary", "bridge_angle"],
      recommendedStructures: ["proof-first", "three-beat-ramp"],
    },
    variables: [
      { key: "caseSummary", label: "案例概述", placeholder: "如：一个门店账号从零到稳定获客的过程", required: true, type: "textarea" },
      { key: "keyMove", label: "关键动作", placeholder: "如：先重做表达模板，再补齐包装证明", required: true, type: "textarea" },
      { key: "whyItWorked", label: "有效原因", placeholder: "如：让内容和呈现终于形成闭环", required: true, type: "textarea" },
      { key: "takeaway", label: "复用结论", placeholder: "如：先复制一条能跑通的链路，再做个性化扩展", required: true, type: "textarea" },
      { key: "offer", label: "收尾动作", placeholder: "如：关注我，后面继续拆真实案例", required: true, type: "text" },
    ],
    hookType: "authority",
    contentType: "case_breakdown",
    tags: ["案例", "拆解", "复用"],
    hotTopicKeywords: ["案例", "复盘", "拆解", "方法论"],
  },
  {
    name: "founder-opinion",
    displayName: "主理人观点",
    description: "由主理人、创始人或专家直接输出判断，建立人格化信任。",
    scriptTemplate:
      "今天我想直接讲一个判断：{{coreView}}。为什么我现在要讲这件事？因为最近我一直在看到{{whyNow}}。站在{{speakerIdentity}}这个位置上，我越来越确定，真正值得坚持的不是表面动作，而是{{supportingReason}}。如果你也在考虑这件事，{{offer}}。",
    expressionBlueprint: {
      argumentPattern: "founder_opinion",
      proofBurden: "medium",
      ctaStyle: "follow",
      hotTopicModes: ["reactive_commentary", "bridge_angle"],
      recommendedStructures: ["objection-dialogue", "pain-resonance"],
    },
    variables: [
      { key: "speakerIdentity", label: "发言身份", placeholder: "如：做了 8 年本地获客的主理人", required: true, type: "text" },
      { key: "coreView", label: "核心观点", placeholder: "如：小老板做短视频，先要追求稳定而不是炫技", required: true, type: "textarea" },
      { key: "whyNow", label: "现在为什么讲", placeholder: "如：太多人还在被碎片化建议带着跑", required: true, type: "textarea" },
      { key: "supportingReason", label: "支撑理由", placeholder: "如：只有稳定链路，才有资格谈放大和创新", required: true, type: "textarea" },
      { key: "offer", label: "收尾动作", placeholder: "如：如果你认同，先关注我", required: true, type: "text" },
    ],
    hookType: "authority",
    contentType: "founder_opinion",
    tags: ["观点", "主理人", "人格"],
    hotTopicKeywords: ["观点", "判断", "为什么", "别再"],
  },
]

export const CANONICAL_CONTENT_TEMPLATE_NAMES = GENERIC_EXPRESSION_TEMPLATES.map(
  (template) => template.name,
)

export async function syncCanonicalContentTemplates(
  prisma: PrismaClient,
  options: { archiveLegacy?: boolean } = {},
) {
  for (const [index, template] of GENERIC_EXPRESSION_TEMPLATES.entries()) {
    const templateData = {
      displayName: template.displayName,
      description: template.description,
      scriptTemplate: template.scriptTemplate,
      expressionBlueprint: template.expressionBlueprint as unknown as Prisma.InputJsonValue,
      variables: template.variables as unknown as Prisma.InputJsonValue,
      hookType: template.hookType,
      industry: SHARED_FIELDS.industry as unknown as Prisma.InputJsonValue,
      contentType: template.contentType,
      tags: template.tags as unknown as Prisma.InputJsonValue,
      hotTopicKeywords: template.hotTopicKeywords as unknown as Prisma.InputJsonValue,
      seasonalEvents: SHARED_FIELDS.seasonalEvents as unknown as Prisma.InputJsonValue,
      status: "published" as const,
      sortOrder: GENERIC_EXPRESSION_TEMPLATES.length - index,
      featured: template.featured ?? index < 8,
      publishedAt: new Date(),
      archivedAt: null,
    }

    const existing = await prisma.contentTemplate.findFirst({
      where: { name: template.name },
      select: { id: true },
    })

    if (existing) {
      await prisma.contentTemplate.update({
        where: { id: existing.id },
        data: templateData,
      })
      continue
    }

    await prisma.contentTemplate.create({
      data: {
        name: template.name,
        createdBy: "seed",
        ...templateData,
      },
    })
  }

  let archivedCount = 0
  if (options.archiveLegacy) {
    const archived = await prisma.contentTemplate.updateMany({
      where: {
        name: { notIn: CANONICAL_CONTENT_TEMPLATE_NAMES },
        createdBy: "seed",
        status: { in: ["published", "draft"] },
      },
      data: {
        status: "archived",
        archivedAt: new Date(),
      },
    })
    archivedCount = archived.count
  }

  return {
    upserted: GENERIC_EXPRESSION_TEMPLATES.length,
    archived: archivedCount,
  }
}

export async function seedTemplates(prisma: PrismaClient) {
  const result = await syncCanonicalContentTemplates(prisma, { archiveLegacy: true })
  console.log(
    `✓ Upserted ${result.upserted} content templates${result.archived > 0 ? `, archived ${result.archived} legacy seed templates` : ""}`,
  )
}
