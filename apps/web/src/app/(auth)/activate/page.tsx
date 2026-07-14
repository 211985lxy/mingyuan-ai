"use client"

import React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, KeyRound, LogOut, ShieldAlert } from "lucide-react"
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
import { ApiError, activateUser, getCurrentUser, logoutUser } from "@/lib/api/client"
import { useAuthStore } from "@/lib/store"
import { getSubscriptionStatus } from "@/lib/subscription"

function formatDate(dateStr?: string | null) {
  if (!dateStr) return null

  return new Date(dateStr).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

export default function ActivatePage() {
  const router = useRouter()
  const { user, setSession, updateUser, clearSession, isHydrated } = useAuthStore()

  const [code, setCode] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [checking, setChecking] = React.useState(true)
  const [submitError, setSubmitError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!isHydrated) return

    getCurrentUser()
      .then((liveUser) => {
        setSession(liveUser)

        if (liveUser.subscriptionStatus === "active") {
          router.replace("/home")
        }
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          clearSession()
          router.replace("/login")
          return
        }
      })
      .finally(() => setChecking(false))
  }, [isHydrated, router, setSession, clearSession])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) {
      setSubmitError("请输入激活码")
      return
    }

    setLoading(true)
    setSubmitError(null)

    try {
      const nextUser = await activateUser(code)
      updateUser(nextUser)
      router.replace("/home")
    } catch (error) {
      setSubmitError(
        error instanceof ApiError ? error.message : "激活失败，请稍后重试"
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    try {
      await logoutUser()
    } finally {
      clearSession()
      router.replace("/login")
    }
  }

  if (!isHydrated || checking) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          正在检查账号状态...
        </CardContent>
      </Card>
    )
  }

  const subscriptionStatus = getSubscriptionStatus(user?.expiresAt ?? null)
  const expiryText = formatDate(user?.expiresAt)

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">激活账号</CardTitle>
        <CardDescription>
          注册后需先输入客服提供的激活码，系统才会为你开通服务期限。
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="rounded-xl border bg-muted/40 p-4 text-sm">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-500" />
            <div className="space-y-1">
              <p className="font-medium">
                {subscriptionStatus === "expired" ? "当前服务已过期" : "当前账号未激活"}
              </p>
              <p className="text-muted-foreground">
                账号: {user?.email ?? "—"}
              </p>
              {subscriptionStatus === "expired" && expiryText ? (
                <p className="text-muted-foreground">
                  上次到期时间: {expiryText}
                </p>
              ) : null}
              <p className="text-muted-foreground">
                联系客服获取激活码并填写到下方。
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="activation-code">
              <KeyRound className="size-4 text-muted-foreground" />
              激活码
            </Label>
            <Input
              id="activation-code"
              type="text"
              placeholder="例如 ABCD-EFGH-JKLM-NPQ2"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <p className="text-xs text-muted-foreground">
              激活码为 16 位字母数字组合，支持直接粘贴，连字符会自动兼容。
            </p>
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className="w-full cursor-pointer"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            立即激活
          </Button>
          {submitError ? (
            <p className="text-sm text-destructive">{submitError}</p>
          ) : null}
        </form>

        <div className="flex items-center justify-between text-sm">
          <Link
            href="/login"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            返回登录
          </Link>
          <Button
            type="button"
            variant="ghost"
            onClick={handleLogout}
            className="cursor-pointer px-0 text-muted-foreground"
          >
            <LogOut className="mr-1 h-4 w-4" />
            退出账号
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
