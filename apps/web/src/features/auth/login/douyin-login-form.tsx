"use client"

import React from "react"
import { Loader2, QrCode } from "lucide-react"

import { Button } from "@/components/ui/button"
import { completeDouyinLogin, sendSmsLoginCode } from "@/lib/api/auth"
import { ApiError } from "@/lib/api/client"
import type { ApiUser } from "@/types/api-core"
import { CodeField, PhoneField, CODE_PATTERN, PHONE_PATTERN } from "./sms-fields"

export function DouyinLoginForm(props: { disabled: boolean; onError: (message: string) => void }) {
  function startLogin() {
    window.location.assign("/api/auth/douyin/start")
  }

  return (
    <Button type="button" size="lg" className="w-full cursor-pointer" disabled={props.disabled} onClick={startLogin}>
      <QrCode className="size-4" />
      抖音扫码登录
    </Button>
  )
}

export function DouyinPhoneBindForm(props: {
  onSuccess: (user: ApiUser) => void
  onError: (message: string) => void
  disabled: boolean
}) {
  const [phone, setPhone] = React.useState("")
  const [code, setCode] = React.useState("")
  const [errors, setErrors] = React.useState<{ phone?: string; code?: string }>({})
  const [countdown, setCountdown] = React.useState(0)
  const [sending, setSending] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => setCountdown((current) => current - 1), 1000)
    return () => clearInterval(timer)
  }, [countdown])

  async function sendCode() {
    if (!PHONE_PATTERN.test(phone.trim())) {
      setErrors({ phone: "请输入有效的手机号" })
      return
    }
    setSending(true)
    props.onError("")
    try {
      const result = await sendSmsLoginCode(phone.trim())
      if (result.sent) setCountdown(result.retryAfterSeconds || 60)
    } catch (error) {
      props.onError(error instanceof ApiError ? error.message : "验证码发送失败，请稍后重试")
    } finally {
      setSending(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const next: { phone?: string; code?: string } = {}
    if (!PHONE_PATTERN.test(phone.trim())) next.phone = "请输入有效的手机号"
    if (!CODE_PATTERN.test(code.trim())) next.code = "请输入 6 位数字验证码"
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setLoading(true)
    props.onError("")
    try {
      const session = await completeDouyinLogin(phone.trim(), code.trim())
      props.onSuccess(session.user)
    } catch (error) {
      props.onError(error instanceof ApiError ? error.message : "登录失败，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">抖音登录还差一步：绑定手机号后，手机号才是你的 AIM 主账号。</p>
      <PhoneField value={phone} onChange={setPhone} error={errors.phone} />
      <CodeField
        value={code}
        onChange={setCode}
        error={errors.code}
        countdown={countdown}
        sending={sending}
        disabled={loading || props.disabled}
        onSend={sendCode}
      />
      <Button type="submit" size="lg" disabled={loading || props.disabled} className="w-full cursor-pointer">
        {loading && <Loader2 className="size-4 animate-spin" />}
        绑定手机号并登录
      </Button>
    </form>
  )
}
