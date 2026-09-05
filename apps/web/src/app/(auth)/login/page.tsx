"use client"

import React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { KeyRound, Loader2, Mail, QrCode, Smartphone } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DouyinLoginForm,
  DouyinPhoneBindForm,
  PasswordLoginForm,
  SmsLoginForm,
} from "@/features/auth/login/forms"
import { ApiError, devLoginUser } from "@/lib/api/client"
import { useAuthStore } from "@/lib/store"
import { getSubscriptionStatus } from "@/lib/subscription"
import type { ApiUser } from "@/types/api-core"

type LoginMode = "password" | "sms" | "douyin"

function getInitialDouyinState(): { bind: boolean; error: string | null } {
  if (typeof window === "undefined") return { bind: false, error: null }
  const params = new URLSearchParams(window.location.search)
  const rawError = params.get("douyin_error")
  let error: string | null = null
  if (rawError) {
    try {
      error = decodeURIComponent(rawError)
    } catch {
      error = rawError
    }
  }
  return { bind: params.get("douyin") === "bind", error }
}

function LoginModeTabs(props: {
  mode: LoginMode
  onChange: (mode: LoginMode) => void
}) {
  const tabs: { key: LoginMode; label: string; icon: React.ReactNode }[] = [
    { key: "password", label: "密码登录", icon: <Mail className="size-4" /> },
    { key: "sms", label: "验证码登录", icon: <Smartphone className="size-4" /> },
    { key: "douyin", label: "抖音扫码", icon: <QrCode className="size-4" /> },
  ]

  return (
    <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors duration-200 ${
            props.mode === tab.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => props.onChange(tab.key)}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function DevLoginButton(props: { loading: boolean; onClick: () => void }) {
  if (process.env.NODE_ENV !== "development") return null

  return (
    <Button
      type="button"
      size="lg"
      variant="outline"
      className="mt-3 w-full cursor-pointer"
      disabled={props.loading}
      onClick={props.onClick}
    >
      {props.loading ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
      本地一键登录
    </Button>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const setSession = useAuthStore((s) => s.setSession)
  const initialDouyinState = React.useState(getInitialDouyinState)[0]

  const [mode, setMode] = React.useState<LoginMode>(initialDouyinState.bind ? "douyin" : "password")
  const [douyinBind, setDouyinBind] = React.useState(initialDouyinState.bind)
  const [devLoading, setDevLoading] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(initialDouyinState.error)

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has("douyin") || params.has("douyin_error")) {
      params.delete("douyin")
      params.delete("douyin_error")
      const query = params.toString()
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`)
    }
  }, [])

  function handleSuccess(user: ApiUser) {
    setSession(user)
    const status = getSubscriptionStatus(user.expiresAt ?? null)
    router.push(status === "active" ? "/lite" : "/activate")
  }

  function handleError(message: string) {
    setSubmitError(message || null)
  }

  async function handleDevLogin() {
    setDevLoading(true)
    setSubmitError(null)
    try {
      const session = await devLoginUser()
      handleSuccess(session.user)
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
        <CardTitle className="text-xl">登录明远 AIM</CardTitle>
        <CardDescription>
          欢迎回来。登录后进入企业智能体工作台；官网转化仍以微信预约诊断为主。
        </CardDescription>
      </CardHeader>

      <CardContent>
        <LoginModeTabs
          mode={mode}
          onChange={(next) => {
            setMode(next)
            if (next !== "douyin") setDouyinBind(false)
            setSubmitError(null)
          }}
        />

        {mode === "password" ? (
          <PasswordLoginForm onSuccess={handleSuccess} onError={handleError} disabled={devLoading} />
        ) : (
          mode === "sms" ? (
            <SmsLoginForm onSuccess={handleSuccess} onError={handleError} disabled={devLoading} />
          ) : douyinBind ? (
            <DouyinPhoneBindForm onSuccess={handleSuccess} onError={handleError} disabled={devLoading} />
          ) : (
            <DouyinLoginForm disabled={devLoading} onError={handleError} />
          )
        )}

        {submitError && (
          <p className="mt-3 text-sm text-destructive">{submitError}</p>
        )}

        <DevLoginButton loading={devLoading} onClick={handleDevLogin} />

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
