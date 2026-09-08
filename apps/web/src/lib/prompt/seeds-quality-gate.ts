/**
 * 批1 内置兜底 seed：四维质量门控 prompt（原 lib/quality-gate.ts）。
 *
 * ⚠️ 逐字原文仓库：content 与迁移前 quality-gate.ts 里的模板常量
 * **逐字一致**；`{name}` 占位符语法与原私有 fillTemplate 完全相同，
 * 由调用点用 fillPromptTemplate 注入。修改 content 等于改线上 prompt，
 * 必须走版本化流程（新增版本而非改 seed）。
 */

import { PROMPT_KEYS, type PromptSeed } from "./types"

const QUALITY_GATE_EVALUATION_SYSTEM =
  "你是一个专业的新媒体内容质量评估专家。只输出纯 JSON，不要 Markdown 代码块标记。"

const QUALITY_GATE_EVALUATION = `你是一位顶级的新媒体运营与短视频内容质量评估专家。请针对以下短视频文案进行全方位的打分评估。

【IP 人设信息】
{persona}

【选题与结构要求】
- 选题标题：{topicTitle}
- 开头类型：{openingType}
- 文案结构：{structure}
- 结尾类型：{endingType}

【文案内容】
---
{content}
---

评估维度与评分标准：
1. editorial (编辑质量，及格线 7 分，满分 10 分)：
   - 结构完整性（开头-主体-结尾是否完整）
   - 可读性（语言是否流畅、易读、适合口播）
   - 人设匹配度（语气风格是否符合人设）

2. attraction (吸引力，及格线 7 分，满分 10 分)：
   - 开头钩子强度（前3秒能否抓人，是否契合开头类型）
   - 价值留人：内容是否值得收藏与复访（收藏率 + 复访率预估，即可持续停留能力）——这是抖音当前第一权重
   - 悬念设置（是否让用户想回看或继续看）
   - 注意：不要用“完播率”作为长视频的吸引力判据。抖音已不再考察完播率，长视频完播率天然偏低，但只要收藏、复访、铁粉互动表现好，依然属于高吸引力内容。

3. logic (逻辑一致性，及格线 7 分，满分 10 分)：
   - 文案是否紧密围绕选题展开，论点与论据是否匹配
   - 文案结构与所选结构类型是否吻合

请输出 JSON 格式（不要包含任何 markdown 代码块标记，不要多余解释）：
{
  "editorial": {
    "score": <1-10>,
    "feedback": "<一句话改进建议>",
    "details": "<详细分析>"
  },
  "attraction": {
    "score": <1-10>,
    "feedback": "<一句话改进建议>",
    "details": "<详细分析>"
  },
  "logic": {
    "score": <1-10>,
    "feedback": "<一句话改进建议>",
    "details": "<详细分析>"
  }
}`

const QUALITY_GATE_REWRITE = `你是一位资深短视频文案专家。以下文案未通过质量门控，请根据反馈重写。

原始文案：
---
{content}
---

质量反馈：
- 编辑质量: {editorialScore}/10 — {editorialFeedback}
- AI 味: {aiTasteScore}/10 — {aiTasteFeedback}
- 吸引力: {attractionScore}/10 — {attractionFeedback}
- 逻辑一致: {logicScore}/10 — {logicFeedback}

IP 人设：{persona}
选题：{topicTitle}
开头类型：{openingType}
文案结构：{structure}
结尾类型：{endingType}

重写要求：
1. 保持 100-250 字（短视频口播）
2. 前 3 秒必须有强力钩子
3. 口语化、有节奏感、无 AI 味
4. 紧密围绕选题展开
5. 不要使用禁词和排比句式
6. 直接输出文案正文，不要任何解释`

const QUALITY_GATE_REWRITE_SYSTEM =
  "你是一位精益求精的短视频文案靶向编辑器。直接输出改写融合后的完整文案正文，不要任何解释。"

const QUALITY_GATE_HOOK_REWRITE = `你是一位顶级短视频文案专家。当前文案在开头前3秒的吸引力上得分过低，请对其进行【靶向开头重构】。

【选题标题】：{topicTitle}
【要求的开头类型】：{openingType}
【吸引力缺陷反馈】：{attractionFeedback}
【IP 设定信息】：{persona}

【原始完整文案】：
---
{content}
---

【任务要求】：
1. 仅针对原始文案的【前3秒钩子（开头句，通常为前 30-50 字）】进行强力重构，使其能够瞬间抓住用户眼球、引发强烈好奇心或产生共鸣，完美吻合指定的开头类型。
2. 必须保持文案的中段叙事逻辑、主体讨论、事实证据和结尾的行动号召（CTA）100% 不变，不能修改、删减或添加多余内容！
3. 最终输出重构融合后的完整文案，要求开头与主体段落过渡平滑、自然流畅。
4. 直接输出重构融合后的完整文案正文，不要包含任何旁白、解释、括号说明，不要带 markdown 标记。`

const QUALITY_GATE_ORAL_REWRITE = `你是一位顶级短视频内容编辑器。当前文案被检测出 AI 写作痕迹过重，书面词与套路过多，请进行【靶向口语去油精修】。

【命中的 AI 特征】：{aiTasteHits}
【口语化改进建议】：{aiTasteFeedback}

【原始完整文案】：
---
{content}
---

【任务要求】：
1. 仔细阅读原始文案，识别并彻底剔除其中所有生硬、书面官腔、或套路化的 AI 词汇（如：赋能、痛点、赛道、底层逻辑、闭环、矩阵等）及生硬排比。
2. 必须保持文案的原意、核心事实、论点以及整体叙事逻辑段落结构 100% 不变。
3. 将生硬的文章式过渡（如“首先...其次...最后...”）替换为极其自然的口头语气衔接，长句拆为轻松、有节奏感的短句，增加口播真实感。
4. 直接输出去油精修后的完整文案正文，不要包含任何多余的解释，不要带 markdown 标记。`

const QUALITY_GATE_LOGIC_REWRITE = `你是一位严格的短视频内容逻辑总监。当前文案中段论述与选题或叙事蓝图契合度较低，论证不够严密，请进行【靶向逻辑链重构】。

【选题标题】：{topicTitle}
【期望的叙事结构】：{structure}
【逻辑缺陷反馈】：{logicFeedback}

【原始完整文案】：
---
{content}
---

【任务要求】：
1. 必须保留原本优秀的开头前3秒钩子与结尾 CTA 引导，切勿修改它们。
2. 仅针对中段的主体论述，调整论点与论据的承接关系，优化中段逻辑结构，使其紧密围绕选题，完美吻合期望的视频叙事节拍。
3. 确保文案前后的逻辑链连贯，没有偏离主题或自相矛盾的地方，逻辑环环相扣。
4. 直接输出融合重构后的完整文案正文，不要包含任何多余的解释，不要带 markdown 标记。`

const QUALITY_GATE_EDITORIAL_REWRITE = `你是一位顶级短视频新媒体运营总监。当前文案的编辑质量（语气人设、句式流畅度）不足，请进行【靶向编辑质量精修】。

【期望的 IP 人设与语气】：{persona}
【编辑缺陷反馈】：{editorialFeedback}

【原始完整文案】：
---
{content}
---

【任务要求】：
1. 调整整篇文案的用词语气，使其 100% 契合期望的 IP 人设口吻，做到自然、温和或有力量，适合口播。
2. 修复文案中结构松散或口播不够连贯流畅的地方，理顺语气过渡，使其朗朗上口。
3. 保持原有的核心事实与论点不变。
4. 直接输出精修后的完整文案正文，不要包含任何多余的解释，不要带 markdown 标记。`

/** 质量门控批1 seed。 */
export const QUALITY_GATE_PROMPT_SEEDS: PromptSeed[] = [
  {
    key: PROMPT_KEYS.qualityGateEvaluationSystem,
    domain: "quality",
    description: "质量评估 system（原 quality-gate.ts 内联字符串）",
    version: 1,
    type: "system",
    content: QUALITY_GATE_EVALUATION_SYSTEM,
  },
  {
    key: PROMPT_KEYS.qualityGateEvaluation,
    domain: "quality",
    description: "四维综合评估模板（原 quality-gate.ts COMBINED_EVALUATION_PROMPT）",
    version: 1,
    type: "function",
    content: QUALITY_GATE_EVALUATION,
  },
  {
    key: PROMPT_KEYS.qualityGateRewrite,
    domain: "quality",
    description: "通用重写模板（原 quality-gate.ts REWRITE_PROMPT）",
    version: 1,
    type: "function",
    content: QUALITY_GATE_REWRITE,
  },
  {
    key: PROMPT_KEYS.qualityGateRewriteSystem,
    domain: "quality",
    description: "靶向重写 system（原 quality-gate.ts 内联字符串）",
    version: 1,
    type: "system",
    content: QUALITY_GATE_REWRITE_SYSTEM,
  },
  {
    key: PROMPT_KEYS.qualityGateHookRewrite,
    domain: "quality",
    description: "靶向开头重构模板（原 quality-gate.ts HOOK_REWRITE_PROMPT）",
    version: 1,
    type: "function",
    content: QUALITY_GATE_HOOK_REWRITE,
  },
  {
    key: PROMPT_KEYS.qualityGateOralRewrite,
    domain: "quality",
    description: "靶向口语去油模板（原 quality-gate.ts ORAL_REWRITE_PROMPT）",
    version: 1,
    type: "function",
    content: QUALITY_GATE_ORAL_REWRITE,
  },
  {
    key: PROMPT_KEYS.qualityGateLogicRewrite,
    domain: "quality",
    description: "靶向逻辑链重构模板（原 quality-gate.ts LOGIC_REWRITE_PROMPT）",
    version: 1,
    type: "function",
    content: QUALITY_GATE_LOGIC_REWRITE,
  },
  {
    key: PROMPT_KEYS.qualityGateEditorialRewrite,
    domain: "quality",
    description: "靶向编辑质量精修模板（原 quality-gate.ts EDITORIAL_REWRITE_PROMPT）",
    version: 1,
    type: "function",
    content: QUALITY_GATE_EDITORIAL_REWRITE,
  },
]
