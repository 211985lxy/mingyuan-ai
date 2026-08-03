import { NextResponse, type NextRequest } from "next/server"
import { jwtVerify } from "jose"

/**
 * 服务端纵深防御：后台页面在请求进入渲染前就拦截。
 *
 * 背景：`src/app/admin/layout.tsx` 此前仅靠客户端 `AdminAuthGuard`（useEffect 跳转）
 * 拦截，未登录访问 `/admin/*` 时页面 HTML/JS bundle 仍会下发到浏览器，且整体安全
 * 完全依赖"每个 admin API 都记得包裹 withAdminAuth"。本 middleware 在 Edge 运行时
 * 增加一道服务端校验，杜绝 bundle 泄露与纵深缺失。
 *
 * 设计原则（与 withAdminAuth 分工）：
 *   - middleware：轻量 JWT 签名/过期校验（Edge runtime，不连库、不做角色判断）。
 *   - withAdminAuth（API 层）：完整的 sessionVersion/isActive/role 校验，仍是唯一权威。
 *   - secret 缺失时 fail-open（放行）：生产环境 secret 必然注入，且密钥强度/有效性
 *     由 withAdminAuth 兜底；此处只做"有 cookie 且签名正确"的快速拦截，避免在 Edge
 *     环境（如部分预览环境未注入 secret）误伤正常请求。
 *
 * 注意：Edge runtime 不支持 jsonwebtoken/prisma，因此用 jose 做对称 HS256 校验，
 * 与签发端 signAdminToken（默认 HS256）密钥一致即可互验。
 */

const ADMIN_COOKIE = "mingyuan_admin_session"

function getSecret(): Uint8Array | null {
  const secret = process.env.ADMIN_JWT_SECRET
  if (!secret || secret.length < 32) return null
  return new TextEncoder().encode(secret)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 仅保护后台页面；登录页本身需匿名访问。
  if (!pathname.startsWith("/admin") || pathname === "/admin/login") {
    return NextResponse.next()
  }

  const token = request.cookies.get(ADMIN_COOKIE)?.value
  // 无 token 直接重定向到登录页（不渲染后台 bundle）。
  if (!token || token === "null" || token === "undefined") {
    return NextResponse.redirect(new URL("/admin/login", request.url))
  }

  const secret = getSecret()
  // secret 未配置/过短：fail-open，交由 API 层 withAdminAuth 兜底（它会 fail-fast）。
  if (!secret) {
    return NextResponse.next()
  }

  try {
    // 仅校验签名与过期。payload 不在此消费，权限细节交给 API 层。
    await jwtVerify(token, secret, { algorithms: ["HS256"] })
  } catch {
    // 签名无效/过期：清掉无效 cookie 并重定向到登录页。
    const res = NextResponse.redirect(new URL("/admin/login", request.url))
    res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 })
    return res
  }

  return NextResponse.next()
}

export const config = {
  // 仅匹配后台页面（含嵌套动态路由），不影响 API、营销页与用户工作台性能。
  matcher: ["/admin/:path*"],
}
