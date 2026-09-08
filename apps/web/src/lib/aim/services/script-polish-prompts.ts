import type { ChatMessage } from "@/lib/llm"
import { promptRegistry } from "@/lib/prompt/registry"
import { fillPromptTemplate } from "@/lib/prompt/template"
import { PROMPT_KEYS } from "@/lib/prompt/types"

export const FORBIDDEN_TERMS =
  "赋能、闭环、抓手、颗粒度、对齐、拉通、打通、沉淀、复盘、迭代、链路、触达、心智、赛道"

/**
 * @description 构建imitatemessages
 * @param input - 输入数据
 * @returns ChatMessage[]
 */
export function buildImitateMessages(input: {
  contextBlock: string
  styleOverrideBlock: string
  viralSourceText: string
  content: string
  topicTitle: string | null
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: fillPromptTemplate(
        promptRegistry.get(PROMPT_KEYS.scriptPolishImitateSystem).content,
        {
          contextBlock: input.contextBlock,
          styleOverrideBlock: input.styleOverrideBlock,
          forbiddenTerms: FORBIDDEN_TERMS,
        },
      ),
    },
    {
      role: "user",
      content: fillPromptTemplate(
        promptRegistry.get(PROMPT_KEYS.scriptPolishImitateUser).content,
        {
          viralSourceText: input.viralSourceText,
          content: input.content,
          topicTitleBlock: input.topicTitle ? `\n选题方向：${input.topicTitle}\n` : "",
        },
      ),
    },
  ]
}

/**
 * @description 构建proofreadmessages
 * @param content - 内容
 * @returns ChatMessage[]
 */
export function buildProofreadMessages(content: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: promptRegistry.get(PROMPT_KEYS.scriptPolishProofreadSystem).content,
    },
    {
      role: "user",
      content: fillPromptTemplate(
        promptRegistry.get(PROMPT_KEYS.scriptPolishProofreadUser).content,
        { content },
      ),
    },
  ]
}

/**
 * @description 构建polishinstructions
 * @param weakDimensions - weakDimensions
 * @returns string[]
 */
export function buildPolishInstructions(weakDimensions: string[]): string[] {
  const instructions: string[] = []
  if (weakDimensions.includes("aiTaste")) {
    instructions.push(
      "【AI味消除——最高优先级】",
      "1. 逐段扫描，删除或替换以下禁用词：赋能、痛点、赛道、底层逻辑、闭环、矩阵、抓手、沉淀、打法、心智、颗粒度、链路、复用、拉齐、对齐、盘活、破圈、种草、拔草、转化链路、商业闭环、价值主张、核心壁垒、差异化打法、降维打击、认知升级。",
      "2. 打破排比三连——如果有三个以上相同句式连续出现，保留最有力的一个，其余改为不同句式。",
      "3. 把'首先...其次...最后...'改为口语过渡（比如'还有一点很关键'、'最让我意外的是'）。",
      "4. '不是...而是...'如果出现超过一次，只保留最有冲击力的一次，其余改成直接陈述。",
      "5. 加入1-2处真实感细节（具体数字、场景描述、个人感受），让文案像真人说的。",
    )
  }
  if (weakDimensions.includes("editorial")) {
    instructions.push(
      "【编辑质量提升】",
      "1. 检查每句话是否有信息量——删掉纯凑字数的空话和废话。",
      "2. 确保前后逻辑连贯，不要跳跃——如果两段之间缺少过渡，加一句口语化衔接。",
      "3. 检查是否有错别字、语病或不通顺的表述，直接修正。",
    )
  }
  if (weakDimensions.includes("attraction")) {
    instructions.push(
      "【吸引力提升】",
      "1. 前3秒（前15个字以内）必须有钩子——反常识、具体数字、直接挑战、或引发好奇的提问。",
      "2. 如果开头是'今天我们来聊...'、'大家好我是...'这类万能开场，必须改掉。",
      "3. 在文案中间加入至少一处'意料之外'的转折或反直觉表述。",
    )
  }
  if (weakDimensions.includes("logic")) {
    instructions.push(
      "【逻辑性提升】",
      "1. 检查论点→论据→结论的链条是否完整，如果缺少论据支撑，补充一个具体案例或数据。",
      "2. 如果CTA和前面的论述脱节，加一句过渡让CTA显得自然。",
      "3. 确保每段话都在推进核心论点，不要跑题。",
    )
  }
  if (instructions.length === 0) {
    instructions.push(
      "【综合润色】",
      "优化文案的口语化表达、去除AI味痕迹、增强开头吸引力和逻辑连贯性。",
    )
  }
  return instructions
}

/**
 * @description 构建polishmessages
 * @param input - 输入数据
 * @returns ChatMessage[]
 */
export function buildPolishMessages(input: {
  content: string
  contextSection: string
  polishInstructions: string[]
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: fillPromptTemplate(
        promptRegistry.get(PROMPT_KEYS.scriptPolishPolishSystem).content,
        { polishInstructionsBlock: input.polishInstructions.join("\n") },
      ),
    },
    {
      role: "user",
      content: fillPromptTemplate(
        promptRegistry.get(PROMPT_KEYS.scriptPolishPolishUser).content,
        {
          contextSectionBlock: input.contextSection ? `${input.contextSection}\n` : "",
          content: input.content,
        },
      ),
    },
  ]
}
