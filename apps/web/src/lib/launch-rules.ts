/**
 * @fileoverview 全局灰度 / 功能开关。
 *  - 单测可通过 jest.mock('./launch-rules') 覆盖返回值。
 *  - 生产可扩展为：查表 (prisma.feature_flag) → 按 userId/租户分桶 → 默认值。
 * 当前实现为常量级开关，供 Task 2 任务卡注入链路使用。
 */

export interface LaunchRules {
  /** 内容任务卡 prompt 块注入开关；默认 false，保证 baseline 字符级等价。 */
  enable_content_task_card: boolean
  /** 合规额外规则开关（Task 10：R06_* ~ R09_* 四条新规则是否生效）；默认 false。 */
  complianceExtraRules: boolean
}

/**
 * @description 获取全局功能开关（灰度）。
 * @param userId - 可选用户 ID，后续可用于按用户分桶；当前忽略。
 * @returns LaunchRules
 */
export function getLaunchRules(userId?: string): LaunchRules {
  // 当前为常量实现，userId 预留。
  void userId
  return {
    enable_content_task_card: false,
    complianceExtraRules: false,
  }
}

/**
 * @description 判断 Task 10 合规额外规则是否开启。
 * 当开关未显式打开时，发布前自查仅跑 baseline 5 条 + 既有夸张/AI 夸大 2 条；
 * 打开后，额外加载 R06_brand_tool_word / R07_ai_generated_material_flag /
 * R08_batch_account_wording / R09_commercial_content_channel 共 4 条。
 *
 * 用法：
 *   const rules = filterRulesByComplianceSwitch(
 *     PUBLISH_PRECHECK_RULES,
 *     isComplianceExtraRuleEnabled(),
 *   )
 */
export function isComplianceExtraRuleEnabled(userId?: string): boolean {
  return getLaunchRules(userId).complianceExtraRules === true
}
