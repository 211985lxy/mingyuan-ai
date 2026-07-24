/**
 * IP 操盘方法论卡片注册表。
 * runtime 默认只注入匹配卡片，不再整包塞进 prompt。
 */

export type MethodologyBusinessGoal =
  | "traffic"
  | "lead"
  | "trust"
  | "convert"
  | "brand"
  | "unclear"

export type MethodologyContentRoute =
  | "persona_trust"
  | "point_of_view"
  | "problem_solve"
  | "case_convert"

export type MethodologyLocalOptimize =
  | "hook"
  | "title"
  | "ending"
  | "structure"
  | "oral"

export type MethodologyCardKind =
  | "business_goal"
  | "content_route"
  | "local_optimize"
  | "toolbox"
  | "stage"

export interface MethodologyCard {
  id: string
  title: string
  kind: MethodologyCardKind
  goals: MethodologyBusinessGoal[]
  triggers: string[]
  structureModules: string[]
  promptBody: string
  antiPatterns: string[]
  priority: number
}

export const IP_COPYWRITING_CARDS: MethodologyCard[] = [
  {
    id: "card.traffic",
    title: "流量型视频",
    kind: "business_goal",
    goals: ["traffic", "brand"],
    triggers: ["流量", "起号", "破圈", "曝光", "涨粉", "播放", "引流", "品牌曝光", "品宣"],
    structureModules: ["强停留开头", "具体场景承接", "小招数或判断标准", "中段断裂感", "评论点或关注理由"],
    promptBody: `适用：起号、破圈、扩大曝光。
核心：用更低理解成本换更高停留，不是炫技巧。
结构：强开头制造停留 → 具体场景承接 → 把抽象观点译成小招数/动作/标准 → 中段制造断裂感 → 结尾留评论点或关注理由。
常用开头：好奇/痛点/反差/恐吓/利益。
禁忌：一上来介绍自己；只讲大道理无场景；机械三点式；为流量吸来不买单的人。`,
    antiPatterns: ["大家好我是", "赋能", "三点式课件感", "只追播放量"],
    priority: 10,
  },
  {
    id: "card.lead_gen",
    title: "线索获客视频",
    kind: "business_goal",
    goals: ["lead"],
    triggers: [
      "获客", "线索", "留资", "私信", "预约", "诊断", "咨询", "陪跑", "高客单",
      "筛选客户", "精准客户", "招商", "企业服务",
    ],
    structureModules: ["客户代价", "常见误判", "小切口判断标准", "场景或案例证据", "单一低摩擦CTA"],
    promptBody: `适用：高客单服务、咨询、陪跑、招商、企业服务。
核心：不是为了爆款，而是让有真实问题、真实投入、真实付费意愿的人主动找你。
单条结构：先说代价 → 再说误判 → 给小切口判断标准 → 放场景/案例证明你见过 → 结尾只给一个轻行动（评论关键词/私信/领取清单/预约诊断）。
写前五问（内部）：目标客户是谁；触发场景；当前代价；信任障碍；承接动作。
选题结构可选：代价提醒、误区纠偏、自检清单、案例场景、筛选人群、小方案、诊断入口。
结尾：高客单优先诊断/清单/私域；只保留一个行动；说明行动后能得到什么。
禁忌：只追播放量；高客单写成低客单带货；无私域承接；无线索产品阶梯。`,
    antiPatterns: ["只追播放量", "私信我扫码报名全都要", "所有人都适合"],
    priority: 20,
  },
  {
    id: "card.trust",
    title: "人设信任视频",
    kind: "business_goal",
    goals: ["trust"],
    triggers: ["人设", "信任", "来时路", "价值观", "踩坑", "工作现场", "vlog", "专业经历"],
    structureModules: ["真实处境切入", "经历与判断", "稳定价值观", "故事或案例背书", "站队收束"],
    promptBody: `适用：老板IP、专家IP、顾问型账号。
核心：人设不是自我介绍，而是让用户相信“这件事找你靠谱”。
结构：真实处境切入（禁止大家好我是专家）→ 顺带露出经历/失败/判断 → 稳定价值观 → 故事或案例背书 → 结尾让用户知道你长期站在哪一边。
禁忌：堆头衔；品牌宣传片感；完美无瑕；无具体人/事/代价。`,
    antiPatterns: ["大家好我是", "头衔堆砌", "完美人设"],
    priority: 15,
  },
  {
    id: "card.convert",
    title: "成交转化视频",
    kind: "business_goal",
    goals: ["convert"],
    triggers: ["成交", "转化", "报名", "购买", "课程", "产品说明", "活动", "下单", "付费"],
    structureModules: ["错误选择代价", "适不适合", "产品解决什么", "结果案例", "低摩擦行动路径"],
    promptBody: `适用：产品说明、活动报名、诊断预约、课程/咨询/陪跑转化。
核心：不是强行推销，而是帮用户判断“我现在要不要行动”。
结构：错误选择代价 → 谁适合/不适合 → 产品解决什么（非功能列表）→ 案例证明结果 → 低摩擦行动路径。
必须说清：适合谁、不适合谁、解决什么、不解决会损失什么、下一步怎么做。
禁忌：只讲优惠；只讲功能；所有人都适合；结尾路径太复杂。`,
    antiPatterns: ["所有人都适合", "只讲优惠", "功能清单无结果"],
    priority: 18,
  },
  {
    id: "route.persona_trust",
    title: "内容路由·人设信任型",
    kind: "content_route",
    goals: ["trust", "lead", "brand"],
    triggers: ["人设信任型", "来时路", "价值观", "踩坑故事"],
    structureModules: ["真实场景或经历", "经历形成的判断", "为何可以信任你"],
    promptBody: `内容路由=这条内容为什么拍。人设信任型：先真实场景/经历 → 再说形成什么判断 → 最后落到用户为何可信任你。叙事用故事弧线，不要硬套带货漏斗。`,
    antiPatterns: ["平铺履历", "直接自我介绍"],
    priority: 5,
  },
  {
    id: "route.point_of_view",
    title: "内容路由·观点立场型",
    kind: "content_route",
    goals: ["traffic", "trust", "brand"],
    triggers: ["观点", "立场", "误区", "反常识", "趋势判断", "争议"],
    structureModules: ["明确判断", "普通人为何判错", "自己的判断标准"],
    promptBody: `观点立场型：先给明确判断 → 再拆普通人为什么会判错 → 最后给自己的判断标准。目的是“他说得不一样，而且说中了”。`,
    antiPatterns: ["观点无标准", "空喊情绪"],
    priority: 5,
  },
  {
    id: "route.problem_solve",
    title: "内容路由·问题解决型",
    kind: "content_route",
    goals: ["lead", "convert", "traffic"],
    triggers: ["问题解决型", "痛点", "避坑", "方法", "答疑", "干货"],
    structureModules: ["客户具体问题", "问题原因", "可执行方案或产品对应点"],
    promptBody: `问题解决型：先说客户正在遇到的具体问题 → 再拆原因 → 最后给可执行方案或产品对应解决点。干货方法并入本路由，不单独拆。`,
    antiPatterns: ["空泛干货无场景"],
    priority: 5,
  },
  {
    id: "route.case_convert",
    title: "内容路由·案例转化型",
    kind: "content_route",
    goals: ["convert", "lead", "trust"],
    triggers: ["案例转化型", "案例", "前后对比", "客户故事", "成交故事"],
    structureModules: ["具体对象与处境", "采取的动作", "结果变化与下一步"],
    promptBody: `案例转化型：先讲具体对象和处境 → 再讲采取了什么动作 → 最后讲结果变化、信任证据和下一步行动。成交转化并入本路由。`,
    antiPatterns: ["无具体对象的空案例"],
    priority: 5,
  },
  {
    id: "local.hook",
    title: "局部优化·开头",
    kind: "local_optimize",
    goals: ["traffic", "lead", "trust", "convert", "brand", "unclear"],
    triggers: ["开头", "前3秒", "第一句话", "钩子", "起手", "开场"],
    structureModules: ["3-5个可替换开头", "钩子类型标注"],
    promptBody: `只优化开头，不重写整篇。调用七大爆款开头：好奇/借势/痛点/极限/恐吓/反差/利益输送。输出 3-5 个可替换开头并说明钩子类型。`,
    antiPatterns: ["顺手重写整篇"],
    priority: 30,
  },
  {
    id: "local.title",
    title: "局部优化·标题",
    kind: "local_optimize",
    goals: ["traffic", "lead", "trust", "convert", "brand", "unclear"],
    triggers: ["标题", "封面标题", "小红书标题", "发布标题"],
    structureModules: ["5-10个标题", "主推版本"],
    promptBody: `标题规则：利益前置、痛点直击、反差冲突、人群点名、结果承诺。给 5-10 个标题并标注主推。`,
    antiPatterns: ["空泛标题"],
    priority: 30,
  },
  {
    id: "local.ending",
    title: "局部优化·结尾",
    kind: "local_optimize",
    goals: ["traffic", "lead", "trust", "convert", "brand", "unclear"],
    triggers: ["结尾", "收尾", "评论引导", "行动引导", "CTA"],
    structureModules: ["单一行动引导"],
    promptBody: `结尾规则：关系阶梯、评论关键词、资料包、诊断入口、下一步行动。不能硬广；必须让用户知道下一步做什么；只留一个行动。`,
    antiPatterns: ["硬广收尾", "多个CTA同时喊"],
    priority: 30,
  },
  {
    id: "local.structure",
    title: "局部优化·结构",
    kind: "local_optimize",
    goals: ["traffic", "lead", "trust", "convert", "brand", "unclear"],
    triggers: ["结构", "节奏", "中段", "展开", "逻辑", "太散"],
    structureModules: ["保留原选题", "重排推进顺序"],
    promptBody: `结构优化：优先保留原选题，只重排段落和推进顺序。可参考趋势机会型、问题解决型、干货速查型，以及线索获客的问题→解法→方案。`,
    antiPatterns: ["改掉核心选题"],
    priority: 30,
  },
  {
    id: "local.oral",
    title: "局部优化·口播感",
    kind: "local_optimize",
    goals: ["traffic", "lead", "trust", "convert", "brand", "unclear"],
    triggers: ["去AI味", "口语化", "像人说话", "太书面", "太端着", "人味"],
    structureModules: ["只改表达", "保留事实与核心观点"],
    promptBody: `口播感：真人口播、人味检查、删空话、少排比和总结腔。先保住人的位置/代价/手迹，再清 AI 腔。只改表达，不改事实和核心观点。`,
    antiPatterns: ["改观点", "删掉作者毛边"],
    priority: 30,
  },
  {
    id: "structure.logo_aida",
    title: "漏斗模型（AIDA宽进窄出 / LOGO）",
    kind: "toolbox",
    goals: ["traffic", "lead", "trust", "convert", "brand", "unclear"],
    triggers: [
      "漏斗模型", "漏斗 模型",
      "logo模型", "logo 模型", "LOGO模型", "LOGO 模型",
      "AIDA", "AIDA模型", "aida模型",
      "注意兴趣欲望行动", "宽进窄出", "漏斗结构",
    ],
    structureModules: [
      "Attention注意·泛话题停留",
      "Interest兴趣·收窄到目标人群",
      "Desire欲望·判断标准与结果渴望",
      "Action行动·落到自己业务的单一CTA",
    ],
    promptBody: `【漏斗模型 = 经典 AIDA 单条文案漏斗】用户点名「漏斗模型 / logo模型 / AIDA」时必须按此结构重写或生成。

宽进窄出四段（按序写满，禁止跳段）：
1. Attention（注意）：用泛话题/行业现象/普遍痛点/反差开场，让谁都能听懂并愿意停。开头禁止业务自述、禁止「大家好我是」、禁止直接推产品。
2. Interest（兴趣）：从泛话题收窄到目标客户能对号入座的具体处境，说明「这事跟你有关」。
3. Desire（欲望）：给小切口判断标准、代价/误判或结果路径，让人觉得「我想解决 / 我想要这个结果」；可自然露出专业判断，仍不要硬卖功能清单。
4. Action（行动）：结尾才漏到自己的业务——只给一个低摩擦承接（评论关键词/私信/领取清单/预约诊断），并说明行动后能得到什么。

改写规则：保留原选题与事实；按 A→I→D→A 重排节奏；中段可以筛人，结尾才承接业务；正文禁止出现「AIDA」「漏斗模型」「LOGO模型」等理论标签。`,
    antiPatterns: [
      "开头推产品",
      "大家好我是",
      "全文功能清单",
      "没有单一行动",
      "理论标签进口播",
    ],
    priority: 40,
  },
  {
    id: "toolbox.hooks7",
    title: "工具箱·七大爆款开头",
    kind: "toolbox",
    goals: ["traffic", "lead", "trust", "convert", "brand"],
    triggers: ["七大开头", "钩子库"],
    structureModules: ["开头钩子选型"],
    promptBody: `七大爆款开头：好奇、借势、痛点、极限、恐吓、反差、利益输送。开头优化优先给候选并标注类型。`,
    antiPatterns: ["今天给大家分享"],
    priority: 1,
  },
  {
    id: "toolbox.humanizer",
    title: "工具箱·人味与去AI味",
    kind: "toolbox",
    goals: ["traffic", "lead", "trust", "convert", "brand"],
    triggers: ["去AI味", "人味", "朗读"],
    structureModules: ["人味保留", "AI降噪", "朗读终检"],
    promptBody: `先保人味（位置/代价/手迹/少动/不表演），再清 AI 痕迹（三点式、万能连接词、均匀句长、不是X而是Y连环）。朗读终检：这个IP会这么说吗？`,
    antiPatterns: ["总而言之", "值得注意的是", "不是X而是Y连环"],
    priority: 1,
  },
]

export function getMethodologyCardById(id: string): MethodologyCard | undefined {
  return IP_COPYWRITING_CARDS.find((card) => card.id === id)
}

export function buildMethodologyBlockFromCardIds(cardIds: string[]): string {
  const cards = cardIds
    .map((id) => getMethodologyCardById(id))
    .filter((card): card is MethodologyCard => Boolean(card))
    .sort((a, b) => b.priority - a.priority)

  if (cards.length === 0) return ""

  return cards
    .map(
      (card) =>
        `### ${card.title}（${card.id}）\n结构模块：${card.structureModules.join(" → ")}\n${card.promptBody}`,
    )
    .join("\n\n")
}
