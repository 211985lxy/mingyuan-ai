"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

/**
 * 全局错误边界。
 *
 * 必须是 client component 且自带 <html><body>（它替换 root layout）。
 * 故意保持纯静态、不调用任何 DB / next-intl / 请求上下文 API，
 * 以避开 Next.js 16 的 workUnitAsyncStorage prerender InvariantError。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, background: "#FAF8F3", color: "#25211D", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 480, margin: "10vh auto", padding: 24 }}>
          <h2 style={{ marginBottom: "0.5rem" }}>页面出了点问题</h2>
          <p style={{ color: "#5C5346", marginBottom: "1.5rem" }}>
            系统遇到未预期的错误,请稍后重试。
          </p>
          {error?.digest ? (
            <p style={{ color: "#8A8175", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
              错误编号:{error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0.5rem 1rem",
              background: "#D14A33",
              color: "#FAF8F3",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            重试
          </button>
        </div>
      </body>
    </html>
  )
}
