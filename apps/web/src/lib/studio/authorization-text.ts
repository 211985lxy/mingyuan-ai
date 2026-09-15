/**
 * 授权原文姓名占位符识别。
 *
 * 正规配置里供应商文案以 {name} 标注姓名位（见 digital-human-provider.ts），
 * 但历史配置可能直接写「xxx」。前端展示时对这类占位给出显式提示并高亮，
 * 告知用户录制授权视频时需朗读为本人真实姓名。
 */

const NAME_PLACEHOLDER_PATTERN = /(xxx|XXX|Xxx|ｘｘｘ|ＸＸＸ|Ｘｘｘ|\{name\}|某某)/

/** 找出原文中的姓名占位符；没有则返回 null。 */
export function findAuthorizationNamePlaceholder(text: string): string | null {
  return text.match(NAME_PLACEHOLDER_PATTERN)?.[0] ?? null
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
