import type { AimWorkbenchSkill } from "@/lib/aim-agent-guides"

export const CONTENT_PRODUCER_SKILLS: AimWorkbenchSkill[] = [
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

export const TOPIC_PLANNING_SKILLS: AimWorkbenchSkill[] = [
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

// agentId 固定为 content_review：底层质检引擎的身份标识，供执行链路选择 prompt/模型逻辑，
// 与技能的展示位置（现已合并进作品编辑）无关，不得随入口调整改动。
export const REVIEW_SKILLS: AimWorkbenchSkill[] = [
  { id: "title_review", label: "标题质检", description: "检查标题吸引力、准确性和风险表达。", prompt: "请基于当前文案做标题质检：指出标题是否准确、有钩子、是否夸大或违规，并给最小修改建议。", agentId: "content_review", group: "单项质检" },
  { id: "hook_review", label: "开头钩子质检", description: "检查前三秒是否能抓住用户。", prompt: "请基于当前文案做开头钩子质检：判断前三秒是否有注意力机制、是否啰嗦、是否有冲突或代入感，并给最小修改建议。", agentId: "content_review", group: "单项质检" },
  { id: "structure_review", label: "内容结构质检", description: "检查推进逻辑和信息密度。", prompt: "请基于当前文案做内容结构质检：检查开头、转折、论证、案例、收尾是否顺畅，只给需要改的地方和最小改法。", agentId: "content_review", group: "单项质检" },
  { id: "persona_review", label: "人设一致性质检", description: "检查表达是否像这个账号会说的话。", prompt: "请基于当前文案做人设一致性质检：判断语气、身份、案例和价值观是否符合账号人设，并给最小修改建议。", agentId: "content_review", group: "单项质检" },
  { id: "platform_review", label: "平台适配质检", description: "检查是否适合抖音/小红书/公众号等平台。", prompt: "请基于当前文案做平台适配质检：判断它更适合抖音、小红书、公众号还是朋友圈，并指出发布前需要调整的结构和表达。", agentId: "content_review", group: "单项质检" },
  { id: "conversion_review", label: "转化路径质检", description: "检查是否有自然承接动作。", prompt: "请基于当前文案做转化路径质检：检查目标用户、需求承接、信任理由和行动引导是否清楚，只给自然不硬广的最小改法。", agentId: "content_review", group: "单项质检" },
  { id: "risk_review", label: "风险表达质检", description: "检查违规、限流和 AI 标注提醒。", prompt: "请基于当前文案做风险表达质检：检查违规/限流风险、夸大承诺、绝对化用语、平台敏感表达和 AI 标注提醒，并给最小替换建议。", agentId: "content_review", group: "单项质检" },
  { id: "publish_decision", label: "发布前判断", description: "把这条为什么要发先说清楚。", prompt: "请基于当前文案做发布前判断。固定输出：1. 这条内容现在能不能发；2. 真正会吸引谁；3. 这条最该验证什么；4. 哪一句最容易留下来；5. 如果不建议发，最小修改方向是什么。不要整篇重写。", agentId: "content_review", group: "综合判断" },
]

export const WORK_EDITOR_SKILLS: AimWorkbenchSkill[] = [
  { id: "text_polish", label: "文字二改/润色", description: "对现有成稿去 AI 味、调语气、保真。", prompt: "请对当前文案做文字二改/润色：保留核心意思和事实，明显去 AI 味，调整成更自然的真人表达，纠正错别字和病句，不改变作者立场和关键数据。", agentId: "work_editor", group: "作品编辑" },
  { id: "wechat_layout", label: "公众号排版", description: "把成稿整理成公众号可读结构。", prompt: "请把当前素材整理成适合公众号发布的结构：优化段落长度、补充小标题、梳理开篇钩子和结尾引导，输出可直接用于公众号的正文，配图位置用【配图：说明】标注。", agentId: "work_editor", group: "作品编辑" },
  { id: "xiaohongshu_edit", label: "小红书图文", description: "改写成小红书图文笔记结构。", prompt: "请把当前内容改写成小红书图文笔记：输出小红书标题 5 个、封面主标题/副标题、正文、2-5 个话题标签、8 页图文结构与逐页配图脚本；每页只讲一个信息点，手机端一眼读懂。", agentId: "work_editor", group: "作品编辑" },
]

export const BUSINESS_SYSTEM_SKILLS: AimWorkbenchSkill[] = [
  { id: "business_bottleneck", label: "诊断业务卡点", description: "找流量、成交、交付中的核心矛盾。", prompt: "请基于当前业务信息诊断核心卡点，找出流量、成交、交付中的主要矛盾，并给本周最小动作。", agentId: "business_system_diagnosis", group: "诊断分析" },
  { id: "content_pillar_from_business", label: "反推内容主线", description: "从商业目标倒推内容方向。", prompt: "请基于当前商业模式，反推出最值得优先做的内容主线和选题方向。", agentId: "business_system_diagnosis", group: "诊断分析" },
]

export const CONTENT_RETRO_SKILLS: AimWorkbenchSkill[] = [
  {
    id: "single_content_retro",
    label: "复盘这条内容",
    description: "只看这一条的真实数据，说清打中了什么、下次怎么判断。",
    prompt: "请基于当前内容的真实发布数据做复盘：先用人话说结果，再说它打中了什么、没打中什么，我这次的判断哪里对哪里错，下次遇到同类内容该怎么判断，最后只给 1-3 条能继续执行的动作。没有登记数据就直接说缺数据，不要编数字，也不要写新文案。",
    agentId: "content_retro",
    group: "单条复盘",
  },
  {
    id: "effective_content_pattern",
    label: "找有效内容规律",
    description: "对比多条已发布数据，找出真正能复用的规律。",
    prompt: "请基于当前内容和已登记的多条发布数据，找出真正有效的内容规律：哪些选题类型、开头方式、内容角度稳定拿到结果，哪些反复无效。只用真实数据支撑，样本不足就直接说样本不足，不要用行业常识凑结论。",
    agentId: "content_retro",
    group: "规律沉淀",
  },
  {
    id: "retro_next_actions",
    label: "定下一步动作",
    description: "把复盘结论变成本周能执行的具体动作。",
    prompt: "请基于当前内容的复盘结论，只给 1-3 条本周能落地的具体动作：每条说明为什么做、先做哪一步、做完看哪个指标。不要给方向性口号，不要重写文案。",
    agentId: "content_retro",
    group: "规律沉淀",
  },
]

export const PERSONA_SKILLS: AimWorkbenchSkill[] = [
  { id: "story_gap", label: "追问来时路", description: "补齐人设故事关键缺口。", prompt: "请基于当前信息，只追问一个最关键的人设故事缺口，并给回答示例。", agentId: "persona", group: "人设梳理" },
  { id: "pinned_story_video", label: "生成置顶视频", description: "把人设故事写成置顶口播（需先完成来时路梳理）。", prompt: "请检查当前人设故事来时路进度：如果 6 维尚未收齐（进度未到 100%），先指出还缺哪些维度并追问最关键的一个缺口；如果已收齐，直接基于来时路总结生成一条置顶视频口播脚本。", agentId: "persona", group: "人设梳理" },
]
