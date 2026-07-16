export function buildIpProfilePromptSnapshot(input: {
  displayName?: string | null
  nickname?: string | null
  industry?: string | null
  primaryOffer?: string | null
  targetAudience?: string | null
  ipTraits?: string | null
  toneOfVoice?: string | null
  proofPoints?: string | null
  callToAction?: string | null
}): string {
  return [
    ["IP名称", input.displayName],
    ["称呼", input.nickname],
    ["行业", input.industry],
    ["核心产品", input.primaryOffer],
    ["目标客户", input.targetAudience],
    ["人设特征", input.ipTraits],
    ["表达风格", input.toneOfVoice],
    ["可信依据", input.proofPoints],
    ["承接动作", input.callToAction],
  ]
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([label, value]) => `${label}：${value}`)
    .join("\n")
}
