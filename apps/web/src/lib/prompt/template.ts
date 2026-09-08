/**
 * Prompt 模板占位符填充（批1 函数拼接型迁移引入）。
 *
 * 约定与 quality-gate 原私有 fillTemplate 完全一致：`{name}` 占位、
 * 单遍替换（替换值不再被扫描）、未知 key 填空串。迁移只换来源
 * （registry seed/DB 版本），不改变最终出稿字节。
 */

/**
 * @description 填充prompt模板占位符
 * @param template - 含 {name} 占位符的模板原文
 * @param vars - 占位符取值表
 * @returns 填充后的最终 prompt
 */
export function fillPromptTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] || "")
}
