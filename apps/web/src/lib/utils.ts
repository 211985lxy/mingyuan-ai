import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * @description 合并 Tailwind CSS 类名，自动处理冲突类
 * @param inputs - 需要合并的类名片段（支持条件类、数组等）
 * @returns 合并去重后的类名字符串
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
