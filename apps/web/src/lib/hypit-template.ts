/**
 * Hypit 模板变量渲染。
 *
 * 为什么需要这一层：Hypit 的源（SVML/SVS）是**纯文本文件**，引擎没有变量机制
 * （`hypit build` 吃什么就是什么）。而 AIM 侧每次出片的文案都不同，所以必须在
 * 提交前把 `{{title}}` 这类占位符换成实际内容。
 *
 * 设计取舍：
 * - **fail-closed**：模板里出现的变量没给值就抛错。宁可提交失败，也不要把
 *   `{{title}}` 原样渲进片子里——那种事故只能靠人眼发现。
 * - **默认转义**：SVML 是 XML，文案里的 `&` `<` `>` 会直接破坏文档结构。
 *   需要塞富文本时用 `{{raw:body}}` 前缀显式声明「我负责转义」，让风险可见。
 * - 多余的变量静默忽略：调用方往往传一整包上下文，逐个裁剪太啰嗦。
 *
 * 素材（图片/音频）不在本层处理——源里的 `./assets/x.jpg` 是相对路径，
 * 素材怎么进工作区见 `services/hypit-renderer/docs/TEMPLATE-CONTRACT.md` 的待决项。
 */

export class HypitTemplateError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = "HypitTemplateError"
  }
}

const PLACEHOLDER = /\{\{\s*(raw:)?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

/** 模板里出现的所有变量名（含 `raw:` 声明的），按首次出现顺序去重。 */
export function listHypitTemplateVariables(template: string): string[] {
  const names: string[] = []
  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[2]
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

/**
 * 把占位符替换成实际内容。
 *
 * @throws {HypitTemplateError} 模板声明的变量没给值（`MISSING_VARIABLE`）
 */
export function renderHypitTemplate(input: {
  template: string
  variables: Record<string, string | number | undefined | null>
}): string {
  const missing: string[] = []

  const rendered = input.template.replace(PLACEHOLDER, (_full, raw: string | undefined, name: string) => {
    const value = input.variables[name]
    if (value === undefined || value === null || value === "") {
      missing.push(name)
      return ""
    }
    const text = String(value)
    return raw ? text : escapeXml(text)
  })

  if (missing.length > 0) {
    throw new HypitTemplateError(
      "MISSING_VARIABLE",
      `模板变量缺少取值：${[...new Set(missing)].join("、")}`,
    )
  }
  return rendered
}
