import { getMethodologyBlock } from "@/lib/agent-methodology-store"

/**
 * 商业诊断方法论块（DB 优先 + 文件兜底 + 编辑即时生效）。
 * 实际加载逻辑统一收敛到 agent-methodology-store。
 */
/**
 * @description 构建businessdiagnosismethodologyblock
 * @returns Promise<string>
 */
export async function buildBusinessDiagnosisMethodologyBlock(): Promise<string> {
  return getMethodologyBlock("business_diagnosis")
}
