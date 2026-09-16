/**
 * 数字人 provider 的统一错误类型。
 *
 * 为什么单独成文件：`digital-human-provider.ts` 的提交分支已按 provider 拆到
 * `hypit-submit.ts` / `heygen-submit.ts`，它们都要抛这个错误。若继续放在
 * `digital-human-provider.ts`，就会形成 provider ↔ 子模块的**循环 import**；
 * 抽出来后依赖是单向的（子模块 → 本文件 ← provider）。
 *
 * `digital-human-provider.ts` 对本类做了转出，既有 `@/lib/digital-human-provider`
 * 的 import 路径保持不变。
 */

export class DigitalHumanProviderError extends Error {
  constructor(
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message)
    this.name = "DigitalHumanProviderError"
  }
}
