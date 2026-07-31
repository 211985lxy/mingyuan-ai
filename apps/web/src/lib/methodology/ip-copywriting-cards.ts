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
    triggers: ["流量", "起号", "破圈", "曝光", "涨粉", "播放", "引流", "品牌曝光", "品宣", "收藏", "复看", "停留"],
    structureModules: ["强停留开头", "具体场景承接", "可收藏抓手(清单/标准/易错点)", "中段断裂感或新信息点", "结尾句锚或关注理由"],
    promptBody: `适用：起号、破圈、扩大曝光；也用于账号视频杂志的破圈层（外圈拉新）。
核心判断：用更低理解成本换更高停留，不是炫技巧；宁要精准小流量，不要错误用户的大流量。
平台权重口径（写进正文节奏）：收藏（可持续停留）> 复看率/复访率 > 铁粉互动 > 点赞；完播率不再是核心考察指标，长视频不必为硬追完播牺牲内容厚度。
节奏：开头3秒强钩子（真能对上正文，不标题党）→ 每5-8秒至少一个新信息点或断裂感，让用户有理由再看一会儿、甚至想倒回去重看 → 至少输出1个可收藏抓手（清单/步骤/模板/对照表/易错点/判断公式，可自然说「这个先收藏，后面用得上」，但不空洞喊收藏）→ 结尾把最值得回看的一句话做句锚，或给「下次遇到X场景就用Y方法」的复看提示 → 评论/转发给一个容易站队的判断或明确的转发对象。
边界：破小圈不破大圈（可扩到场景/生活方式/相邻议题，不碰与定位无关的争议/娱乐）；不为流量吸来不买单的人。
常用开头：好奇/痛点/反差/恐吓/利益；前几秒优先交代 Who+What（谁、发生什么）。
禁忌：一上来介绍自己；只讲大道理无场景；机械三点式；宏大空泛选题（如「行业未来在哪」）；只追播放量。`,
    antiPatterns: ["大家好我是", "赋能", "三点式课件感", "只追播放量", "宏大空泛"],
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
    structureModules: [
      "精准客户三特征落地(已投入筹码+已感到代价+正处在决策压力中)",
      "问题(刚需痛点,不是泛泛痛点)",
      "解法(错在哪→为什么→怎么做)",
      "方案(小切口,4条件:立刻能用/零门槛/有反馈/只解决局部不替代完整服务)",
      "谁适合/谁不适合(筛人)",
      "单一低摩擦CTA+行动后能得到什么",
    ],
    promptBody: `适用：高客单服务、咨询、陪跑、招商、企业服务；账号视频杂志的转化层（产品内容约20%）。
核心：不是追爆款，是让有真实问题、真实投入、真实付费意愿的人主动找你；高频阅读低频购买，不必看完就买，不过度逼单。
精准客户三特征（写前内部判断，正文要照出至少1条）：① 已投入筹码（钱/时间/人力/机会成本）② 已感到代价（钱花了没结果/时间耗了路径不清/窗口正在关闭）③ 正处在决策压力中（知道必须做决定但判断不了）。
买点不是卖点（JTBD）：用户买的不是产品本身，是雇佣产品完成某件事；从买家场景/情绪/结果画面找购买理由，不从产品功能出发。
做镜子不做自己：照出用户此刻的处境/欲望/不安/代价，不是展示自己多专业；让对的人觉得「这说的就是我」。
三段公式（正文按序写满）：
  · 问题：刚需痛点（用户愿意付钱解决的痛点，不是泛泛痛点）；5个判断：是否已投入成本/继续拖是否有损失/自己能否判断/解决是否带来收入机会或安全感/失败是否会后悔。
  · 解法：错在哪→为什么→怎么做；先讲错误制造悬念，再讲原因建立权威，最后给方向。
  · 方案：只给一个小切口，满足4条件——立刻能用/零门槛执行/做完马上有反馈/只解决局部不替代完整服务（让用户验证你是内行，剩下问题还会来找你）。
需求引爆点：识别用户从「想解决」到「必须解决」的瞬间（决策窗口/代价临界/机会关闭）。
筛人：明确写谁适合、谁不适合，主动筛掉不适配客户，不为流量放大受众。
CTA：只给一个轻行动——评论引导（不用「扣1」）/ 私信引导（给具体领取理由，不说「欢迎交流」）/ 预约引导（说清预约了能拿到什么）；结尾禁止同时喊多个CTA。
五类选题可参考：判断标准型/小方案型/案例拆解型/边界筛选型/趋势认知型。
私域承接：评论私信→开场识别阶段→问题收集（阶段/投入/卡点/目标）→初步诊断→朋友圈信任补充→低门槛产品→高价值产品→复购转介绍。
指标六层：流量层/线索层/精准层/成交层/交付层/经营层；不只看播放量，看有效咨询/客资质量/成交率/复购率。
可复用公式：精准客户=已投入筹码+已感到代价+正处在决策压力中；高转化内容=精准场景+错误诊断+底层原因+小切口方案+服务逻辑。`,
    antiPatterns: [
      "只追播放量", "私信我扫码报名全都要", "所有人都适合", "同时喊多个CTA", "扣1",
      "把内容当目的（为日更而日更）", "把卖点当买点（只介绍自己多专业）",
      "把爆款当获客（播放高就兴奋，没追踪客资质量）", "什么客户都想要",
      "私域承接太随意（加好友后随便聊，朋友圈无体系）",
    ],
    priority: 20,
  },
  {
    id: "card.trust",
    title: "人设信任视频",
    kind: "business_goal",
    goals: ["trust"],
    triggers: ["人设", "信任", "来时路", "价值观", "踩坑", "工作现场", "vlog", "专业经历", "置顶视频", "人设故事"],
    structureModules: ["真实处境或具体场景切入", "经历与判断(含失败/代价)", "稳定价值观或站队", "故事或案例背书(有细节数字)", "收束到长期立场"],
    promptBody: `适用：老板IP、专家IP、顾问型账号；也用于账号视频杂志的专业信任层。
人设三原则：内容型（先想用户愿看什么，不是先想产品多好）、专家型（强化专业可信，不靠娱乐覆盖它）、真实型（不编造故事、不扮演他人、不假装完美）。
核心：人设不是自我介绍，而是让用户相信「这件事找你靠谱」；创始人深度参与方向/观点/脚本取舍，不让团队风格凌驾于IP本人。
结构：真实处境或具体场景切入（禁止「大家好我是」+ 头衔堆砌）→ 顺带露出经历/失败/踩坑/判断，要有时间/地点/对话/数字等颗粒度细节 → 稳定价值观或站队 → 故事或案例背书，夹叙夹议（故事→观点→细节→新判断）→ 结尾让用户知道你长期站在哪一边。
四类故事可选：别人的故事（借话题破圈+自己判断，冷启动最易上手）、自己的故事（创业/转型/失败/决定，建立人格信任；冷启动期大众不太关心素人故事，先做别人的更稳）、对谈/采访（一次3-5话题，剪3条以上，顶级形态）、产品的故事（叠加场景/人物/情感才不叫卖货）。
颗粒度要求：时间/地点/对话原话/动作/数字要具体（「28岁望京12平办公室首月3800块」>「那时候我很艰难」）；禁纯复述/纯抒情/结尾突然拔高宏大叙事。
禁忌：堆头衔；品牌宣传片感；完美无瑕；无具体人/事/代价；鸡汤或励志演讲；硬转产品/成交。`,
    antiPatterns: ["大家好我是", "头衔堆砌", "完美人设", "宏大叙事拔高", "纯抒情鸡汤"],
    priority: 15,
  },
  {
    id: "card.convert",
    title: "成交转化视频",
    kind: "business_goal",
    goals: ["convert"],
    triggers: ["成交", "转化", "报名", "购买", "课程", "产品说明", "活动", "下单", "付费"],
    structureModules: ["错误选择代价", "谁适合/谁不适合", "产品解决什么(非功能列表)", "结果案例或可验证变化", "低摩擦单一行动路径"],
    promptBody: `适用：产品说明、活动报名、诊断预约、课程/咨询/陪跑转化。
核心：不是强行推销，而是帮用户判断「我现在要不要行动」；转化内容看有效咨询/进私域/购买意向/客户质量，不只看播放量。
必须说清：适合谁、不适合谁、解决什么问题、不解决会损失什么、下一步怎么做；语言接近日常对话。
结构：错误选择代价 → 谁适合/不适合 → 产品解决什么（非功能清单，写用户结果）→ 结果案例证明或可验证变化 → 低摩擦行动路径。
禁忌：只讲优惠；只讲功能；所有人都适合；结尾路径太复杂；传播内容结尾硬塞广告。`,
    antiPatterns: ["所有人都适合", "只讲优惠", "功能清单无结果", "结尾硬塞广告"],
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
  {
    id: "toolbox.xuhusheng_foundation",
    title: "工具箱·徐沪生底层原则",
    kind: "toolbox",
    goals: ["traffic", "lead", "trust", "convert", "brand", "unclear"],
    triggers: ["徐沪生", "做号方法论", "按徐沪生", "一条只说一件事", "专业个人IP", "账号即杂志"],
    structureModules: ["专业个人IP路线(非娱乐网红)", "账号即视频杂志(三层漏斗)", "一条只说一件事", "利他+不引错人", "数据判断双维度"],
    promptBody: `走专业个人IP路线（靠专业积累吸引精准用户），不走娱乐网红路线（成功率低不可复制）。
把账号当一本视频杂志，三层漏斗分工：破圈(看转发/关注/画像)→专业信任→产品转化(产品内容约20%)；客户只占粉丝0.5%到万分之一，选题永远分两种：追流量、追转化；不要求看完就买。
一条只说一件事（一个事件/观点/决定），拒绝宏大空泛选题。
选题第一原则利他：他为何愿看、得到什么、为何愿转、不买是否有价值；宁要精准小流量，不要错误用户的大流量。
数据判断双维度：传播内容看圈层进入/自然转发/新增画像是否准；转化内容看有效咨询/用户懂产品/进私域或购买/客户质量。
禁止：抄爆款（学结构模式不抄选题文案，看长期稳定非单一爆款）；迷信数量（一条原创优质胜过大量低质；当长则长当短则短，但全程不能有弱段）。脚本阶段修改成本最低，最值得投入。`,
    antiPatterns: ["娱乐网红路线表演", "行业未来在哪宏大空泛", "只看播放量完播率", "大量低质凑数"],
    priority: 2,
  },
  {
    id: "toolbox.script_craft",
    title: "工具箱·脚本生产工艺",
    kind: "toolbox",
    goals: ["traffic", "lead", "trust", "convert", "brand", "unclear"],
    triggers: ["脚本生产", "脚本节奏", "脚本工艺", "5W开头", "夹叙夹议"],
    structureModules: ["5W开头(Who+What优先)", "夹叙夹议(故事→观点→细节→新判断)", "语言接近日常对话", "分行修改成本最低"],
    promptBody: `5W：开头优先交代 Who 和 What，别让用户看几十秒还不知讲什么；前几秒最独特信息前置，不宏大铺垫不故弄玄虚。
夹叙夹议：故事→观点→细节→新判断；禁纯复述、纯抒情、为高级用晦涩书面语、结尾突然拔高宏大叙事、传播内容结尾硬塞广告。
语言接近日常对话；口播做自己、侧对镜头、情绪饱满、室内画面精致。
脚本节奏方法：准备5-6个有价值观/金句/传播点的故事→录30分-1小时不背稿保持聊天→一稿2000-3000字→二稿约1000字→秘诀分行排列（易发现重复/无效过渡/最佳字幕句）。`,
    antiPatterns: ["几十秒还不知讲谁讲什么", "纯复述纯抒情", "硬拔高宏大叙事", "为高级晦涩"],
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
