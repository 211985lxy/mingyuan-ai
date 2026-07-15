/**
 * 评论分析模块：采样、LLM 洞察、Zod 输出验证。
 */

import { LLMClient } from '@/lib/llm'
import { AnalysisResultSchema, type AnalysisResult } from './schemas'

const MAX_SAMPLE = 30
const TEXT_CAP = 120

export interface SampledComment { id: string; text: string; nickname: string | null; likes: number; isTop: boolean }

/** 采样：置顶优先，再按点赞降序，上限 MAX_SAMPLE，文本截断 */
export function sampleComments(comments: SampledComment[], limit = MAX_SAMPLE): SampledComment[] {
  const sorted = [...comments].sort((a, b) => {
    if (a.isTop !== b.isTop) return a.isTop ? -1 : 1
    return b.likes - a.likes
  })
  return sorted.slice(0, limit).map(c => ({
    ...c,
    text: c.text.length > TEXT_CAP ? c.text.slice(0, TEXT_CAP) + '...' : c.text,
  }))
}

/** 去除 markdown 代码围栏 */
export function stripFences(raw: string): string {
  let s = raw.trim()
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  return s.trim()
}

/** Zod 解析 + 纠错，失败返回 null */
export function parseAnalysisResult(raw: string): AnalysisResult | null {
  try {
    const obj = JSON.parse(stripFences(raw))
    // 截断 representativeComments 到 3 条
    if (Array.isArray(obj.topics)) {
      for (const t of obj.topics) {
        if (Array.isArray(t.representativeComments)) t.representativeComments = t.representativeComments.slice(0, 3)
      }
    }
    const parsed = AnalysisResultSchema.safeParse(obj)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

const SYSTEM_PROMPT = `你是短视频评论洞察分析师。分析评论数据，提炼用户关注的话题、情感倾向和选题建议。
输出严格 JSON 格式，不含其他文字。`

function buildUserPrompt(comments: SampledComment[], total: number, platform: string): string {
  const compact = comments.map(c => ({ t: c.text, n: c.nickname ?? '', l: c.likes, top: c.isTop }))
  return `分析以下${platform}评论数据（共${total}条，已采样${comments.length}条）。

字段：t=评论内容, n=昵称, l=点赞数, top=是否置顶

## 评论样本
${JSON.stringify(compact)}

输出JSON结构：
{"summary":"100字以内评论洞察总结","topics":[{"title":"话题标题","frequency":出现次数,"representativeComments":["代表评论1","代表评论2"],"sentiment":"positive/negative/neutral"}],"suggestedTopics":[{"title":"建议选题标题","rationale":"选题理由","angle":"切入角度"}]}

要求：
- topics 最多5个，按frequency降序
- representativeComments 每个话题最多3条
- suggestedTopics 最多3个
- 所有文本使用中文
- 基于评论数据，不可臆测`
}

/** 调用 LLM 分析评论，返回结构化结果 */
export async function analyzeComments(
  comments: SampledComment[],
  total: number,
  platform: string,
): Promise<AnalysisResult> {
  const sampled = sampleComments(comments)
  const llm = LLMClient.shared()
  const response = await llm.complete({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(sampled, total, platform) },
    ],
    temperature: 0.3,
    maxTokens: 2000,
    responseFormat: { type: 'json_object' },
  })
  const result = parseAnalysisResult(response.content)
  if (!result) throw new Error('AI 分析结果解析失败，请重试')
  return result
}
