import { executeChatLLM, executeChatLLMStream } from "@/lib/aim-agent-model"
import { saveAimGenerationRecord } from "@/lib/aim-harness/persistence"
import { AIM_HIGH_RISK_LOOP_RULE } from "@/lib/aim-agent-prompts"
import {
  buildWorkflowContext,
  executeGenerateLLMWithBenchmarkRetry,
} from "@/lib/aim-generation-prompts"
import type { ContentFormat } from "./aim-generator"
import type {
  AimAgentHandler,
  AimChatParams,
  AimChatResponse,
  AimGenerateContext,
  AimGenerateResponse,
} from "./aim-agent-handlers"

function buildChatContextBlock(params: { knowledgeBlock: string; conversationBlock?: string }) {
  return [params.conversationBlock, params.knowledgeBlock].filter(Boolean).join("\n\n")
}
export class PersonaHandler implements AimAgentHandler {
  agentId = "persona" as const

  private buildChatPrompt(params: AimChatParams): string {
    const contextBlock = buildChatContextBlock(params)
    return `你是「人设故事官」，专门帮 IP 把自己的"来时路"一步步梳理成一条高质量的置顶视频脚本。

企业已有核心知识库（参考背景）：
${contextBlock}

${AIM_HIGH_RISK_LOOP_RULE}

你的工作方式（引导式，每轮只推进一个维度）：
按顺序把以下 6 个维度收集齐，每轮只追问当前最关键的 1 个缺口，并给一个降低门槛的回答示例：
1. 经历与成就：哪一年做了什么、做成/赚到过什么（要具体年份，是置顶视频的关键记忆点）
2. 低谷与转折：哪一年跌入困境、最痛的点是什么
3. 顿悟：什么契机让你想明白、悟到了什么
4. 当前产品/服务：现在具体做什么、卖什么、怎么交付
5. 目标用户与卡点：服务谁、他们最具体的困境（一句话）
6. 标志性结果/案例：一个能证明你方法有效的具体案例或客户反馈

每轮回复的硬性格式（必须严格遵守）：
- 第一行必须是进度标记，精确格式：【进度 XX%】（XX 按已收齐维度估算：6 维全齐=100%，每维约 15-20%；用户信息越具体越接近满格；只要还差一个维度就别给 100%）
- 进度标记后，先用 2-4 行简述"目前已经清楚的部分"
- 再用 1 行点明"现在最影响脚本质量的地方"
- 然后只问当前最关键的 1 个缺口，附一个回答示例（例如"你可以从『某年某月，我…』开始"），一次只问一个，不要抛多个开放问题
- 当且仅当进度到达 100%（6 维基本齐）时，停止追问，直接产出：
  ①「来时路总结」一段（150 字内）
  ②「置顶视频脚本」：逐句"口播 + 配图建议"，每句单独成行，10-18 句
- 产出脚本后，如果用户说"第 N 句改 X / 去掉 Y"，只调整对应句，然后重新给出整段脚本，其他句保持不变

风格要求：
- 口语、真诚、像本人说话；避免 AI 腔、宣传腔、整齐排比和万能结尾
- 不主动提过时热点或已过气的网络梗
- 不暴露内部参考来源

请根据上文与用户的历史对话，产出下一轮内容（必须以【进度 XX%】开头）。`
  }

  private buildIntakeReceivePrompt(): string {
    return `你是一个「前采信息整理专家」。用户会分批发送前采资料。
规则：
1. 用户发来前采文字时，只需回复"收到"。
2. 不要追问、不要分析、不要输出任何报告。
3. 等待用户发送"开始整理"的指令。
请回复"收到"。`
  }

  private buildIntakeCompilePrompt(): string {
    return `你是一个「前采信息整理专家」。请根据对话历史中的所有前采内容，输出结构化报告：

## 一、身份信息
## 二、人设特征
## 三、故事素材（3-5 个有爆点的真实故事）
## 四、商业逻辑
## 五、客户画像
## 六、内容素材（5-10 个可做选题的话题 + 金句）
## 七、信息缺口与补采建议（5-10 个具体问题）

直接输出报告，不要追问。`
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    const lastUserMsg = params.messages[params.messages.length - 1]?.content ?? ""
    const mode = detectPersonaMode(lastUserMsg)
    let prompt: string
    if (mode === "intake") {
      prompt = this.buildIntakeReceivePrompt()
    } else if (mode === "intake_compile") {
      prompt = this.buildIntakeCompilePrompt()
    } else {
      prompt = this.buildChatPrompt(params)
    }
    return executeChatLLM(this.agentId, prompt, params.messages, params.modelPolicy)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    const agentPrompt = `你是「人设故事官」。把用户提供的来时路素材，整理成一条置顶视频脚本。

【输出规则 — 严格遵循】
- 只输出两部分：「来时路总结」一段（150 字内）+「置顶视频脚本」逐句口播与配图建议
- 脚本逐句成行，每句格式为"口播：xxx ｜ 配图：xxx"，10-18 句
- 口语、真诚、像本人说话；避免 AI 腔、宣传腔、整齐排比、万能结尾
- 不主动提过时热点或已过气的网络梗
- 不暴露内部参考来源`

    const systemPrompt = `${agentPrompt}

${context.knowledgeBlock}

${AIM_HIGH_RISK_LOOP_RULE}`

    const workflowContext = buildWorkflowContext(context)
    const userPrompt = `用户提供的来时路素材：
"${context.rawInput}"

${workflowContext ? `工作流上下文：\n${workflowContext}\n\n` : ""}请直接输出「来时路总结 + 置顶视频脚本」，不要包含任何解释性文字。`

    const targetFormat = "video_script" as ContentFormat
    const { completion, parsed } = await executeGenerateLLMWithBenchmarkRetry(
      this.agentId,
      systemPrompt,
      userPrompt,
      context,
      [targetFormat],
    )
    const rawText = (parsed[targetFormat] || completion.content).trim()

    const resultByFormat: Record<ContentFormat, string | undefined> = {
      video_script: rawText,
      wechat_article: undefined,
      moments_post: undefined,
      community_message: undefined,
      shooting_brief: undefined,
      raw_copy: undefined,
      koubo_script: undefined,
      xiaohongshu_post: undefined,
    }

    const record = await saveAimGenerationRecord(context, completion, resultByFormat)

    return {
      id: record.id,
      results: [{ format: "video_script" as ContentFormat, content: rawText, wordCount: rawText.length }],
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}

// ─── 前采模式检测 ───────────────────────────────────────────

/**
 * @description 检测人设智能体的工作模式（引导式/前采式/前采整理）
 * @param input - 用户输入文本
 * @returns 检测到的工作模式
 */
export function detectPersonaMode(input: string): "guided" | "intake" | "intake_compile" {
  const text = input.trim()
  if (text.includes("开始整理")) return "intake_compile"
  const intakeKeywords = ["前采", "访谈", "录音", "整理", "报告", "资料整理", "逐字稿"]
  if (intakeKeywords.some((kw) => text.includes(kw))) return "intake"
  return "guided"
}
