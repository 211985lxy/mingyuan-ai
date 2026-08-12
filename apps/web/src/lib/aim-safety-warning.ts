import type { ContentFormat } from "./aim-generator"

/**
 * 把末次重写仍命中的安全风险拼成给用户看的中文提示（写入 METHOD_NOTE/思考依据）。
 * 仅在 maxAttempts 轮重写后仍有安全违规时调用。
 *
 * 独立成模块是为了让 aim-generation-prompts.ts 不越过 arch:size 的 500 行红线。
 */
export function summarizeSafetyFindingsForUser(
  safety: {
    copiedFormats: ContentFormat[]
    unsupportedClaimFormats: ContentFormat[]
    unsupportedNumericClaimFormats: ContentFormat[]
    lightEditScopeViolationFormats: ContentFormat[]
  },
  maxAttempts: number,
): string {
  const risks = [
    safety.copiedFormats.length ? `${safety.copiedFormats.join("、")} 与对标原文过于相似` : "",
    safety.unsupportedClaimFormats.length ? `${safety.unsupportedClaimFormats.join("、")} 含上下文无依据的人物/客户/场景主张` : "",
    safety.unsupportedNumericClaimFormats.length ? `${safety.unsupportedNumericClaimFormats.join("、")} 含用户原文未出现的数字` : "",
    safety.lightEditScopeViolationFormats.length ? `${safety.lightEditScopeViolationFormats.join("、")} 轻改越界、丢失原文信息` : "",
  ].filter(Boolean)
  return `经 ${maxAttempts} 轮重写仍检出风险（${risks.join("；")}），以下为最后一版，发布前请人工核实。`
}
