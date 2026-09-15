/**
 * 授权原文姓名占位符识别。
 *
 * 姓名不做校验：服务端把配置模板的 {name} 统一替换为「（您的姓名）」展示占位
 * （见 digital-human-provider.ts），声明人录制时念自己的名字即可。历史配置
 * 里也可能直接写「xxx」或「某某」，一并识别并高亮。
 */

const NAME_PLACEHOLDER_PATTERN =
  /(（您的姓名）|\(您的姓名\)|xxx|XXX|Xxx|ｘｘｘ|ＸＸＸ|\{name\}|某某)/

/** 自解释占位：文字本身已说明「这里要念您的姓名」。 */
const SELF_EXPLANATORY_PLACEHOLDER = /^[（(]您的姓名[）)]$/

/** 找出原文中的姓名占位符；没有则返回 null。 */
export function findAuthorizationNamePlaceholder(text: string): string | null {
  return text.match(NAME_PLACEHOLDER_PATTERN)?.[0] ?? null
}

/**
 * 占位符是否已自解释（如「（您的姓名）」）。
 * 自解释的占位无需再配提示框，界面更干净。
 */
export function isSelfExplanatoryNamePlaceholder(placeholder: string): boolean {
  return SELF_EXPLANATORY_PLACEHOLDER.test(placeholder)
}

export type AuthorizationTextSegment =
  | { type: "text"; value: string }
  | { type: "name"; value: string }

/** 把原文按姓名占位符切段，供 UI 高亮渲染。 */
export function splitAuthorizationTextByPlaceholder(
  text: string,
): AuthorizationTextSegment[] {
  const segments: AuthorizationTextSegment[] = []
  let rest = text
  while (rest.length > 0) {
    const match = rest.match(NAME_PLACEHOLDER_PATTERN)
    if (!match || match.index === undefined) {
      segments.push({ type: "text", value: rest })
      break
    }
    if (match.index > 0) {
      segments.push({ type: "text", value: rest.slice(0, match.index) })
    }
    segments.push({ type: "name", value: match[0] })
    rest = rest.slice(match.index + match[0].length)
  }
  return segments
}
