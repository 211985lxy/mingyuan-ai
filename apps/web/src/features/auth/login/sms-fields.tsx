"use client"

import { KeyRound, Loader2, Smartphone } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export const PHONE_PATTERN = /^1[3-9]\d{9}$/
export const CODE_PATTERN = /^\d{6}$/

export function PhoneField(props: {
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

export function CodeField(props: {
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
