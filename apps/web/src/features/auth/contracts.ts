import { z } from "zod"

const email = z
  .string()
  .trim()
  .max(254)
  .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
    message: "请输入有效的邮箱地址",
  })
const password = z.string().min(6, "密码至少需要 6 个字符").max(128)

export const loginBodySchema = z.object({ email, password }).strict()

export const registerBodySchema = z.object({
  email,
  password,
  name: z.string().trim().min(1, "请输入名称").max(100),
}).strict()

export const activationBodySchema = z.object({
  code: z.string().trim().min(1, "请输入激活码").max(64),
}).strict()

const phone = z
  .string()
  .trim()
  .refine((value) => /^1[3-9]\d{9}$/.test(value), {
    message: "请输入有效的手机号",
  })

export const smsSendBodySchema = z.object({ phone }).strict()

export const smsLoginBodySchema = z.object({
  phone,
  code: z.string().trim().regex(/^\d{6}$/, "请输入 6 位数字验证码"),
}).strict()
