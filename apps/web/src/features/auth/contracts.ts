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
