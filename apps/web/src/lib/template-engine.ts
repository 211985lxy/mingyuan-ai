import type { TemplateVariable } from "@/types/content-template"

/**
 * Render a template script by replacing {{variableName}} placeholders
 * with user-provided values.
 */
/**
 * @description 渲染template
 * @param scriptTemplate - script模板
 * @param variables - variables
 * @returns string
 */
export function renderTemplate(
  scriptTemplate: string,
  variables: Record<string, string>
): string {
  return scriptTemplate.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return variables[key] ?? match
  })
}

/**
 * Validate that all required variables have values.
 * Returns array of missing required variable keys.
 */
/**
 * @description 验证variables
 * @param definitions - definitions
 * @param values - 值列表
 * @returns string[]
 */
export function validateVariables(
  definitions: TemplateVariable[],
  values: Record<string, string>
): string[] {
  return definitions
    .filter((v) => v.required && (!values[v.key] || values[v.key].trim() === ""))
    .map((v) => v.key)
}
