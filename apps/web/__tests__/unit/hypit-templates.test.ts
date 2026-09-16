import { afterEach, describe, expect, it, vi } from "vitest"

// lib/hypit → lib/oss（对象存储）。单测只需要模块能加载，不需要真的上传。
vi.mock("@/lib/oss", () => ({ uploadBufferToOss: vi.fn() }))

const HYPIT_ENV_KEYS = [
  "HYPIT_RENDERER_URL",
  "HYPIT_API_TOKEN",
  "HYPIT_ENABLED",
  "HYPIT_SHADOW_MODE",
  "HYPIT_TEMPLATE_DIR",
] as const

type HypitEnvKey = (typeof HYPIT_ENV_KEYS)[number]

const ORIGINAL: Record<string, string | undefined> = {}
for (const key of HYPIT_ENV_KEYS) ORIGINAL[key] = process.env[key]

afterEach(() => {
  for (const key of HYPIT_ENV_KEYS) {
    if (ORIGINAL[key] === undefined) delete process.env[key]
    else process.env[key] = ORIGINAL[key]
  }
  vi.resetModules()
})

/**
 * 模板目录是**模块级常量**（避免每次请求都读环境），
 * 所以测试必须在 import 之前把环境摆好，并重置模块缓存。
 */
async function loadTemplates(overrides: Partial<Record<HypitEnvKey, string>> = {}) {
  vi.resetModules()
  for (const key of HYPIT_ENV_KEYS) delete process.env[key]
  Object.assign(process.env, overrides)
  return await import("@/lib/hypit-templates")
}

const CONFIGURED = {
  HYPIT_RENDERER_URL: "http://hypit-renderer:8787",
  HYPIT_API_TOKEN: "test-token",
} as const

describe("Hypit 模板注册表", () => {
  it("未知模板名直接失败，并列出可用模板", async () => {
    const { renderHypitTemplateByName } = await loadTemplates(CONFIGURED)
    expect(() => renderHypitTemplateByName("nope", {})).toThrow(/未知的 Hypit 模板/)
  })

  it("注入 template_dir，且渲染后不留任何 {{var}}", async () => {
    const { renderHypitTemplateByName } = await loadTemplates(CONFIGURED)
    const { markup } = renderHypitTemplateByName("generic-card", {})
    expect(markup).toContain('./templates/generic-card/recipes.svs')
    expect(markup).toContain('./templates/generic-card/assets/card.jpg')
    expect(markup).not.toMatch(/\{\{/)
  })

  it("Author Source 里不能出现 <target>——那是 Run Source 的元素", async () => {
    // 写进去会报 MARKUP_UNKNOWN_SURFACE: No imported module declares <target>，
    // 且是在上传校验阶段才炸，排查成本高。这条是回归护栏。
    const { HYPIT_TEMPLATES } = await loadTemplates(CONFIGURED)
    for (const [name, def] of Object.entries(HYPIT_TEMPLATES)) {
      expect(def.markup, `模板 ${name} 不应含 <target>`).not.toContain("<target")
    }
  })

  it("模板目录强制相对：配成绝对路径也要剥掉，否则 .svs import 会当成 npm 包 spec", async () => {
    const { renderHypitTemplateByName } = await loadTemplates({
      ...CONFIGURED,
      HYPIT_TEMPLATE_DIR: "/abs/templates",
    })
    const { markup } = renderHypitTemplateByName("generic-card", {})
    expect(markup).toContain('./abs/templates/generic-card/recipes.svs')
    expect(markup).not.toContain('"/abs/')
  })

  it("业务变量能替换进模板；多余变量忽略", async () => {
    const { renderHypitTemplateByName } = await loadTemplates(CONFIGURED)
    const { markup, targets } = renderHypitTemplateByName("generic-card", { unused: "x" })
    expect(markup).not.toMatch(/\{\{/)
    expect(targets).toEqual(["final-916.video", "final-169.video", "final-11.video"])
  })

  it("返回的文件名带 .svml 后缀——渲染服务据此判断源类型", async () => {
    const { renderHypitTemplateByName } = await loadTemplates(CONFIGURED)
    expect(renderHypitTemplateByName("generic-card", {}).filename).toBe("generic-card.svml")
  })
})

describe("Hypit Run Source 生成", () => {
  it("生成 .svrun：<author> 在首位且引用文件，随后是三个 <target>", async () => {
    const { buildHypitRunSource } = await loadTemplates(CONFIGURED)
    const { content, filename } = buildHypitRunSource({
      authorSource: "./tpl_ab12cd.svml",
      targets: ["final-916.video", "final-169.video", "final-11.video"],
    })
    expect(filename).toBe("inline.svrun")
    expect(content).toContain('<?svml using="@hypit/run-markup@1"?>')
    expect(content).toContain('<author source="./tpl_ab12cd.svml"/>')
    // <author> 必须是第一个子元素，顺序错了 run-markup 直接报 RUN_AUTHOR_ORDER
    expect(content.indexOf("<author")).toBeLessThan(content.indexOf("<target"))
    expect(content).toContain('<target output="final-916.video"/>')
    expect(content).toContain('<target output="final-169.video"/>')
    expect(content).toContain('<target output="final-11.video"/>')
  })

  it("没有 author 或没有 target 时 fail-closed——提交半个 Run Source 没有意义", async () => {
    const { buildHypitRunSource } = await loadTemplates(CONFIGURED)
    expect(() => buildHypitRunSource({ authorSource: "  ", targets: ["a.video"] })).toThrow()
    expect(() => buildHypitRunSource({ authorSource: "a.svml", targets: [] })).toThrow()
  })
})
