"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { Loader2, Mail, Lock } from "lucide-react"

import { BrandLogo } from "@/components/branding/brand-logo"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useBranding } from "@/components/providers/branding-provider"
import { adminLogin, AdminApiError } from "@/lib/api/admin-client"
import { useAdminStore } from "@/lib/admin-store"

export default function AdminLoginPage() {
  const router = useRouter()
  const setSession = useAdminStore((s) => s.setSession)
  const branding = useBranding()

  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return

    setLoading(true)
    setError(null)
    try {
      const res = await adminLogin(email, password)
      setSession(res.token, res.admin)
      router.push("/admin")
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "登录失败"
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <BrandLogo className="mx-auto mb-2 h-14 w-14" />
          <CardTitle className="text-xl">管理后台登录</CardTitle>
          <CardDescription>登录 {branding.name} 管理后台</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-email">
                <Mail className="size-4 text-muted-foreground" />
                邮箱
              </Label>
              <Input
                id="admin-email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="transition-colors duration-200"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-password">
                <Lock className="size-4 text-muted-foreground" />
                密码
              </Label>
              <Input
                id="admin-password"
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="transition-colors duration-200"
              />
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={loading || !email.trim() || !password}
              className="w-full cursor-pointer transition-colors duration-200"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              登录
            </Button>

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
