import type { AimAgentId } from "@/lib/aim-ui-config"
import { normalizeAimAgentId } from "@/lib/aim-ui-config"

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

const CONTENT_PRODUCER_SKILLS: AimWorkbenchSkill[] = [
  {
    id: "optimize_opening_hook",
    label: "改开头钩子",
    description: "按爆款开头创作规则，输出更能停留和转化的开头钩子。",
    prompt: "请基于当前文案优化开头钩子：保留原稿核心选题和情绪，调用爆款开头创作规则，优先使用人物标签、业务标签、痛点、利益、反差、悬念和具体场景。至少给 10 条开头候选，每条标注类型和适合场景，再补 3 个开头画面建议，最后选出最适合转化的 3 条并说明理由。不要输出正文，不要顺手重写整篇。",
    agentId: "content_producer",
    group: "改写优化",
  },
  {
    id: "rewrite_existing_copy",
    label: "重写这版文案",
    description: "保留原意，重写成更像真人表达的版本。",
    prompt: "请基于当前内容改写现有文案：保留核心意思和关键事实，明显去 AI 味，至少 30% 可感知重写，输出一版可直接发布的文案。",
    agentId: "content_producer",
    group: "改写优化",
  },
  {
    id: "viral_recreation",
    label: "按爆款逻辑重写",
    description: "学习选题、钩子和冲突，不照搬原句。",
    prompt: "请基于当前对标内容做爆款再创作：只学习选题逻辑、开头机制、观点冲突和情绪触发，用我的立场、人设、案例和业务场景重构；如果我没有另写明确字数，字数再参考对标原文 95%-105%。",
    agentId: "content_producer",
    group: "改写优化",
  },
  {
    id: "hot_topic_copy",
    label: "借热点写观点",
    description: "把热点转成适合账号的观点图文，不是口播脚本。",
    prompt: "请基于当前热点和我的业务，追热点写一条适合本账号发布的观点内容（图文/文案，不是口播脚本）：不要硬蹭，先给我的判断，再落到客户场景、业务价值和行动引导。",
    agentId: "content_producer",
    group: "改写优化",
  },
  {
    id: "oral_script",
    label: "口播脚本",
    description: "热点口播 / 现场口播 / 观点口播，自动识别类型并生成可拍摄脚本。",
    prompt: [
      "请基于当前素材生成短视频口播脚本。先自动判断输入类型：",
      "类型 A 热点口播：包含热点事件 → 先输出热点评估（适配度 X/10、切入角度、风险提示），适配度低于 6 分提示不建议强蹭；",
      "类型 B 现场口播：包含经历/现场/感受 → 调用事件内容化五步法「真实事件 -> 关键矛盾 -> 核心观点 -> 用户价值 -> 内容表达」，用第一人称还原现场；",
      "类型 C 观点口播：包含判断/观点 → 第一句先给明确判断，再解释为什么、适合谁、不适合谁；",
      "类型 D 参考爆款口播：包含参考口播/对标脚本 → 先拆结构（前 3 秒钩子、情绪冲突、节奏结构、可迁移部分），不得照抄原句。",
      "默认输出 3-5 条脚本，未指定平台按抖音/小红书短视频处理，默认 60 秒以内。",
      "每条必须包含：标题、前 3 秒钩子、口播正文、镜头表现建议、结尾行动引导。",
      "口播正文必须像真人说话，使用短句，开头有停留理由，中间有冲突/反差，结尾有行动引导。",
      "不得硬蹭热点，不得娱乐化处理敏感、负面、灾难、伤亡、政治争议事件。",
    ].join("\n"),
    agentId: "content_producer",
    group: "热点口播",
  },
  {
    id: "xiaohongshu_image_text",
    label: "生成小红书图文",
    description: "生成标题、正文、封面短句和 8 页图文脚本。",
    prompt: "请基于当前素材生成一套小红书图文笔记：复用 AIM 的小红书图文视觉导演结构，输出小红书标题 5 个、封面主标题/副标题、正文、2-5 个话题标签、8 页图文结构、逐页配图脚本、发布前自检。每页只讲一个信息点，手机端一眼读懂，不要写成 PPT 课件；话题里至少包含 1 个品牌/IP/账号相关标签。",
    agentId: "content_producer",
    group: "平台内容",
  },
  {
    id: "lead_gen_copy",
    label: "生成获客成交文案",
    description: "围绕客户痛点和承接动作写成交向内容。",
    prompt: "请基于当前内容生成获客文案：先点出目标客户的真实问题，再给出我的解决思路和服务价值，最后加入自然的承接动作，不要夸大承诺。",
    agentId: "content_producer",
    group: "平台内容",
  },
  {
    id: "content_fission",
    label: "内容裂变",
    description: "把一篇核心内容拆成全平台可发布物料。",
    prompt: [
      "请基于当前核心内容一键裂变为多平台可发布物料：",
      "输出公众号文章/深度长文、短视频口播、小红书图文笔记、朋友圈文案、Vlog 分镜脚本。",
      "每种物料独立成稿，可直接发布；话题里至少包含 1 个品牌/IP/账号相关话题。",
      "不要输出排产表或后续选题（排产请用「生成发布计划」）。",
    ].join("\n"),
    agentId: "content_producer",
    group: "裂变排产",
  },
]

const TOPIC_PLANNING_SKILLS: AimWorkbenchSkill[] = [
  {
    id: "choose_benchmark",
    label: "选择对标账号 / 对标内容",
    description: "明确该看谁、看什么、借鉴哪一层。",
    prompt: "请基于当前业务和目标客户，帮我选择对标账号/对标内容：说明选择标准、适合参考的内容类型、不能照抄的部分，以及下一步怎么拆解。",
    agentId: "business_diagnosis",
    group: "方向判断",
  },
  {
    id: "purpose_topics",
    label: "按目的生成选题",
    description: "曝光 / 获客 / 信任 / 成交，先定目的再出选题。",
    prompt: [
      "请先判断当前内容最适合服务哪个目的（曝光/获客/信任/成交），并说明为什么不是另外三个目的，再围绕该目的生成选题。不要直接写文案。",
      "曝光目的：重点找反差、热点、争议、强痛点、反常识和行业误区；",
      "获客目的：重点找客户正在遇到的具体问题、想解决但不会解决的场景、能自然引导咨询的入口；",
      "信任目的：重点找真实案例、服务过程、现场细节、专业判断、避坑经验和风险边界；",
      "成交目的：重点讲清适合谁、不适合谁、解决什么问题、为什么现在该行动、下一步怎么联系。",
      "每条输出：选题标题、目标人群、开头钩子、承接动作、风险边界。",
    ].join("\n"),
    agentId: "business_diagnosis",
    group: "生成选题",
  },
  {
    id: "pillar_topics",
    label: "按主线生成选题池",
    description: "人设 / 热点 / 问题解答 / 观点，四类主线一次出池。",
    prompt: [
      "请先判断当前素材最适合哪条内容主线（人设/热点/问题解答/观点），说明判断理由，再按四条主线生成选题池（重点展开推荐主线）：",
      "人设类：围绕来时路、关键转折、价值观、行业经历和真实案例；",
      "热点类：热点只能辅助，不硬蹭，每条说明和本账号、目标客户、产品服务的关系；",
      "问题解答类：优先高频、强痛点、能体现专业能力的问题，客户案例和业务价值并入；",
      "观点类：每条要有明确判断、争议点、旧认知和新认知。",
      "每条给出开头钩子和内容角度，并标注推荐优先级。",
    ].join("\n"),
    agentId: "business_diagnosis",
    group: "生成选题",
  },
  {
    id: "select_high_potential_topics",
    label: "筛选高潜选题",
    description: "从选题池里挑更容易出结果的题。",
    prompt: "请基于当前选题池筛选高潜选题：按热点类、人设类、问题解答类、观点类归类，再按目标人群痛感、传播冲突、账号匹配度、转化承接、可持续拆分五项评分，选出最值得先做的 12 条。",
    agentId: "business_diagnosis",
    group: "筛选决策",
  },
  {
    id: "pre_publish_decision",
    label: "判断这条值不值得做",
    description: "先把为什么做、想打到谁、准备验证什么说清楚。",
    prompt: "请基于当前选题或文案，判断这条内容值不值得做。固定输出：1. 这条为什么值得做；2. 最可能打中的人是谁；3. 用户会因为哪句话停下来；4. 发完最该看哪一个结果；5. 不值得做时直接说明原因。不要写空话。",
    agentId: "business_diagnosis",
    group: "筛选决策",
  },
  {
    id: "benchmark_asset_flywheel",
    label: "对标资产生成选题池",
    description: "把账号池、代表作和结构拆解转成分级选题资产。",
    prompt: "请基于当前对标资产（账号池、置顶视频/首屏代表作、结构拆解或爆款研究结果），整理成一份《对标选题资产包》。固定输出：1. 赛道共性判断（只保留 5 条最稳定的爆点结构）；2. 账号池摘要（账号名、为什么值得盯、适合学哪一层）；3. 代表作拆解表（至少 8 条，字段固定为：来源账号、原始标题、内容类型、开头钩子、用户痛点、爆点来源、可迁移角度、格式模板）；4. 30 条可直接开拍的候选选题；5. 5 条 S 级优先选题；6. 10 条 A 级连续栏目选题；7. 每条 S/A 选题补充：为什么值得拍、先准备什么、拍完导向哪里。不要照搬对标标题，重点提取可复用结构；没有依据的地方写未提供/待补充。",
    agentId: "business_diagnosis",
    group: "筛选决策",
  },
  {
    id: "meeting_minutes_topics",
    label: "会议纪要提炼选题",
    description: "从会议纪要提炼核心选题或完整资产包。",
    prompt: [
      "请基于当前会议纪要提炼选题。先判断用户要的是「单核心选题」还是「完整资产包」：",
      "单核心选题：只提炼一个最值得马上进入文案创作的核心选题，输出：核心选题标题、为什么只选它、目标受众、开头钩子、内容主线（三段以内）、必用会议原话/事实、文案创作交接说明；",
      "完整资产包：输出：会议一句话结论、关键信息抽取表（至少 8 条）、核心矛盾/机会、可拍选题池（至少 12 条）、优先级最高的 3 条、可沉淀知识库素材、待补充信息。",
      "不要做流水账总结，不要结尾反问是否继续。所有结论必须能追溯到会议纪要，缺失信息标注待补充。",
    ].join("\n"),
    agentId: "business_diagnosis",
    group: "会议纪要",
  },
  {
    id: "meeting_minutes_execution",
    label: "会议纪要执行物料",
    description: "任务清单 / 采访清单 / 问卷表 / 脚本模板。",
    prompt: [
      "请基于当前核心选题和会议纪要生成执行物料。先判断用户要哪一类（可多选）：",
      "任务清单：字段为任务、负责人/角色、截止时间或节奏、输入材料、交付物、验收标准、关联选题；",
      "采访清单：按采访对象分组，字段为采访对象、问题、追问、想拿到的原话/证据、拍摄提醒；",
      "问卷表：字段为问题、题型、选项或填空提示、用途、对应选题/判断，问题要短便于填写；",
      "脚本模板：结构为 3 秒开头钩子、背景交代、三段内容推进、必用会议原话/事实、画面建议、结尾承接。",
      "未指定时默认输出任务清单 + 脚本模板。不要输出选题库或完整资产包。",
    ].join("\n"),
    agentId: "business_diagnosis",
    group: "会议纪要",
  },
]

const REVIEW_SKILLS: AimWorkbenchSkill[] = [
  { id: "title_review", label: "标题质检", description: "检查标题吸引力、准确性和风险表达。", prompt: "请基于当前文案做标题质检：指出标题是否准确、有钩子、是否夸大或违规，并给最小修改建议。", agentId: "content_review", group: "单项质检" },
  { id: "hook_review", label: "开头钩子质检", description: "检查前三秒是否能抓住用户。", prompt: "请基于当前文案做开头钩子质检：判断前三秒是否有注意力机制、是否啰嗦、是否有冲突或代入感，并给最小修改建议。", agentId: "content_review", group: "单项质检" },
  { id: "structure_review", label: "内容结构质检", description: "检查推进逻辑和信息密度。", prompt: "请基于当前文案做内容结构质检：检查开头、转折、论证、案例、收尾是否顺畅，只给需要改的地方和最小改法。", agentId: "content_review", group: "单项质检" },
  { id: "persona_review", label: "人设一致性质检", description: "检查表达是否像这个账号会说的话。", prompt: "请基于当前文案做人设一致性质检：判断语气、身份、案例和价值观是否符合账号人设，并给最小修改建议。", agentId: "content_review", group: "单项质检" },
  { id: "platform_review", label: "平台适配质检", description: "检查是否适合抖音/小红书/公众号等平台。", prompt: "请基于当前文案做平台适配质检：判断它更适合抖音、小红书、公众号还是朋友圈，并指出发布前需要调整的结构和表达。", agentId: "content_review", group: "单项质检" },
  { id: "conversion_review", label: "转化路径质检", description: "检查是否有自然承接动作。", prompt: "请基于当前文案做转化路径质检：检查目标用户、需求承接、信任理由和行动引导是否清楚，只给自然不硬广的最小改法。", agentId: "content_review", group: "单项质检" },
  { id: "risk_review", label: "风险表达质检", description: "检查违规、限流和 AI 标注提醒。", prompt: "请基于当前文案做风险表达质检：检查违规/限流风险、夸大承诺、绝对化用语、平台敏感表达和 AI 标注提醒，并给最小替换建议。", agentId: "content_review", group: "单项质检" },
  { id: "publish_decision", label: "发布前判断", description: "把这条为什么要发先说清楚。", prompt: "请基于当前文案做发布前判断。固定输出：1. 这条内容现在能不能发；2. 真正会吸引谁；3. 这条最该验证什么；4. 哪一句最容易留下来；5. 如果不建议发，最小修改方向是什么。不要整篇重写。", agentId: "content_review", group: "综合判断" },
]

const DEEP_COPYWRITER_SKILLS: AimWorkbenchSkill[] = [
  { id: "text_polish", label: "文字二改/润色", description: "对现有成稿去 AI 味、调语气、保真。", prompt: "请对当前文案做文字二改/润色：保留核心意思和事实，明显去 AI 味，调整成更自然的真人表达，纠正错别字和病句，不改变作者立场和关键数据。", agentId: "deep_copywriter", group: "作品编辑" },
  { id: "wechat_layout", label: "公众号排版", description: "把成稿整理成公众号可读结构。", prompt: "请把当前素材整理成适合公众号发布的结构：优化段落长度、补充小标题、梳理开篇钩子和结尾引导，输出可直接用于公众号的正文，配图位置用【配图：说明】标注。", agentId: "deep_copywriter", group: "作品编辑" },
  { id: "xiaohongshu_edit", label: "小红书图文", description: "改写成小红书图文笔记结构。", prompt: "请把当前内容改写成小红书图文笔记：输出小红书标题 5 个、封面主标题/副标题、正文、2-5 个话题标签、8 页图文结构与逐页配图脚本；每页只讲一个信息点，手机端一眼读懂。", agentId: "deep_copywriter", group: "作品编辑" },
]

const BUSINESS_SYSTEM_SKILLS: AimWorkbenchSkill[] = [
  { id: "business_bottleneck", label: "诊断业务卡点", description: "找流量、成交、交付中的核心矛盾。", prompt: "请基于当前业务信息诊断核心卡点，找出流量、成交、交付中的主要矛盾，并给本周最小动作。", agentId: "business_system_diagnosis", group: "诊断分析" },
  { id: "content_pillar_from_business", label: "反推内容主线", description: "从商业目标倒推内容方向。", prompt: "请基于当前商业模式，反推出最值得优先做的内容主线和选题方向。", agentId: "business_system_diagnosis", group: "诊断分析" },
  { id: "content_data_retro", label: "内容数据复盘", description: "把结果、判断和下次打法拆开看。", prompt: "请基于当前内容的发布结果做内容数据复盘（注意：这是单条内容运营复盘，不是商业模式诊断，不需要走四层诊断结构）。固定输出：1. 结果先说人话；2. 这条内容打中了什么，没打中什么；3. 这次判断哪里对，哪里错；4. 下次遇到同类内容该怎么判断；5. 只给 1-3 条能继续执行的动作。不要讲大词。", agentId: "business_system_diagnosis", group: "诊断分析" },
]

const PERSONA_SKILLS: AimWorkbenchSkill[] = [
  { id: "story_gap", label: "追问来时路", description: "补齐人设故事关键缺口。", prompt: "请基于当前信息，只追问一个最关键的人设故事缺口，并给回答示例。", agentId: "persona", group: "人设梳理" },
  { id: "pinned_story_video", label: "生成置顶视频", description: "把人设故事写成置顶口播（需先完成来时路梳理）。", prompt: "请检查当前人设故事来时路进度：如果 6 维尚未收齐（进度未到 100%），先指出还缺哪些维度并追问最关键的一个缺口；如果已收齐，直接基于来时路总结生成一条置顶视频口播脚本。", agentId: "persona", group: "人设梳理" },
]

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
      { id: "to_deep_copywriter", label: "带入作品编辑", targetAgentId: "deep_copywriter", prompt: "请把下面成稿做作品编辑：文字二改/润色、公众号排版或小红书图文改写。" },
      { id: "save_knowledge", label: "保存为档案素材", prompt: "保存为 AIM 档案素材。" },
    ],
  },
  deep_copywriter: {
    intro: "这里是作品编辑。把成稿或素材给我，我做文字二改/润色、公众号排版、小红书图文改写，让作品更适合发布。",
    placeholder: "粘贴成稿或素材，告诉我做文字润色、公众号排版还是小红书图文改写…",
    defaultInstruction: "只做作品编辑：文字二改/润色、公众号排版、小红书图文改写。先判断用户当前要做哪一类编辑，再直接输出对应成品，不强制先出框架或追问。润色时保留作者立场、关键事实和真实数据，明显去 AI 味；公众号排版时优化段落和小标题，配图位置用【配图：说明】标注；小红书图文按标题、封面、正文、话题、逐页脚本输出。不输出拆分方向、私域话术、其他平台分发内容或“你看是否符合”这类确认尾句。热点只能自然融合，禁止硬蹭或编造。",
    quickPrompts: [
      "把这版成稿做文字二改/润色，去 AI 味，保住我的立场和事实。",
      "把这篇成稿整理成公众号排版结构，补小标题，标注配图位置。",
      "把这段内容改写成小红书图文笔记，给标题、封面、正文和逐页脚本。",
    ],
    primaryActionLabel: "编辑作品",
    scenarios: ["文字二改/润色", "公众号排版", "小红书图文改写"],
    inputTemplate: BASIC_INPUT_TEMPLATE,
    outputAssets: ["润色成稿", "公众号排版正文", "小红书图文笔记"],
    skills: DEEP_COPYWRITER_SKILLS,
    nextActions: [
      { id: "to_content_producer", label: "带入内容文案创作", targetAgentId: "content_producer", prompt: "请把下面作品改写成短视频口播、小红书图文笔记、朋友圈文案、Vlog 分镜脚本和后续 12 条发布选题。" },
      { id: "publish_package", label: "生成发布计划", prompt: PUBLISH_PLAN_PROMPT },
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
      { id: "to_content_producer", label: "带入内容文案创作", targetAgentId: "content_producer", prompt: "请基于下面灵感选题策划，先选择一个高潜选题，生成短视频口播，并给出小红书图文、朋友圈文案和后续 12 条发布选题。" },
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
      "这条内容发完了，帮我按数据结果复盘，下次同类内容怎么判断。",
    ],
    primaryActionLabel: "生成诊断报告",
    scenarios: ["业务卡住了", "流量和成交不匹配", "需要先找核心矛盾"],
    inputTemplate: BASIC_INPUT_TEMPLATE,
    outputAssets: ["商业诊断报告", "核心矛盾", "调整路径", "本周动作", "内容数据复盘"],
    skills: BUSINESS_SYSTEM_SKILLS,
    nextActions: [
      { id: "to_business_diagnosis", label: "带入灵感选题策划", targetAgentId: "business_diagnosis", prompt: "请基于下面商业诊断结果和客户知识库，生成一份《天命IP资产化操盘全案》。走天命IP资产化操盘全案路由，按 12 个客户结果段输出：项目总判断、天命底盘、IP主定位、目标客户、核心问题、IP价值、产品设计、内容系统、流量闭环、私域成交、交付资产化、行动处方。方法论只做后台推理，不要把定位公式、方法论名称、模块解释或占位模板原样呈现给用户。天命底盘没有命理资料时写「未提供/待补充」，不编造。每段都要结合客户事实，能指导后续选题、文案、产品承接、私域成交和交付资产化。" },
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
      { id: "to_content_producer", label: "带入内容文案创作", targetAgentId: "content_producer", prompt: "请基于下面人设故事，生成一条置顶视频口播文案，并给出小红书图文笔记、朋友圈文案和后续 12 条人设故事选题。" },
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
