export interface PlanModeCommandMatch {
  matched: boolean
  remainingInput: string
}

const PLAN_MODE_COMMANDS = [
  /^(?:请)?(?:先)?(?:进入|开启|打开|切换到)计划模式/,
  /^(?:先别|不要)(?:直接)?(?:写|生成)(?:文案|内容)?[，,\s]*(?:先)?(?:规划|梳理需求)(?:一下)?/,
  /^先(?:问我|向我)(?:几个|一些)?(?:问题|需求)[，,\s]*(?:再|然后)(?:帮我)?(?:写|生成)/,
  /^先(?:梳理|确认|收集|补全)(?:一下)?需求[，,\s]*(?:再|然后)(?:帮我)?(?:写|生成)/,
]

const DIRECT_MODE_COMMANDS = [
  /^(?:退出|关闭)计划模式/,
  /^(?:不用|不要)(?:再)?(?:规划|计划)[了吧]?[，,\s]*(?:直接)?/,
  /^(?:直接|马上)(?:写|生成)/,
  /^先出一版/,
]

function matchExplicitCommand(input: string, patterns: RegExp[]): PlanModeCommandMatch {
  const text = input.trim()
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    return {
      matched: true,
      remainingInput: text.slice(match[0].length).replace(/^[，,：:\s]+/, "").trim(),
    }
  }
  return { matched: false, remainingInput: text }
}

/**
 * 只识别带明确动作的计划模式指令。
 * “计划、方案、规划”等普通内容词不会单独触发模式切换。
 */
export function parseExplicitPlanModeCommand(input: string): PlanModeCommandMatch {
  return matchExplicitCommand(input, PLAN_MODE_COMMANDS)
}

/** 识别用户明确要求退出计划模式的指令。 */
export function parseExplicitDirectModeCommand(input: string): PlanModeCommandMatch {
  return matchExplicitCommand(input, DIRECT_MODE_COMMANDS)
}
