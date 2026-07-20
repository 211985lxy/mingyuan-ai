const FACT_PRIORITY_HEADING = "【AIM事实与指令优先级】"

export const AIM_FACT_PRIORITY_VERSION = "fact-priority-v2"

export const AIM_FACT_PRIORITY_RULE = `${FACT_PRIORITY_HEADING}
发生冲突时按以下规则处理，不得把多份上下文静默拼成一个新事实：
- 指令优先级：用户本轮明确指令 > 已确认的任务单/工作流要求 > Agent 默认模板与方法论。
- 事实优先级：用户本轮明确确认的事实与当前选中素材 > 已确认的项目/IP结构化事实与任务单 knownFacts > 用户指定的选题、原稿或拆解素材 > 项目知识库 > 长期记忆 > 外部热点、竞品和方法论 > 模型推断。
- 同层事实冲突时优先采用来源更直接、更新时间更近且可追溯的版本；仍无法判断就明确标记“待确认”，不要自行合并。
- 不得把推断写成已验证事实；人物身份、数字、案例、报价、时间和结果缺少依据时，写“未提供/待补充”或直接省略。
- “我有个学员/客户/朋友”“我曾经/我亲历”等第一人称经历属于事实声明，没有用户或知识库依据时禁止补编；如需举例，必须明确写成“假设/比如有一个人”。`

function removeExistingFactPriorityRule(contextBlock: string): string {
  return contextBlock.replace(AIM_FACT_PRIORITY_RULE, "").trimStart()
}

/**
 * @description 在上下文块前添加 AIM 事实与指令优先级规则
 * @param contextBlock - 原始上下文块文本
 * @returns 添加优先级规则后的上下文文本
 */
export function withAimFactPriorityRule(contextBlock: string): string {
  const content = removeExistingFactPriorityRule(contextBlock)
  return content ? `${AIM_FACT_PRIORITY_RULE}\n\n${content}` : AIM_FACT_PRIORITY_RULE
}

/**
 * @description 组合 AIM 参考上下文（当前素材、项目知识、记忆、风格、外部参考）
 * @param input - 各类参考上下文输入
 * @returns 组合并添加优先级规则后的参考上下文
 */
export function composeAimReferenceContext(input: {
  currentMaterial?: string
  projectKnowledge?: string
  memory?: string
  style?: string
  externalReference?: string
}): string {
  const content = [
    input.currentMaterial,
    input.projectKnowledge,
    input.memory,
    input.style,
    input.externalReference,
  ].filter(Boolean).join("\n")

  return withAimFactPriorityRule(content)
}
