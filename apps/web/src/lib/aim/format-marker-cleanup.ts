/**
 * 模型格式标记清洗（纯函数，无副作用）。
 *
 * 背景：生成系统约定正文用 `===FORMAT:格式名===` 作为开头分隔标记，由
 * parseMultiFormatResponse 切片去掉。但部分模型会在正文末尾**自加收尾标记**
 *（如 `===END FORMAT===`、`=== END FORMAT ===`、`===END===`），切片时这些尾标
 * 落进最后一段内容里，造成成稿泄漏内部格式标记（演示实测问题）。
 *
 * 这里只清除「独立的格式收尾标记」——即一整行只有该标记（允许前后空白）的情况，
 * 绝不触碰正文里夹带的半句话，避免误删正常内容。对已经干净的成稿是幂等的。
 */

/**
 * 匹配「独立的格式收尾标记行」：
 * - 行首可选空白；
 * - 三个及以上 `=`；其后可选空白；
 * - 关键词 END / FORMAT / END FORMAT（大小写不敏感），关键词之间允许空白；
 * - 末尾三个及以上 `=`；行尾可选空白与换行。
 *
 * 仅匹配「独占一整行」的标记，正文里零散出现的 `===` 不会命中（要求行首锚定 + 整行结构）。
 */
const FORMAT_END_MARKER_LINE = /^[ \t]*={3,}[ \t]*(?:END[ \t]*FORMAT|FORMAT[ \t]*END|END)[ \t]*={3,}[ \t]*$/gim

/**
 * 清除文本中独立的格式收尾标记行，并顺带收敛被它打断造成的多余空行。
 * 不修改正常正文。
 */
export function stripAimFormatMarkers(input: string): string {
  if (!input) return input
  const cleaned = input.replace(FORMAT_END_MARKER_LINE, "")
  // 收敛因删除整行标记留下的连续空行（最多保留一个空行作为段落间隔）。
  return cleaned.replace(/\n{3,}/g, "\n\n").trim()
}

/**
 * 判断文本是否仍含独立的格式收尾标记（用于历史成稿兼容性自检 / 调试）。
 */
export function hasAimFormatMarker(input: string): boolean {
  if (!input) return false
  FORMAT_END_MARKER_LINE.lastIndex = 0
  return FORMAT_END_MARKER_LINE.test(input)
}
