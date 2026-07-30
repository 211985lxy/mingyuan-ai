/**
 * 人设故事智能体已并入内容创作「通用故事」。
 * 仅保留前采模式检测，供旧测例与偶发前采整理入口复用。
 */

/**
 * @description 检测人设/前采相关输入的工作模式（引导式/前采式/前采整理）
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
