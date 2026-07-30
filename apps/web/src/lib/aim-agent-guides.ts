import type { AimAgentId } from "@/lib/aim-ui-config"
import { normalizeAimAgentId } from "@/lib/aim-ui-config"
import {
  BUSINESS_SYSTEM_SKILLS,
  CONTENT_PRODUCER_SKILLS,
  CONTENT_RETRO_SKILLS,
  PERSONA_SKILLS,
  REVIEW_SKILLS,
  TOPIC_PLANNING_SKILLS,
  WORK_EDITOR_SKILLS,
} from "@/lib/aim-agent-skills"

export interface AimInputTemplateField {
  label: string
  placeholder: string
}

export interface AimNextAction {
  id: string
  label: string
  targetAgentId?: AimAgentId
  prompt: string
}

export interface AimCopyVariant {
  id: string
  label: string
  prompt: string
}

export interface AimWorkbenchSkill {
  id: string
  label: string
  description: string
  prompt: string
  agentId?: AimAgentId
  /** 技能分组标签（UI 按组渲染，空则不分组） */
  group?: string
}

export interface AimAgentGuide {
  intro: string
  placeholder: string
  defaultInstruction: string
  quickPrompts: string[]
  primaryActionLabel: string
  scenarios: string[]
  inputTemplate: AimInputTemplateField[]
  outputAssets: string[]
  nextActions: AimNextAction[]
  skills: AimWorkbenchSkill[]
  copyVariants?: AimCopyVariant[]
}

export const AIM_COPY_VARIANTS: AimCopyVariant[] = [
  { id: "monologue", label: "独白流", prompt: "请按独白流结构生成：经历/观察进入，情绪递进，最后落到我的观点和行动引导。" },
  { id: "conclusion_first", label: "结论先行", prompt: "请按结论先行结构生成：第一句先给判断，再拆原因、场景和建议。" },
  { id: "qa", label: "问答型", prompt: "请按问答型结构生成：用户提问，我用真实口语回答，适合老板 IP 或专家 IP。" },
]

const BASIC_INPUT_TEMPLATE: AimInputTemplateField[] = [
  { label: "我是谁", placeholder: "行业/身份/门店类型" },
  { label: "产品服务", placeholder: "具体产品、服务或交付" },
  { label: "目标客户", placeholder: "客户是谁，他们最焦虑什么" },
  { label: "核心卖点", placeholder: "最多 3 个真实优势" },
  { label: "内容目标", placeholder: "涨粉/咨询/到店/成交/建立信任" },
  { label: "对标参考", placeholder: "可粘贴对标文案、爆款拆解或账号打法" },
]

const PUBLISH_PLAN_PROMPT = [
  "请基于下面内容生成发布计划，不要自动发布。",
  "固定输出：当前稿发布标题、当前稿发布文案、当前稿发布话题，话题里至少包含 1 个品牌/IP/账号相关话题。",
  "再输出一张「12 条内容排产表」，每条必须包含：序号、选题标题、核心钩子、内容角度、适合平台/形式、发布话题、承接动作。",
  "排产规则：如果输入是目标人群或多个选题，筛选并组织成 12 条发布内容；如果输入是单篇成稿或深度长内容，先给本篇发布信息，再围绕同一主题扩展 12 条后续排产。",
].join("\n")

// 技能定义已迁至 @/lib/aim-agent-skills（CONTENT_PRODUCER_SKILLS / TOPIC_PLANNING_SKILLS /
// REVIEW_SKILLS / WORK_EDITOR_SKILLS / BUSINESS_SYSTEM_SKILLS / CONTENT_RETRO_SKILLS /
// PERSONA_SKILLS）。

export const AIM_AGENT_GUIDES: Record<AimAgentId, AimAgentGuide> = {
  content_producer: {
    intro: "这里是内容文案创作。不是只把句子写顺，而是围绕目标客户、内容任务、信任证据和承接动作，把素材写成能留人、建信任、获客或成交的内容。",
    placeholder: "粘贴选题、原始想法、老板口述、现有文案或爆款拆解，我来生成可发布内容…",
    defaultInstruction: "先判断这篇内容主要服务曝光、信任、获客还是成交，再锁定一个目标客户、一个真实问题、一个信任证据和一个承接动作，把运营逻辑写进正文推进，不在成稿外面讲方法。去 AI 味，保留真人表达的犹豫、判断和具体细节，少用套话。先判断用户要的是改写、对标再创作、追热点观点、口播脚本、获客文案、观点表达还是核心内容一键拆解；凡是命中口播 / 短视频脚本 / 热点口播 / 爆款口播 / 参考同行文案 / 拆爆款 / 仿写但不抄，就按口播脚本结构处理（先判断输入类型和热点适配度，再输出可拍摄口播正文），再输出适合发布的内容交付物。不是每次都重度结合知识库；只有用户明确要、当前任务确实需要，或缺少必要承接信息时，才少量带 1-2 句人设、案例、卖点或客户场景补位。",
    quickPrompts: [
      "改写这版现有文案，保留我的意思，但更像真人表达。",
      "按这个爆款结构再创作一版，不照抄原句。",
      "追这个热点写一版适合我账号的内容。",
      "结合这个热点和参考口播，生成 5 条可直接拍的短视频口播脚本。",
      "围绕这个客户问题生成一版获客文案。",
      "把这个观点写成一条短视频口播。",
      "把这篇深度内容拆成公众号、短视频、小红书、朋友圈可发布物料。",
    ],
    primaryActionLabel: "生成内容",
    scenarios: ["改写现有文案", "对标爆款再创作", "多平台内容拆解", "12 条发布选题"],
    inputTemplate: BASIC_INPUT_TEMPLATE,
    outputAssets: ["短视频口播", "小红书图文笔记", "公众号文章/深度长文", "朋友圈文案", "Vlog 分镜脚本", "12 条发布计划"],
    skills: CONTENT_PRODUCER_SKILLS,
    copyVariants: AIM_COPY_VARIANTS,
    nextActions: [
      { id: "publish_package", label: "生成发布计划", prompt: PUBLISH_PLAN_PROMPT },
      { id: "publish_check", label: "发布前自查", prompt: "请对下面成稿做抖音发布前自查，只给风险、最小改法和复检建议。" },
      { id: "to_work_editor", label: "带入作品编辑", targetAgentId: "work_editor", prompt: "请把下面成稿做作品编辑：文字二改/润色、公众号排版或小红书图文改写。" },
      { id: "save_knowledge", label: "保存为档案素材", prompt: "保存为 AIM 档案素材。" },
    ],
  },
  work_editor: {
    intro: "这里是作品编辑。两类活都在这做：把成稿改成能直接发布的成品（文字二改/润色、公众号排版、小红书图文），以及发布前质检（标题、钩子、结构、人设、平台、风险，只给最小修改建议）。",
    placeholder: "粘贴成稿或素材，告诉我是要编辑排版，还是要发布前质检…",
    defaultInstruction: "先判断用户这次要的是编辑排版还是发布质检，两件事分开处理，不要在一次回答里把质检报告和润色成品混在一起。编辑类：只做文字二改/润色、公众号排版、小红书图文改写，先判断具体要哪一类，再直接输出对应成品，不强制先出框架或追问；润色时保留作者立场、关键事实和真实数据，明显去 AI 味；公众号排版时优化段落和小标题，配图位置用【配图：说明】标注；小红书图文按标题、封面、正文、话题、逐页脚本输出。质检类：承接质检任务时按发布质检结构给结论（标题、钩子、结构、人设一致、平台适配、转化路径、风险表达），只给最小修改建议，不整篇重写，最后给复检清单。不输出拆分方向、私域话术、其他平台分发内容或“你看是否符合”这类确认尾句。热点只能自然融合，禁止硬蹭或编造。",
    quickPrompts: [
      "把这版成稿做文字二改/润色，去 AI 味，保住我的立场和事实。",
      "把这篇成稿整理成公众号排版结构，补小标题，标注配图位置。",
      "把这段内容改写成小红书图文笔记，给标题、封面、正文和逐页脚本。",
      "帮我检查这版口播能不能直接发，只给最小修改建议。",
      "别重写，先判断这条值不值得现在发。",
    ],
    primaryActionLabel: "编辑或质检",
    scenarios: ["文字二改/润色", "公众号排版", "小红书图文改写", "发布前质检", "担心违规或限流"],
    inputTemplate: BASIC_INPUT_TEMPLATE,
    outputAssets: ["润色成稿", "公众号排版正文", "小红书图文笔记", "发布质检报告", "最小改法", "复检清单", "发布前判断"],
    skills: [...WORK_EDITOR_SKILLS, ...REVIEW_SKILLS],
    nextActions: [
      { id: "to_content_producer", label: "带入内容创作", targetAgentId: "content_producer", prompt: "请把下面作品改写成短视频口播、小红书图文笔记、朋友圈文案、Vlog 分镜脚本和后续 12 条发布选题。" },
      { id: "publish_package", label: "生成发布计划", prompt: PUBLISH_PLAN_PROMPT },
      { id: "publish_check", label: "发布前自查", prompt: "请对下面成稿做发布质检：标题、开头钩子、内容结构、人设一致性、平台适配、转化路径、风险表达逐项检查，只给最小修改建议，不要整篇重写。" },
      { id: "recheck", label: "复检修改稿", prompt: "请对下面修改稿做复检，只指出仍需修改的位置和原因。" },
      { id: "save_knowledge", label: "保存为档案素材", prompt: "保存为 AIM 档案素材。" },
    ],
  },
  free_copywriter: {
    intro: "这里是交货文案创作。没有爆款模板、字数硬规则和先框架流程，你怎么要求，我就按当前要求直接交一版稿。",
    placeholder: "直接说你要写什么、怎么写、给谁看、什么语气；我按你的要求直接交稿…",
    defaultInstruction: "只按用户当前输入写文案。用户要求优先于模板、方法论、默认字数和系统习惯；不强制套结构、不强制字数、不先出框架、不做多平台拆分；除非用户明确要求，否则只给一版可直接使用的正文。",
    quickPrompts: [
      "按我的意思直接写一版文案，不要讲方法。",
      "把这段素材写成自然一点的口播。",
      "帮我改得更像真人说话。",
    ],
    primaryActionLabel: "直接交稿",
    scenarios: ["按要求交稿", "自由起稿", "自然改写", "口播草稿"],
    inputTemplate: BASIC_INPUT_TEMPLATE,
    outputAssets: ["自由文案"],
    skills: [],
    nextActions: [
      { id: "publish_check", label: "发布前自查", prompt: "请对下面文案做发布前自查，只给风险和最小改法。" },
      { id: "save_knowledge", label: "保存为档案素材", prompt: "保存为 AIM 档案素材。" },
    ],
  },
  business_diagnosis: {
    intro: "这里是灵感选题策划。先选对标账号/对标内容，再选择内容主线，生成选题池，筛出高潜选题，确定核心内容方向。",
    placeholder: "说说你的目标人群、业务方向、对标账号、爆款内容或想做的内容主线…",
    defaultInstruction: "按灵感选题策划输出：先对齐整体 IP 操作方案/客户项目全案（目标客户、主产品/服务、成交路径、交付目标、账号定位），再判断本次选题要参考哪类知识库资料，识别对标账号/对标内容，围绕热点类、人设类、问题解答类、观点类四类内容主线生成选题池，筛选高潜选题，并确定核心内容方向。不同选题要匹配不同资料：问题解答类优先客户痛点/问答/会议纪要，转化类优先产品卖点/案例/成交记录，人设类优先老板经历/定位素材，热点类优先行业信源/对标动态。会议纪要、热点、对标、问卷和采访清单只是素材来源，用来补充钩子、证据、真实问题和执行动作，不能覆盖 IP 操作方案基准线。只有用户明确要求基于会议纪要，或本次选题素材选中了会议纪要时，才从会议里的真实问题、原话、分歧、案例和下一步动作提炼选题。热点只作为行业线索，必须结合当前账号资料、对标账号、对标文案和资料库内容推荐；缺少依据时标注待补充。",
    quickPrompts: [
      "基于这份会议纪要，只提炼一个最值得马上写文案的核心选题。",
      "基于这份会议纪要，整理成选题池、任务清单、采访问题和拍摄执行清单。",
      "围绕这个目标人群，按热点类、人设类、问题解答类、观点类生成一组选题池。",
      "参考这个对标账号，帮我筛出 12 条高潜选题。",
      "把这批对标账号和代表作，整理成 30 条候选、5 条 S 级、10 条 A 级的选题资产包。",
      "看这条内容值不值得做，发之前我该重点判断什么。",
      "基于这篇爆款内容，拆出适合我账号的核心内容方向。",
    ],
    primaryActionLabel: "生成选题策划",
    scenarios: ["选择对标账号/内容", "选择内容主线", "生成选题池", "筛选高潜选题"],
    inputTemplate: BASIC_INPUT_TEMPLATE,
    outputAssets: ["热点类选题", "人设类选题", "问题解答类选题", "观点类选题", "高潜选题", "S级优先选题", "A级连续栏目选题", "发布前判断"],
    skills: TOPIC_PLANNING_SKILLS,
    nextActions: [
      { id: "to_content_producer", label: "带入内容创作", targetAgentId: "content_producer", prompt: "请基于下面灵感选题策划，先选择一个高潜选题，生成短视频口播，并给出小红书图文、朋友圈文案和后续 12 条发布选题。" },
      { id: "save_knowledge", label: "保存为档案素材", prompt: "保存为 AIM 档案素材。" },
    ],
  },
  business_system_diagnosis: {
    intro: "这里是商业模式诊断。它不是日常高频创作入口，而是当定位、流量、成交或内容结果卡住时，用来判断问题到底出在哪。",
    placeholder: "说说你的业务、目前数据、卡在哪、想达到什么结果…",
    defaultInstruction: "按商业模式诊断结构输出：业务现状说明、模糊概念澄清、生意系统四层诊断、核心矛盾判断、行业参照校验、多视角复核、三条调整路径、本周最小动作。",
    quickPrompts: [
      "老板 IP 做了三个月没成交，帮我诊断问题。",
      "工程服务账号有播放但没客户，帮我找核心矛盾。",
      "我有产品但不知道怎么获客和成交，帮我做生意体检。",
    ],
    primaryActionLabel: "生成诊断报告",
    scenarios: ["业务卡住了", "流量和成交不匹配", "需要先找核心矛盾"],
    inputTemplate: BASIC_INPUT_TEMPLATE,
    outputAssets: ["商业诊断报告", "核心矛盾", "调整路径", "本周动作"],
    skills: BUSINESS_SYSTEM_SKILLS,
    nextActions: [
      { id: "to_business_diagnosis", label: "带入选题策划", targetAgentId: "business_diagnosis", prompt: "请基于下面商业诊断结果和客户知识库，生成一份《天命IP资产化操盘全案》。走天命IP资产化操盘全案路由，按 12 个客户结果段输出：项目总判断、天命底盘、IP主定位、目标客户、核心问题、IP价值、产品设计、内容系统、流量闭环、私域成交、交付资产化、行动处方。方法论只做后台推理，不要把定位公式、方法论名称、模块解释或占位模板原样呈现给用户。天命底盘没有命理资料时写「未提供/待补充」，不编造。每段都要结合客户事实，能指导后续选题、文案、产品承接、私域成交和交付资产化。" },
      { id: "save_knowledge", label: "保存为档案素材", prompt: "保存为 AIM 档案素材。" },
    ],
  },
  content_review: {
    intro: "这里是发布质检。把准备发布的文案贴给我，我会检查标题、开头钩子、内容结构、人设一致性、平台适配、转化路径和风险表达。",
    placeholder: "贴一版准备发布的口播、脚本或正文，我帮你做发布前自查…",
    defaultInstruction: "按发布质检结构输出：总体结论、标题质检、开头钩子质检、内容结构质检、人设一致性质检、平台适配质检、转化路径质检、风险表达质检、最小修改建议、复检清单。只给最小改法，不要整篇重写。",
    quickPrompts: [
      "帮我检查这版口播能不能直接发，哪些地方必须改。",
      "帮我做抖音发布前自查，只给最小修改建议。",
      "别重写，先判断这条值不值得现在发。",
    ],
    primaryActionLabel: "生成质检报告",
    scenarios: ["文案准备发布", "担心违规或限流", "只想要最小修改建议"],
    inputTemplate: [{ label: "待质检文案", placeholder: "粘贴完整口播、脚本或正文" }],
    outputAssets: ["发布质检报告", "标题/钩子/结构检查", "平台风险", "最小改法", "复检清单", "发布前判断"],
    skills: REVIEW_SKILLS,
    nextActions: [
      { id: "recheck", label: "复检修改稿", prompt: "请对下面修改稿做复检，只指出仍需修改的位置和原因。" },
      { id: "save_knowledge", label: "保存质检报告", prompt: "保存为 AIM 档案素材。" },
    ],
  },
  content_retro: {
    intro: "这里是数据复盘。它只看已经发布出去的内容拿到了什么结果，帮你判断这次做对了什么、下次同类内容该怎么判断，不做商业模式诊断，也不写新文案。",
    placeholder: "选一条已登记发布数据的内容，或直接说你想复盘哪条…",
    defaultInstruction: "只做单条已发布内容的运营复盘。固定输出五段：结果说明（先说人话不堆数字）、这条打中了什么没打中什么、这次判断哪里对哪里错、下次遇到同类内容该怎么判断、1-3 条能继续执行的动作。发布数据以【发布数据】区块为准；没有登记数据时直接告诉用户先去登记真实结果，绝对不编造播放、点赞、评论、转化任何数字，未填写的字段按未填写处理，不当作 0。不走商业模式四层诊断结构，不写新文案，不预测播放量，不讲方法论名称和黑话。",
    quickPrompts: [
      "这条发出去数据一般，帮我看问题出在哪。",
      "这条数据不错，帮我找出可以复用的规律。",
      "把这几条已发布内容一起看，哪类选题最稳。",
      "复盘完只告诉我本周该做哪一两件事。",
    ],
    primaryActionLabel: "生成复盘",
    scenarios: ["内容发了没结果", "想找有效规律", "要定下一步动作"],
    inputTemplate: [
      { label: "复盘对象", placeholder: "哪条已发布内容（标题或正文片段）" },
      { label: "发布结果", placeholder: "平台、播放、互动、咨询等真实数据；没有就留空" },
      { label: "当时的判断", placeholder: "发之前你预期它打中谁、验证什么" },
    ],
    outputAssets: ["内容数据复盘", "有效内容规律", "下次判断依据", "本周动作"],
    skills: CONTENT_RETRO_SKILLS,
    nextActions: [
      { id: "to_business_diagnosis", label: "带入选题策划", targetAgentId: "business_diagnosis", prompt: "请基于下面这份内容数据复盘里已经验证有效的规律，生成下一批选题：优先复用被数据证明有效的选题类型和角度，避开已被验证无效的方向。" },
      { id: "save_knowledge", label: "保存为档案素材", prompt: "保存为 AIM 档案素材。" },
    ],
  },
  persona: {
    intro: "这里是人设故事梳理。它服务于内容主线里的「人设故事」，一步步梳理来时路，最后产出置顶视频脚本。",
    placeholder: "想到什么说什么，乱也没关系。从『某年某月，我…』开始最省事…",
    defaultInstruction: "引导式：每轮只追问一个最关键的缺口并给回答示例，回复必须以【进度 XX%】开头；6 维收齐（100%）后产出『来时路总结 + 逐句口播与配图的置顶视频脚本』；用户说『第N句改X』时只改对应句。口语真诚，避免 AI 腔和过时热点。",
    quickPrompts: [
      "从『某年某月，我出生在…』开始讲我的来时路",
      "我想做一条置顶视频讲清楚我是谁、为什么做现在这件事",
    ],
    primaryActionLabel: "梳理来时路",
    scenarios: ["要讲清楚我是谁", "想做人设故事", "需要置顶视频脚本"],
    inputTemplate: [
      { label: "经历起点", placeholder: "某年某月，我..." },
      { label: "低谷转折", placeholder: "最难的一段经历和变化" },
      { label: "现在业务", placeholder: "现在做什么，服务谁" },
    ],
    outputAssets: ["来时路总结", "人设故事", "置顶视频脚本"],
    skills: PERSONA_SKILLS,
    nextActions: [
      { id: "to_content_producer", label: "带入内容创作", targetAgentId: "content_producer", prompt: "请基于下面人设故事，生成一条置顶视频口播文案，并给出小红书图文笔记、朋友圈文案和后续 12 条人设故事选题。" },
      { id: "save_knowledge", label: "保存为档案素材", prompt: "保存为 AIM 档案素材。" },
    ],
  },
}

/**
 * @description 获取aimagentguide
 * @param agentId - 智能体 ID
 * @returns AimAgentGuide
 */
export function getAimAgentGuide(agentId: string): AimAgentGuide {
  // 归一化旧别名（ip_video → content_producer），兼容历史调用
  return AIM_AGENT_GUIDES[normalizeAimAgentId(agentId) as AimAgentId]
}

/**
 * @description 构建aimnextactionprompt
 * @param action - 操作
 * @param content - 内容
 * @returns string
 */
export function buildAimNextActionPrompt(action: AimNextAction, content: string): string {
  return `${action.prompt}\n\n---\n${content.trim()}\n---`
}
