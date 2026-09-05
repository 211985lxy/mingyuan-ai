"use client"

import React from "react"
import { Loader2, Mail, Lock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError, loginUser } from "@/lib/api/client"
import type { ApiUser } from "@/types/api-core"

function EmailField(props: {
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="email">
        <Mail className="size-4 text-muted-foreground" />
        邮箱
      </Label>
      <Input
        id="email"
        type="email"
        placeholder="you@example.com"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        aria-invalid={!!props.error}
        className="transition-colors duration-200"
      />
      {props.error && <p className="text-xs text-destructive">{props.error}</p>}
    </div>
  )
}

function PasswordField(props: {
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="password">
        <Lock className="size-4 text-muted-foreground" />
        密码
      </Label>
      <Input
        id="password"
        type="password"
        placeholder="至少 6 个字符"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        aria-invalid={!!props.error}
        className="transition-colors duration-200"
      />
      {props.error && <p className="text-xs text-destructive">{props.error}</p>}
    </div>
  )
}

export function PasswordLoginForm(props: {
  onSuccess: (user: ApiUser) => void
  onError: (message: string) => void
  disabled: boolean
}) {
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({})
  const [loading, setLoading] = React.useState(false)

  function validate(): boolean {
    const next: { email?: string; password?: string } = {}
    if (!email.trim()) next.email = "请输入邮箱"
    else if (!/\S+@\S+\.\S+/.test(email)) next.email = "请输入有效的邮箱地址"
    if (!password) next.password = "请输入密码"
    else if (password.length < 6) next.password = "密码至少需要 6 个字符"
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    props.onError("")
    try {
      const session = await loginUser(email, password)
      props.onSuccess(session.user)
    } catch (error) {
      props.onError(error instanceof ApiError ? error.message : "登录失败，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <EmailField value={email} onChange={setEmail} error={errors.email} />
      <PasswordField value={password} onChange={setPassword} error={errors.password} />
      <Button
        type="submit"
        size="lg"
        disabled={loading || props.disabled}
        className="w-full cursor-pointer transition-colors duration-200"
      >
        {loading && <Loader2 className="size-4 animate-spin" />}
        登录
      </Button>
    </form>
  )
}
