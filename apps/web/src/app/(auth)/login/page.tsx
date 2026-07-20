"use client"

import React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { KeyRound, Loader2, Mail, Lock } from "lucide-react"

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
import { ApiError, devLoginUser, loginUser } from "@/lib/api/client"
import { useAuthStore } from "@/lib/store"
import { getSubscriptionStatus } from "@/lib/subscription"

export default function LoginPage() {
  const router = useRouter()
  const setSession = useAuthStore((s) => s.setSession)

  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({})
  const [loading, setLoading] = React.useState(false)
  const [devLoading, setDevLoading] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)

  function goAfterLogin(expiresAt?: string | null) {
    router.push(getSubscriptionStatus(expiresAt ?? null) === "active" ? "/home" : "/activate")
  }

  function validate(): boolean {
    const next: { email?: string; password?: string } = {}

    if (!email.trim()) {
      next.email = "请输入邮箱"
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      next.email = "请输入有效的邮箱地址"
    }

    if (!password) {
      next.password = "请输入密码"
    } else if (password.length < 6) {
      next.password = "密码至少需要 6 个字符"
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    setSubmitError(null)
    try {
      const session = await loginUser(email, password)
      setSession(session.user)
      goAfterLogin(session.user.expiresAt)
    } catch (error) {
      setSubmitError(
        error instanceof ApiError ? error.message : "登录失败，请稍后重试"
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleDevLogin() {
    setDevLoading(true)
    setSubmitError(null)
    try {
      const session = await devLoginUser()
      setSession(session.user)
      goAfterLogin(session.user.expiresAt)
    } catch (error) {
      setSubmitError(
        error instanceof ApiError ? error.message : "本地一键登录失败"
      )
    } finally {
      setDevLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">登录</CardTitle>
        <CardDescription>欢迎回来，请登录您的账号</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">
              <Mail className="size-4 text-muted-foreground" />
              邮箱
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!errors.email}
              className="transition-colors duration-200"
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">
              <Lock className="size-4 text-muted-foreground" />
              密码
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="至少 6 个字符"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
              className="transition-colors duration-200"
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password}</p>
            )}
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={loading || devLoading}
            className="w-full cursor-pointer transition-colors duration-200"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            登录
          </Button>
          {submitError && (
            <p className="text-sm text-destructive">{submitError}</p>
          )}
        </form>

        {process.env.NODE_ENV === "development" && (
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="mt-3 w-full cursor-pointer"
            disabled={loading || devLoading}
            onClick={handleDevLogin}
          >
            {devLoading ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            本地一键登录
          </Button>
        )}

        <p className="mt-4 text-center text-sm text-muted-foreground">
          没有账号？{" "}
          <Link
            href="/register"
            className="cursor-pointer text-primary underline-offset-4 hover:underline transition-colors duration-200"
          >
            注册
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
