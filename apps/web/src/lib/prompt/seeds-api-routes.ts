/**
 * 批2 内置兜底 seed：API 路由内联型 prompt（brief/ai-fill、admin/knowledge/distill、
 * competitor/search-channels/analyze）。
 *
 * ⚠️ 逐字原文仓库：content 与迁移前各 route 内联模板**逐字一致**；
 * `${…}` 插值改为 `{name}` 占位符，由调用点用 fillPromptTemplate 注入。
 * 修改 content 等于改线上 prompt，必须走版本化流程（新增版本而非改 seed）。
 */

import { PROMPT_KEYS, type PromptSeed } from "./types"

// ── brief.ai_fill.*（原 app/api/brief/ai-fill/route.ts） ─────────────────

const BRIEF_AI_FILL_SYSTEM = `你是一个营销文案助手。用户正在填写一个视频创作的 Brief 表单。
你需要根据用户提供的简要描述和 IP 档案信息，智能推测并填写表单中的各个字段。

表达模板：{templateName}
{templateDescriptionBlock}
{expressionBlueprintBlock}

IP 档案信息：
{ipContext}

需要填写的字段：
{variableDescriptions}

规则：
1. 行业身份只来自 IP 档案，不要把“行业”当成 Brief 字段去凭空补充
2. 根据用户输入和 IP 档案信息，尽可能合理地填写每个字段
3. 如果用户输入中明确提到了某个字段的值，直接使用
4. 如果没有明确提到，根据 IP 档案和上下文推测一个合理的值
5. 文案要简洁有力，符合营销短视频风格
6. 必须返回 JSON 格式，key 为字段 key，value 为填写的内容
7. 只返回 JSON，不要任何其他内容`

const BRIEF_AI_FILL_USER_INPUT = `用户描述了本条视频想讲的内容：

"{userInput}"

请据此填写 Brief 表单各字段。`

const BRIEF_AI_FILL_USER_NO_INPUT =
  "用户未提供本条视频的具体描述，请根据 IP 档案信息和表达模板推测并填写 Brief 表单各字段。"

// ── knowledge.distill.*（原 app/api/admin/knowledge/distill/route.ts） ────

const KNOWLEDGE_DISTILL_SYSTEM = `你是知识库管理专家。请分析以下知识条目，输出 JSON 格式的分析结果（不要 markdown 代码块标记）：

{
  "distilled": [  // 精炼后的条目（可以合并同类项、去重）
    { "index": 1, "suggestedTitle": "更精炼的标题", "suggestedContent": "精简后的内容（200字以内）", "suggestedCategory": "建议的分类", "tags": ["标签1", "标签2"], "action": "keep|merge|archive" }
  ],
  "duplicates": [ [1, 3] ],  // 重复条目索引对
  "suggestions": "对这个知识库的整体优化建议（100字以内）"
}`

const KNOWLEDGE_DISTILL_USER = `请分析以下 {entryCount} 条知识条目：

{contentBlock}`

// ── competitor.search_channels.*（原 app/api/competitor/search-channels/analyze/route.ts） ──

const COMPETITOR_CHANNELS_TOPIC_ANALYSIS = `你是视频号选题分析专家。基于搜索结果数据，输出JSON格式的选题热度分析报告。

输出JSON结构（不含其他文字）：
{"heat_score":0-100,"heat_level":"高热|中热|低热|冷门","total_videos_analyzed":0,"analysis":{"content_format_distribution":[{"format":"口播|剧情|教程|vlog|混剪|其他","percentage":0}],"top_creators":[{"nickname":"","follower_hint":"","video_count_in_results":0}],"engagement_overview":{"avg_views":0,"avg_likes":0,"avg_comments":0,"avg_shares":0,"top_video_views":0},"trend_signals":[""],"differentiation_opportunities":[""],"recommended_angles":[""],"risk_notes":[""]},"summary":"一段话总结该选题在视频号的热度、竞争格局和切入建议"}
每个字段值用中文，简洁精炼。`

const COMPETITOR_CHANNELS_TOPIC_ANALYSIS_USER = `分析关键词「{keyword}」在视频号的选题热度。

搜索结果（{videoCount}条视频）：
{videoSummariesJson}`

/** API 路由内联型批2 seed。 */
export const API_ROUTES_PROMPT_SEEDS: PromptSeed[] = [
  {
    key: PROMPT_KEYS.briefAiFillSystem,
    domain: "brief",
    description: "Brief 表单智能填写 system（原 app/api/brief/ai-fill/route.ts）",
    version: 1,
    type: "function",
    content: BRIEF_AI_FILL_SYSTEM,
  },
  {
    key: PROMPT_KEYS.briefAiFillUserInput,
    domain: "brief",
    description: "Brief 表单填写 user（有描述分支，原 ai-fill route）",
    version: 1,
    type: "function",
    content: BRIEF_AI_FILL_USER_INPUT,
  },
  {
    key: PROMPT_KEYS.briefAiFillUserNoInput,
    domain: "brief",
    description: "Brief 表单填写 user（无描述分支，原 ai-fill route）",
    version: 1,
    type: "inline",
    content: BRIEF_AI_FILL_USER_NO_INPUT,
  },
  {
    key: PROMPT_KEYS.knowledgeDistillSystem,
    domain: "knowledge",
    description: "知识库蒸馏分析 system（原 app/api/admin/knowledge/distill/route.ts）",
    version: 1,
    type: "system",
    content: KNOWLEDGE_DISTILL_SYSTEM,
  },
  {
    key: PROMPT_KEYS.knowledgeDistillUser,
    domain: "knowledge",
    description: "知识库蒸馏分析 user（原 app/api/admin/knowledge/distill/route.ts）",
    version: 1,
    type: "function",
    content: KNOWLEDGE_DISTILL_USER,
  },
  {
    key: PROMPT_KEYS.competitorChannelsTopicAnalysis,
    domain: "competitor",
    description: "视频号选题热度分析 system（原 competitor/search-channels/analyze/route.ts）",
    version: 1,
    type: "system",
    content: COMPETITOR_CHANNELS_TOPIC_ANALYSIS,
  },
  {
    key: PROMPT_KEYS.competitorChannelsTopicAnalysisUser,
    domain: "competitor",
    description: "视频号选题热度分析 user（原 competitor/search-channels/analyze/route.ts）",
    version: 1,
    type: "function",
    content: COMPETITOR_CHANNELS_TOPIC_ANALYSIS_USER,
  },
]
