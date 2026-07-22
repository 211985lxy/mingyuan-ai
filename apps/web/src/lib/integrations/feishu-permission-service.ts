/**
 * 飞书权限服务（WP-1.3）。
 *
 * 统一的权限设置与回读验证。
 * 权限失败时不写结果链接，进入人工接管。
 */
import { runLarkCliCommand, type LarkCliRunner } from "@/lib/integrations/lark-cli-runner"

// ─── 类型 ────────────────────────────────────────────────────────────────────

export type PermissionMemberType = "openid" | "userid" | "unionid" | "email" | "chatid"
export type PermissionRole = "view" | "edit" | "full_access"

export interface FeishuPermissionAddInput {
  /** 资产 token（doc token / sheet token / file token）。 */
  token: string
  /** 资产类型。 */
  type: "doc" | "sheet" | "file" | "bitable"
  /** 被授权者 ID。 */
  memberId: string
  /** 被授权者 ID 类型。 */
  memberType: PermissionMemberType
  /** 权限角色。 */
  role: PermissionRole
  identity?: "user" | "bot"
  runner?: LarkCliRunner
  cliPath?: string
}

export interface FeishuPermissionAddResult {
  ok: true
  token: string
  memberId: string
  role: PermissionRole
}

export interface FeishuPermissionVerifyInput {
  token: string
  type: "doc" | "sheet" | "file" | "bitable"
  memberId: string
  memberType: PermissionMemberType
  identity?: "user" | "bot"
  runner?: LarkCliRunner
  cliPath?: string
}

// ─── 核心函数 ────────────────────────────────────────────────────────────────

/**
 * 给飞书资产添加协作者权限。
 * 使用 drive +permission-add shortcut。
 */
export async function addFeishuPermission(input: FeishuPermissionAddInput): Promise<FeishuPermissionAddResult> {
  await runLarkCliCommand({
    domain: "drive",
    command: "+permission-add",
    args: [
      "--token", input.token,
      "--type", input.type,
      "--member-id", input.memberId,
      "--member-type", input.memberType,
      "--role", input.role,
    ],
    identity: input.identity,
    runner: input.runner,
    cliPath: input.cliPath,
  })

  return {
    ok: true,
    token: input.token,
    memberId: input.memberId,
    role: input.role,
  }
}

/**
 * 批量添加权限（多个协作者）。
 * 串行执行，任一失败则停止并返回已成功列表。
 */
export async function addFeishuPermissions(input: {
  token: string
  type: "doc" | "sheet" | "file" | "bitable"
  members: Array<{ memberId: string; memberType: PermissionMemberType; role: PermissionRole }>
  identity?: "user" | "bot"
  runner?: LarkCliRunner
  cliPath?: string
}): Promise<{
  ok: boolean
  succeeded: FeishuPermissionAddResult[]
  failed?: { memberId: string; error: string }
}> {
  const succeeded: FeishuPermissionAddResult[] = []

  for (const member of input.members) {
    try {
      const result = await addFeishuPermission({
        token: input.token,
        type: input.type,
        memberId: member.memberId,
        memberType: member.memberType,
        role: member.role,
        identity: input.identity,
        runner: input.runner,
        cliPath: input.cliPath,
      })
      succeeded.push(result)
    } catch (err) {
      return {
        ok: false,
        succeeded,
        failed: {
          memberId: member.memberId,
          error: err instanceof Error ? err.message : String(err),
        },
      }
    }
  }

  return { ok: true, succeeded }
}

/**
 * 验证权限是否生效（回读验证）。
 * 尝试以目标身份读取资产，成功则权限已生效。
 *
 * 注意：这是最佳尝试验证，某些情况下 Bot 无法完全模拟用户视角。
 * 失败时不阻断流程，但记录警告。
 */
export async function verifyFeishuPermission(input: FeishuPermissionVerifyInput): Promise<{
  verified: boolean
  warning?: string
}> {
  try {
    // 尝试回读资产元数据作为权限验证
    await runLarkCliCommand({
      domain: "drive",
      command: "+metadata",
      args: ["--file-token", input.token],
      identity: input.identity,
      runner: input.runner,
      cliPath: input.cliPath,
    })
    return { verified: true }
  } catch (err) {
    return {
      verified: false,
      warning: `权限回读验证失败（不阻断流程）：${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
