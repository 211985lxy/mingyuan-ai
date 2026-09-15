export function buildMediaTranscriptionDocument(input: {
  title: string
  platform: string
  sourceUrl: string
  purifiedMarkdown: string
}): { title: string; content: string } {
  return {
    title: `【小D整理】${input.title}`,
    content: [
      `# ${input.title}`,
      "",
      `- 来源平台：${input.platform}`,
      `- 原始链接：${input.sourceUrl}`,
      "",
      "> 以下内容由音视频自动转录并进行忠实整理，不是摘要或再创作文案。",
      "",
      input.purifiedMarkdown,
      "",
      "---",
      "本稿由音视频自动转录整理，涉及人名、数字和关键事实时请回看原素材核对。",
    ].join("\n"),
  }
}
