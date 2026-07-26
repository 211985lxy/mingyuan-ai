"use client"

import React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, Mail, Lock, ShieldCheck } from "lucide-react"

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
import { ApiError, registerUser } from "@/lib/api/client"
import { useAuthStore } from "@/lib/store"
import { getSubscriptionStatus } from "@/lib/subscription"
import { MARKETING_PRODUCT_NAME } from "@/lib/marketing-brand"

export default function RegisterPage() {
  const router = useRouter()
  const setSession = useAuthStore((s) => s.setSession)

  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [errors, setErrors] = React.useState<{
    name?: string
    email?: string
    password?: string
    confirmPassword?: string
  }>({})
  const [loading, setLoading] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)

  function validate(): boolean {
    const next: {
      name?: string
      email?: string
      password?: string
      confirmPassword?: string
    } = {}

    if (!name.trim()) {
      next.name = "请输入你的名字"
    }

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

    if (!confirmPassword) {
      next.confirmPassword = "请确认密码"
    } else if (confirmPassword !== password) {
      next.confirmPassword = "两次输入的密码不一致"
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
      const session = await registerUser({
        name: name.trim(),
        email,
        password,
      })
      setSession(session.user)
      router.push(
        getSubscriptionStatus(session.user.expiresAt ?? null) === "active"
          ? "/"
          : "/activate"
      )
    } catch (error) {
      setSubmitError(
        error instanceof ApiError ? error.message : "注册失败，请稍后重试"
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">注册明远 AIM</CardTitle>
        <CardDescription>
          创建 {MARKETING_PRODUCT_NAME}{" "}
          账号。若需企业诊断，请先从官网添加微信预约。
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">
              <ShieldCheck className="size-4 text-muted-foreground" />
              名称
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="你的名字或品牌名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.name}
              className="transition-colors duration-200"
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword">
              <ShieldCheck className="size-4 text-muted-foreground" />
              确认密码
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="再次输入密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={!!errors.confirmPassword}
              className="transition-colors duration-200"
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{errors.confirmPassword}</p>
            )}
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className="w-full cursor-pointer transition-colors duration-200"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            注册
          </Button>
          {submitError && (
            <p className="text-sm text-destructive">{submitError}</p>
          )}
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          已有账号？{" "}
          <Link
            href="/login"
            className="cursor-pointer text-primary underline-offset-4 hover:underline transition-colors duration-200"
          >
            登录
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
