export interface AimChoiceGroup {
  question: string
  options: Array<{ label: string; text: string }>
}

function cleanChoiceText(text: string) {
  return text.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim()
}

/**
 * @description 从内容中提取 AIM 选项组（A/B/C/D 选项）
 * @param content - 包含选项的文本内容
 * @returns 提取的选项组数组
 */
export function extractAimChoiceGroups(content: string): AimChoiceGroup[] {
  const lines = content.split("\n")
  const groups: AimChoiceGroup[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trim().match(/^([A-D])[\s.、．)]\s*(.+)$/)) continue
    const options = []
    let optionIndex = index
    while (optionIndex < lines.length) {
      const match = lines[optionIndex].trim().match(/^([A-D])[\s.、．)]\s*(.+)$/)
      if (!match) break
      const text = cleanChoiceText(match[2])
      if (text.length > 0 && text.length <= 120) options.push({ label: match[1], text })
      optionIndex += 1
    }
    let question = "请选择一个方向"
    for (let questionIndex = index - 1; questionIndex >= 0; questionIndex -= 1) {
      const line = cleanChoiceText(lines[questionIndex])
      if (line && !/^([A-D])[\s.、．)]/.test(line)) {
        question = line
        break
      }
    }
    if (options.length > 1) groups.push({ question, options })
    index = optionIndex
  }
  return groups
}
