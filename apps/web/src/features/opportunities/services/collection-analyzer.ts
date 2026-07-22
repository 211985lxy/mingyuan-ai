// @ts-nocheck — WIP: opportunities 模块类型待修复
import { LLMClient } from "@/lib/llm/client"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import type { CollectionAnalysis } from "../contracts/types"

const log = logger.child({ component: "CollectionAnalyzer" })

const ANALYSIS_MODEL = "glm-5.2"

// ─── Prompt Template ─────────────────────────────────────

function buildAnalysisPrompt(samples: SampleInput[]): string {
  const sampleTexts = samples
    .map((s, i) => {
      const metrics = [
        s.likes != null ? `赞${s.likes}` : null,
        s.comments != null ? `评${s.comments}` : null,
        s.shares != null ? `转${s.shares}` : null,
        s.views != null ? `播放${s.views}` : null,
      ].filter(Boolean).join(" ")

      return [
        `【样本${i + 1}】`,
        `标题：${s.title}`,
        `平台：${s.platform === "douyin" ? "抖音" : "视频号"}`,
        `作者：${s.authorName}${s.followerCount ? `（粉丝${s.followerCount}）` : ""}`,
        metrics ? `数据：${metrics}` : null,
        s.publishedAt ? `发布时间：${s.publishedAt}` : null,
        `链接：${s.sourceUrl}`,
      ].filter(Boolean).join("\n")
    })
    .join("\n\n---\n\n")

  return `你是一位资深短视频内容策略分析师。以下是用户从抖音/视频号搜索中精选的 ${samples.length} 条爆款样本。

请基于这些样本进行深度拆解分析，输出严格的 JSON 格式（不要输出 markdown 代码块标记）。

## 样本列表

${sampleTexts}

## 输出要求

输出一个 JSON 对象，包含以下字段：

{
  "highFrequencyThemes": ["高频主题1", "高频主题2", ...],  // 3-5个
  "commonOpenings": ["常用开头1", "常用开头2", ...],  // 3-5个
  "contentStructures": ["内容结构1", "内容结构2", ...],  // 2-4个
  "sharedViewpoints": ["共性观点1", "共性观点2", ...],  // 3-5个
  "commentNeeds": ["评论区需求/异议1", ...],  // 3-5个
  "homogeneityRisk": "同质化风险评估（一段话）",
  "reusablePatterns": ["可借鉴部分1", ...],  // 3-5个
  "avoidExpressions": ["应避免照搬的表达1", ...],  // 2-4个
  "originalAngles": ["适合当前客户的原创切入角度1", ...],  // 3-5个
  "candidateTopics": [  // 5-10个候选选题
    {
      "title": "选题标题",
      "angle": "切入角度",
      "rationale": "为什么值得做（引用样本编号）",
      "referencedSamples": ["样本1", "样本3"],
      "riskNote": "风险提示（可选）"
    }
  ],
  "sampleReferences": {  // 每个结论关联的样本编号
    "highFrequencyThemes": ["样本1", "样本2"],
    "commonOpenings": ["样本1", "样本4"]
  }
}

## 关键约束

1. 每个结论必须引用至少一个样本编号（如"样本1"），不允许脱离样本泛泛生成。
2. 候选选题的 rationale 必须说明引用了哪些样本的什么特征。
3. 不要把第三方内容原文直接改写成高度相似文案。
4. 如果样本信息不足以支撑某个结论，明确说明"证据不足"。
5. 只输出 JSON，不要输出其他文字。`
}

// ─── Types ───────────────────────────────────────────────

interface SampleInput {
  title: string
  platform: string
  authorName: string
  followerCount?: number
  likes?: number
  comments?: number
  shares?: number
  views?: number
  publishedAt?: string
  sourceUrl: string
}

// ─── Main Entry ──────────────────────────────────────────

export async function analyzeCollection(collectionId: string): Promise<void> {
  const collection = await prisma.opportunityCollection.findUnique({
    where: { id: collectionId },
  })

  if (!collection) {
    throw new Error(`Collection ${collectionId} not found`)
  }

  const items = collection.items as unknown as SampleInput[]
  if (!Array.isArray(items) || items.length === 0) {
    await markFailed(collectionId, "研究篮中没有样本")
    return
  }

  log.info({ collectionId, sampleCount: items.length }, "开始批量分析")

  try {
    const prompt = buildAnalysisPrompt(items)

    const result = await LLMClient.shared().complete({
      messages: [
        { role: "system", content: "你是一位资深短视频内容策略分析师，擅长从爆款样本中提炼可复用的内容策略。只输出 JSON。" },
        { role: "user", content: prompt },
      ],
      model: ANALYSIS_MODEL,
      temperature: 0.3,
      maxTokens: 4096,
    })

    const text = result.content?.trim() ?? ""
    const jsonStr = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "")

    let analysis: CollectionAnalysis
    try {
      analysis = JSON.parse(jsonStr) as CollectionAnalysis
    } catch {
      throw new Error(`LLM 返回内容无法解析为 JSON: ${text.slice(0, 200)}`)
    }

    await prisma.opportunityCollection.update({
      where: { id: collectionId },
      data: {
        status: "analyzed",
        analysisResult: analysis as unknown as object,
        analysisError: null,
      },
    })

    log.info({ collectionId, topicCount: analysis.candidateTopics?.length ?? 0 }, "批量分析完成")
  } catch (err) {
    const message = err instanceof Error ? err.message : "分析失败"
    log.error({ err, collectionId }, "批量分析失败")
    await markFailed(collectionId, message)
    throw err
  }
}

async function markFailed(collectionId: string, error: string): Promise<void> {
  await prisma.opportunityCollection.update({
    where: { id: collectionId },
    data: {
      status: "failed",
      analysisError: error,
    },
  })
}
