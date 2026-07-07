import { chromium, devices } from "@playwright/test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

const baseUrl = process.env.MOBILE_CHECK_BASE_URL ?? "http://localhost:3000"
const outputDir = path.resolve("output/mobile-audit")
const loginEmail = process.env.MOBILE_CHECK_EMAIL ?? "admin@clipflow.com"
const loginPassword = process.env.MOBILE_CHECK_PASSWORD ?? "mobile-check"

const device = devices["iPhone 13"]

const publicRoutes = [
  { name: "marketing-home", path: "/" },
  { name: "login", path: "/login" },
  { name: "register", path: "/register" },
  { name: "admin-login", path: "/admin/login" },
]

const userRoutes = [
  { name: "dashboard-home", path: "/home" },
  { name: "aim", path: "/aim" },
  { name: "hot-topics", path: "/hot-topics" },
  { name: "competitor", path: "/competitor" },
  { name: "projects", path: "/projects" },
  { name: "ai-hot", path: "/ai-hot" },
  { name: "scheduled-tasks", path: "/scheduled-tasks" },
  { name: "quality-check", path: "/quality-check" },
]

const adminRoutes = [
  { name: "admin-dashboard", path: "/admin" },
  { name: "admin-knowledge", path: "/admin/knowledge" },
  { name: "admin-agents", path: "/admin/agents" },
  { name: "admin-hot-sources", path: "/admin/hot-sources" },
]

async function postJson(pathname, body) {
  const res = await fetch(new URL(pathname, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) return null
  return res.json()
}

async function login() {
  const user = await postJson("/api/auth/login", {
    email: loginEmail,
    password: loginPassword,
  })
  const admin = await postJson("/api/admin/auth/login", {
    email: loginEmail,
    password: loginPassword,
  })
  return { user, admin }
}

async function seedAuth(context, auth) {
  await context.addInitScript(({ user, admin }) => {
    if (user?.token && user?.user) {
      localStorage.setItem("mingyuan-auth", JSON.stringify({
        state: { token: user.token, user: user.user },
        version: 0,
      }))
    }
    if (admin?.token && admin?.admin) {
      localStorage.setItem("mingyuan-admin-auth", JSON.stringify({
        state: { token: admin.token, admin: admin.admin },
        version: 0,
      }))
    }
  }, auth)
}

async function inspectRoute(page, route) {
  const response = await page.goto(new URL(route.path, baseUrl).toString(), {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  })
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => null)

  const screenshot = path.join(outputDir, `${route.name}.png`)
  await page.screenshot({ path: screenshot, fullPage: true })

  const result = await page.evaluate(() => {
    const bodyText = document.body.innerText.trim()
    const visibleTextLength = bodyText.length
    const documentWidth = document.documentElement.scrollWidth
    const viewportWidth = document.documentElement.clientWidth
    const overflow = documentWidth - viewportWidth
    const badText = /Application error|Unhandled Runtime Error|Internal Server Error|This page could not be found|NEXT_REDIRECT/.test(bodyText)
    const tinyTargets = [...document.querySelectorAll("button,a,input,textarea,select,[role='button']")]
      .filter((el) => {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return false
        return rect.width < 36 || rect.height < 36
      })
      .slice(0, 8)
      .map((el) => {
        const rect = el.getBoundingClientRect()
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 32),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }
      })

    return {
      title: document.title,
      url: location.pathname,
      visibleTextLength,
      viewportWidth,
      documentWidth,
      overflow,
      badText,
      tinyTargets,
    }
  })

  return {
    ...route,
    status: response?.status() ?? null,
    screenshot,
    ok:
      (response?.status() ?? 0) < 500 &&
      result.visibleTextLength > 20 &&
      result.overflow <= 2 &&
      !result.badText,
    ...result,
  }
}

async function main() {
  await mkdir(outputDir, { recursive: true })
  const auth = await login()
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext(device)
  await seedAuth(context, auth)
  const page = await context.newPage()

  const routes = [
    ...publicRoutes,
    ...(auth.user ? userRoutes : []),
    ...(auth.admin ? adminRoutes : []),
  ]

  const results = []
  for (const route of routes) {
    results.push(await inspectRoute(page, route))
  }

  await browser.close()

  const summary = {
    baseUrl,
    device: "iPhone 13",
    auth: {
      user: Boolean(auth.user),
      admin: Boolean(auth.admin),
      email: loginEmail,
    },
    passed: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results,
  }

  await writeFile(
    path.join(outputDir, "mobile-responsive-report.json"),
    `${JSON.stringify(summary, null, 2)}\n`
  )

  for (const item of results) {
    const mark = item.ok ? "OK" : "FAIL"
    console.log(`${mark} ${item.path} status=${item.status} overflow=${item.overflow}px screenshot=${item.screenshot}`)
    if (item.tinyTargets.length) {
      console.log(`  small targets: ${item.tinyTargets.map((target) => `${target.tag}:${target.text || "(blank)"} ${target.width}x${target.height}`).join("; ")}`)
    }
  }

  if (summary.failed > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
