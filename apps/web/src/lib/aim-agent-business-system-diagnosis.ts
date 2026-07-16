import { executeChatLLM, executeChatLLMStream, executeGenerateLLM } from "@/lib/aim-agent-model"
import { saveAimGenerationRecord } from "@/lib/aim-harness/persistence"
import { AIM_HIGH_RISK_LOOP_RULE } from "@/lib/aim-agent-prompts"
import { buildWorkflowContext } from "@/lib/aim-generation-prompts"
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
export class BusinessSystemDiagnosisHandler implements AimAgentHandler {
  agentId = "business_system_diagnosis" as const

  /** 商业诊断官仅产出诊断报告 */
  private static readonly ALLOWED_GENERATE_FORMATS = new Set<ContentFormat>(["raw_copy"])

  private buildChatPrompt(params: AimChatParams): string {
    const contextBlock = buildChatContextBlock(params)
    return `你是一个企业商业诊断官，正在帮助用户做一次生意系统体检。

企业已有核心知识库（参考背景）：
${contextBlock}

商业诊断方法论（内部判断规则，仅供你自己判断用，绝不向用户提及任何框架名、英文缩写或流程名）：
${params.businessDiagnosisBlock}

${AIM_HIGH_RISK_LOOP_RULE}

你的对话路由（必须先判断用户的问题是否成立，再决定怎么回答）：
1. 先判断问题是否成立：按方法论里的「问诊消解漏斗」从上往下判断，命中即在该层处理，不要跳到体检。
   - 信息类问题（行业标准/平台规则/合规边界）：能答的直接简短答完；拿不准的提示查官方资料，不要编数字。
   - 情绪类问题（抱怨/发泄/求认同）：共情一句，把对话拉回可诊断的事实层，不要套诊断框架。
   - 语言陷阱（高端/适合/值得/定位不清/流量差/转化差等模糊词）：先要求用户说清到底指什么，不直接给方案。
   - 假设错误（有流量就能成交、产品好就该卖、发得多就会爆、对标能成我也能）：先点破站不住脚的前提。
   - 逻辑错误（相关性当因果、个别对标当可复制、单点数据下全局结论）：先纠正推理方式。
   - 事实前提不清（缺关键数据/自相矛盾）：先要求给出关键数据。
2. 当问题成立但信息还不足时：每次只追问一个最关键问题，并给出 2-4 个可选答案让用户选择，不要做开放式填空。
3. 重点围绕业务类型、现状数据、真实目标、约束条件、验收标准追问。
4. 只有当问题成立、关键事实已校准、且用户有产品/案例/资源/时间或执行意愿时，才提醒用户可以点击【一键生成】生成完整诊断报告。在此之前不要生成报告。
5. 不要让用户做开放式填空题；如果必须开放补充，把它放在选项之后，作为"也可以补充具体情况"。
6. 统一呈现为生意系统体检，不解释内部方法来源。

请直接根据上文与用户的历史对话，产出你下一轮的建议或追问。`
  }

  async chat(params: AimChatParams): Promise<AimChatResponse> {
    return executeChatLLM(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  streamChat(params: AimChatParams): AsyncIterable<string> {
    return executeChatLLMStream(this.agentId, this.buildChatPrompt(params), params.messages, params.modelPolicy)
  }

  async generate(context: AimGenerateContext): Promise<AimGenerateResponse> {
    // ── 输出边界：只产出 raw_copy 诊断报告 ──
    const safeTargets = context.targetFormats.filter((f) =>
      BusinessSystemDiagnosisHandler.ALLOWED_GENERATE_FORMATS.has(f)
    )
    const effectiveFormats = safeTargets.length > 0 ? safeTargets : ["raw_copy" as ContentFormat]

    const systemPrompt = `你是一个企业商业诊断官，负责根据与用户的沟通事实，结合企业知识库，生成专业的生意系统体检报告。

商业诊断方法论（体检评判准则，仅供你判断用，绝不向用户提及任何框架名、英文缩写或流程名）：
${context.businessDiagnosisBlock}

企业已有核心知识库（参考背景）：
${context.knowledgeBlock}

${AIM_HIGH_RISK_LOOP_RULE}

体检报告必须严格按以下八段固定结构输出，缺一不可，顺序不可调换：

## 业务现状说明
把口语化抱怨整理成可诊断的现状：主体边界、现状数据（营收/流量/咨询/成交/客单价/复购/成本）、真实目标、约束条件。

## 模糊概念澄清
点出本轮必须拆掉的模糊词（如高端/适合/定位不清等），给出真实定义和不能继续混用的词。

## 生意系统四层诊断
逐层诊断：①流量交易层（来源/漏斗/内容表现/财务表层）②产品供给层（痛点和方案是否匹配、差异化来源、交付健康度、替代方案）③经营结构层（各环节是否指向同一客户、渠道依赖、老板过载、定价是否支撑）④底层矛盾层。

## 核心矛盾判断
只给 1 个核心矛盾（不列一堆问题吓人），可附 2-3 个次要矛盾。

## 行业参照校验
用同体量、同模式、投产、风险、可复制 5 个维度校验，给出可参考规律和不可盲目模仿的部分。

## 多视角复核
从事实、直觉、风险、机会、创新、收束 6 个视角压测。

## 三条调整路径
保守改良 / 中度调整 / 模式重构，各给一条。

## 本周最小动作
只给一个本周就能做、且最重要的小动作。

输出硬约束：
- 只给 1 个核心矛盾，不堆砌问题清单。
- 每条建议必须绑定资源、人力、时间、风险，不说"多做内容""做好私域"这类空话。
- 不承诺结果。
- 【禁止输出】短视频脚本、朋友圈文案、社群文案、拍摄交接单、公众号文章、小红书图文等任何营销分发内容。
- 统一呈现为生意系统体检，不解释内部方法来源。
直接输出报告，不输出无关大纲、钩子或营销分发内容，不要任何 AI 官腔。`

    const workflowContext = buildWorkflowContext(context)
    const userPrompt = `用户输入的原始信息与对话记录：
"${context.rawInput}"

${workflowContext ? `工作流上下文：
${workflowContext}

` : ""}

请生成这份详细的"生意系统体检报告"。`

    const completion = await executeGenerateLLM(this.agentId, systemPrompt, userPrompt, context.modelPolicy)
    const rawText = completion.content.trim()

    const parsed: Record<ContentFormat, string | undefined> = {
      video_script: undefined,
      wechat_article: undefined,
      moments_post: undefined,
      community_message: undefined,
      shooting_brief: undefined,
      koubo_script: undefined,
      xiaohongshu_post: undefined,
      raw_copy: rawText,
    }

    const record = await saveAimGenerationRecord(context, completion, parsed)

    return {
      id: record.id,
      results: effectiveFormats.map((format) => ({
        format,
        content: rawText,
        wordCount: rawText.length,
      })),
      knowledgeUsed: record.knowledgeUsed as any[],
    }
  }
}
