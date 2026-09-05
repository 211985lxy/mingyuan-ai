"use client"

import React from "react"
import { KeyRound, Loader2, Smartphone } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError, loginUserBySms, sendSmsLoginCode } from "@/lib/api/client"
import type { ApiUser } from "@/types/api-core"

export const PHONE_PATTERN = /^1[3-9]\d{9}$/
export const CODE_PATTERN = /^\d{6}$/

function validateSmsForm(phone: string, code: string) {
  const next: { phone?: string; code?: string } = {}
  if (!PHONE_PATTERN.test(phone.trim())) next.phone = "请输入有效的手机号"
  if (!CODE_PATTERN.test(code.trim())) next.code = "请输入 6 位数字验证码"
  return next
}

function PhoneField(props: {
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="phone">
        <Smartphone className="size-4 text-muted-foreground" />
        手机号
      </Label>
      <Input
        id="phone"
        type="tel"
        inputMode="numeric"
        maxLength={11}
        placeholder="请输入手机号"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value.replace(/\D/g, ""))}
        aria-invalid={!!props.error}
        className="transition-colors duration-200"
      />
      {props.error && <p className="text-xs text-destructive">{props.error}</p>}
    </div>
  )
}

function CodeField(props: {
  value: string
  onChange: (v: string) => void
  error?: string
  countdown: number
  sending: boolean
  disabled: boolean
  onSend: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="sms-code">
        <KeyRound className="size-4 text-muted-foreground" />
        验证码
      </Label>
      <div className="flex gap-2">
        <Input
          id="sms-code"
          inputMode="numeric"
          maxLength={6}
          placeholder="6 位数字"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value.replace(/\D/g, ""))}
          aria-invalid={!!props.error}
          className="transition-colors duration-200"
        />
        <Button
          type="button"
          variant="outline"
          className="w-32 shrink-0 cursor-pointer"
          disabled={props.sending || props.countdown > 0 || props.disabled}
          onClick={props.onSend}
        >
          {props.sending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : props.countdown > 0 ? (
            `${props.countdown}s 后重发`
          ) : (
            "获取验证码"
          )}
        </Button>
      </div>
      {props.error && <p className="text-xs text-destructive">{props.error}</p>}
    </div>
  )
}

export function SmsLoginForm(props: {
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
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000)
    return () => clearInterval(timer)
  }, [countdown])

  async function handleSendCode() {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const next = validateSmsForm(phone, code)
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setLoading(true)
    props.onError("")
    try {
      const session = await loginUserBySms(phone.trim(), code.trim())
      props.onSuccess(session.user)
    } catch (error) {
      props.onError(error instanceof ApiError ? error.message : "登录失败，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PhoneField value={phone} onChange={setPhone} error={errors.phone} />
      <CodeField
        value={code}
        onChange={setCode}
        error={errors.code}
        countdown={countdown}
        sending={sending}
        disabled={loading || props.disabled}
        onSend={handleSendCode}
      />
      <Button
        type="submit"
        size="lg"
        disabled={loading || props.disabled}
        className="w-full cursor-pointer transition-colors duration-200"
      >
        {loading && <Loader2 className="size-4 animate-spin" />}
        登录 / 注册
      </Button>
      <p className="text-xs text-muted-foreground">
        未注册的手机号验证通过后将自动创建账号。
      </p>
    </form>
  )
}
