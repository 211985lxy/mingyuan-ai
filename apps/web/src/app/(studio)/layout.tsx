"use client"

import { AuthGuard } from "@/components/layout/auth-guard"
import { StudioShell } from "@/components/studio/studio-shell"
import { useSessionVerify } from "@/hooks/use-session-verify"

/**
 * 数字人工坊独立布局：与 dashboard 侧栏解耦，只保留工坊顶栏；鉴权口径一致。
 * useSessionVerify 必须调用——否则无本地会话时 sessionChecked 永为 false，AuthGuard 白屏不跳登录。
 */
export default function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  useSessionVerify()

  return (
    <AuthGuard>
      <StudioShell>{children}</StudioShell>
    </AuthGuard>
  )
}
