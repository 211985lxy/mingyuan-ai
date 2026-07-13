export interface ChoiceGroup {
  question: string
  options: Array<{ label: string; text: string }>
}

function cleanChoiceText(text: string) {
  return text.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim()
}

export function extractChoiceGroups(content: string): ChoiceGroup[] {
  const lines = content.split("\n")
  const groups: ChoiceGroup[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const first = lines[i].trim().match(/^([A-D])[\s.、．)]\s*(.+)$/)
    if (!first) continue

    const options = []
    let j = i
    while (j < lines.length) {
      const match = lines[j].trim().match(/^([A-D])[\s.、．)]\s*(.+)$/)
      if (!match) break
      const text = cleanChoiceText(match[2])
      if (text.length > 0 && text.length <= 120) options.push({ label: match[1], text })
      j += 1
    }

    let question = "请选择一个方向"
    for (let k = i - 1; k >= 0; k -= 1) {
      const line = cleanChoiceText(lines[k])
      if (line && !/^([A-D])[\s.、．)]/.test(line)) {
        question = line
        break
      }
    }
    if (options.length > 1) groups.push({ question, options })
    i = j
  }
  return groups
}
