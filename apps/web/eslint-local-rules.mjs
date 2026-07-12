function countSignificantLines(sourceCode) {
  const ignored = new Set()
  for (const comment of sourceCode.getAllComments()) {
    for (let line = comment.loc.start.line; line <= comment.loc.end.line; line += 1) ignored.add(line)
  }
  return sourceCode.lines.reduce((count, line, index) => {
    const lineNumber = index + 1
    return count + (line.trim() && !ignored.has(lineNumber) ? 1 : 0)
  }, 0)
}

export const localRules = {
  rules: {
    "max-significant-lines-warning": {
      meta: {
        type: "suggestion",
        schema: [{ type: "object", properties: { max: { type: "integer", minimum: 1 } }, additionalProperties: false }],
        messages: { tooLong: "File has {{count}} significant lines; keep modules under {{max}} lines." },
      },
      create(context) {
        const max = context.options[0]?.max ?? 400
        return {
          Program(node) {
            const count = countSignificantLines(context.sourceCode)
            if (count > max) context.report({ node, messageId: "tooLong", data: { count, max } })
          },
        }
      },
    },
  },
}
