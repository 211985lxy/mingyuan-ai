/**
 * 组织协同显性化（Step⑤）——组织角色与权限矩阵（文档化正本）。
 *
 * 依据：2026-09-07-aim-maturity-five-step-upgrade-design.md §⑤。
 * 组织小而明确：老板（业务决策+审核）、内容增长负责人（发布/归因/回填）、
 * AI 系统负责人（飞书状态+AIM 执行+知识资产）。
 * 先文档化角色分工；org.prisma 建模 additive 可延后（人少时静态正本足够）。
 *
 * 权限门：`orgRoleCan` 是角色→能力的前向判断；服务端硬门闩仍以
 * withAdminOnly / withAdminOrEditor / HITL gate（Step③）为准，本矩阵用于
 * 前端显性化展示与审批责任归属，不得替代服务端鉴权。
 */

export type OrgRoleId = "business_owner" | "content_growth" | "ai_system"

export type OrgCapability =
  | "approve_external_send"      // 对外发送终审（HITL 批准）
  | "delete_customer_data"       // 删除客户数据
  | "publish_content"            // 发布内容
  | "attribute_leads"            // 线索归因登记
  | "backfill_outcome"           // 发布结果回填
  | "manage_knowledge"           // 知识资产管理
  | "operate_aim_core"           // AIM 执行内核运维
  | "sync_feishu_state"          // 飞书状态同步

export interface OrgRole {
  id: OrgRoleId
  title: string
  owner: string
  /** 一句话职责，侧栏显性化展示用 */
  summary: string
}

export const ORG_ROLES: readonly OrgRole[] = [
  {
    id: "business_owner",
    title: "业务决策 + 审核",
    owner: "李相宇（老板）",
    summary: "关键客户沟通审批、对外发布终审、数据删除授权",
  },
  {
    id: "content_growth",
    title: "内容增长负责人",
    owner: "（待任命，暂由老板兼）",
    summary: "发布执行、线索归因登记、发布结果回填",
  },
  {
    id: "ai_system",
    title: "AI 系统负责人",
    owner: "（AI 内核 + 值班工程师）",
    summary: "飞书状态同步、AIM 执行内核、知识资产管理",
  },
] as const

/** 角色 → 能力授权矩阵（前向判断）。 */
export const ORG_CAPABILITY_MATRIX: Record<OrgRoleId, readonly OrgCapability[]> = {
  business_owner: [
    "approve_external_send",
    "delete_customer_data",
    "publish_content",
    "attribute_leads",
    "backfill_outcome",
    "manage_knowledge",
    "operate_aim_core",
    "sync_feishu_state",
  ],
  content_growth: [
    "publish_content",
    "attribute_leads",
    "backfill_outcome",
  ],
  ai_system: [
    "operate_aim_core",
    "sync_feishu_state",
    "manage_knowledge",
  ],
}

/**
 * @description 角色能力前向判断（展示与责任归属用；服务端鉴权不依赖此函数）
 * @param roleId - 组织角色
 * @param capability - 待判断能力
 * @returns 是否授权
 */
export function orgRoleCan(roleId: OrgRoleId, capability: OrgCapability): boolean {
  return ORG_CAPABILITY_MATRIX[roleId].includes(capability)
}

export function getOrgRole(roleId: OrgRoleId): OrgRole {
  return ORG_ROLES.find((role) => role.id === roleId) ?? ORG_ROLES[0]
}
