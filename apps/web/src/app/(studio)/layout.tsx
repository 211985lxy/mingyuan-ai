import { AuthGuard } from "@/components/layout/auth-guard"
import { StudioShell } from "@/components/studio/studio-shell"

/** 数字人工坊独立布局：与 dashboard 侧栏解耦，只保留工坊顶栏；鉴权口径一致。 */
export default function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      <StudioShell>{children}</StudioShell>
    </AuthGuard>
  )
}
