"use client"

/**
 * 全局错误边界。
 *
 * 必须是 client component 且自带 <html><body>(它替换 root layout)。
 * 故意保持纯静态、不调用任何 DB / next-intl / 请求上下文 API,
 * 以避开 Next.js 16 的 workUnitAsyncStorage prerender InvariantError。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="zh-CN">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", color: "#1f2937" }}>
        <div style={{ maxWidth: 480, margin: "10vh auto" }}>
          <h2 style={{ marginBottom: "0.5rem" }}>页面出了点问题</h2>
          <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
            系统遇到未预期的错误,请稍后重试。
          </p>
          {error?.digest ? (
            <p style={{ color: "#9ca3af", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
              错误编号:{error.digest}
            </p>
          ) : null}
          <button
            onClick={() => reset()}
            style={{
              padding: "0.5rem 1rem",
              background: "#111827",
              color: "#fff",
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
