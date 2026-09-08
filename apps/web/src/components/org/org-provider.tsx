"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"

import {
  ORG_ROLES,
  orgRoleCan,
  type OrgCapability,
  type OrgRole,
  type OrgRoleId,
} from "@/lib/org/config"

/**
 * 组织协同 Provider（Step⑤）。
 *
 * 把组织角色与权限矩阵以 Context 注入 dashboard，供侧栏等处显性化渲染。
 * 纯展示层：服务端鉴权仍由各路由的 auth 包装器与 HITL gate 负责。
 */

interface OrgContextValue {
  roles: readonly OrgRole[]
  /** 当前登录用户映射的组织角色（ADMIN_EMAIL → business_owner；未映射为 null）。 */
  currentRoleId: OrgRoleId | null
  can: (capability: OrgCapability) => boolean
}

const OrgContext = createContext<OrgContextValue | null>(null)

export function OrgProvider(props: { children: ReactNode; currentUserEmail?: string | null }) {
  const value = useMemo<OrgContextValue>(() => {
    const email = props.currentUserEmail?.trim().toLowerCase() || ""
    const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase() || ""
    const currentRoleId: OrgRoleId | null = email && adminEmail && email === adminEmail
      ? "business_owner"
      : null
    return {
      roles: ORG_ROLES,
      currentRoleId,
      can: (capability: OrgCapability) =>
        currentRoleId ? orgRoleCan(currentRoleId, capability) : false,
    }
  }, [props.currentUserEmail])

  return <OrgContext.Provider value={value}>{props.children}</OrgContext.Provider>
}

/**
 * @description 读取组织上下文（Provider 缺失时返回静态角色表，便于纯展示复用）
 */
export function useOrg(): OrgContextValue {
  const value = useContext(OrgContext)
  if (value) return value
  return {
    roles: ORG_ROLES,
    currentRoleId: null,
    can: () => false,
  }
}
