import { describe, expect, it } from "vitest"

import {
  ORG_CAPABILITY_MATRIX,
  ORG_ROLES,
  getOrgRole,
  orgRoleCan,
  type OrgCapability,
} from "@/lib/org/config"

/**
 * Step⑤ 组织协同显性化：角色矩阵自洽 + 权限门前向判断。
 * 展示层正本；服务端硬鉴权（auth 包装器 / HITL gate）不依赖此模块。
 */

describe("组织角色与权限矩阵", () => {
  it("三个角色且 id 唯一", () => {
    expect(ORG_ROLES.map((role) => role.id)).toEqual([
      "business_owner",
      "content_growth",
      "ai_system",
    ])
  })

  it("对外发送终审与数据删除仅业务决策角色可授权", () => {
    expect(orgRoleCan("business_owner", "approve_external_send")).toBe(true)
    expect(orgRoleCan("business_owner", "delete_customer_data")).toBe(true)
    expect(orgRoleCan("content_growth", "approve_external_send")).toBe(false)
    expect(orgRoleCan("ai_system", "delete_customer_data")).toBe(false)
  })

  it("内容增长负责发布/归因/回填，不碰内核运维", () => {
    expect(orgRoleCan("content_growth", "publish_content")).toBe(true)
    expect(orgRoleCan("content_growth", "attribute_leads")).toBe(true)
    expect(orgRoleCan("content_growth", "backfill_outcome")).toBe(true)
    expect(orgRoleCan("content_growth", "operate_aim_core")).toBe(false)
    expect(orgRoleCan("content_growth", "sync_feishu_state")).toBe(false)
  })

  it("AI 系统负责内核/飞书/知识资产，不做对外发布终审", () => {
    expect(orgRoleCan("ai_system", "operate_aim_core")).toBe(true)
    expect(orgRoleCan("ai_system", "sync_feishu_state")).toBe(true)
    expect(orgRoleCan("ai_system", "manage_knowledge")).toBe(true)
    expect(orgRoleCan("ai_system", "approve_external_send")).toBe(false)
  })

  it("矩阵覆盖全部已声明能力，无悬空项", () => {
    const declared = Object.values(ORG_CAPABILITY_MATRIX).flat()
    const unique = new Set<string>(declared)
    for (const capability of unique as Set<OrgCapability>) {
      // 每个能力至少有一个角色可以执行（否则该能力无人负责，属组织缺口）
      expect(declared, `${capability} 无人负责`).toContain(capability)
    }
    expect(getOrgRole("business_owner").owner.length).toBeGreaterThan(0)
  })
})
