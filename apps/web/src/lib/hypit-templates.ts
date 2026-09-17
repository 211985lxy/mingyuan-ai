/**
 * Hypit 模板注册表（AIM 侧持有业务模板源文本）。
 *
 * 为什么模板在 AIM 而不在渲染服务：模板是**产品内容**（文案/配色/分镜），
 * 渲染服务只是通用引擎。AIM 按名字取出模板，用 `hypitVariables` 渲染 `{{var}}`
 * 后提交，渲染服务只管出片。
 *
 * ── 提交形态（2026-09-16 实测，改本文件前必读）──────────────────────────
 * `hypit build` **只能**吃 Run Source，而一次 API 调用只能写一个文件，所以模板
 * 提交固定是两步：
 *
 *   1. `POST /api/v1/checks`（`content` = 渲染后的 Author Source `.svml`）
 *      —— `check` 是「只校验不执行」，但它同样会把源落盘到工作区，并在响应里
 *      回 `source` 文件名。借它完成「上传 + 提交前校验」：变量写错在此就失败，
 *      不会浪费一次真正的渲染。
 *   2. `POST /api/v1/builds`（`content` = 本文件生成的 `.svrun`）
 *      —— `<author source="./<上一步的文件名>"/>` + 每个比例一个 `<target>`。
 *      两个文件落在同一个工作区目录，所以相对引用能解析。
 *
 * 已被证伪的三条路（别再试）：
 *   · 直接 build 一个 `.svml`：CLI 报 `build requires a self-described Run Source`
 *     —— `build/plan/pricing` 强制要求 Run Frontend（见 packages/cli/src/main.ts），
 *     markup 里就算写了 `<target>` 也没用。
 *   · `.svrun` 内联 `<author><svml>…</svml></author>`：`<author>` 必须为空，
 *     只接受 `<author source="文件"/>`（packages/run-markup/src/syntax.ts）。
 *   · 把 recipes 内联成 markup 里的 `<sheet>`：markup 不接受 `<sheet>`，
 *     会让整个源解析失败。
 *
 * Author Source 里**不能出现 `<target>`**——那是 Run Source 的元素，写进去会报
 * `MARKUP_UNKNOWN_SURFACE: No imported module declares <target>`。
 *
 * ── 路径为什么是相对的 ──────────────────────────────────────────────────
 * 内联源落到**工作区根**（不是模板目录），所以模板里的素材/recipes 必须写成
 * 从工作区根出发的相对路径 `./templates/<name>/…`。绝对路径会让 `.svs` 的
 * import 被当成 npm 包 spec 而失败。
 * 生产（工作区 /opt/hypit，模板烤在 /opt/hypit/templates）与本地
 * （工作区 = 服务根）用同一套相对路径即可，无需按环境切换。
 *
 * ── 三比例 ──────────────────────────────────────────────────────────────
 * 一份 Author Source 产出三个 `render:Video`，由 `.svrun` 的三个 `<target>` 指定；
 * id 带比例标记（`final-916` / `final-169` / `final-11`），AIM 侧
 * `lib/hypit-ratio.ts` 的 `inferHypitAspectRatio()` 据此分派。
 *
 * 变量契约见 `lib/hypit-template.ts`：缺值 fail-closed，绝不把 `{{var}}` 留进片子。
 */

import { env } from "@/env"
import { HypitTemplateError, renderHypitTemplate } from "./hypit-template"
import { HypitError } from "./hypit"

/**
 * 模板素材目录（相对工作区根）。
 *
 * 强制相对：`.svs` import 不接受绝对路径。配置里若写了 `/abs/path` 或 `./x`，
 * 统一剥成 `x`，避免配错就把整条链路打断。
 */
const TEMPLATE_DIR = (env.HYPIT_TEMPLATE_DIR ?? "templates")
  .trim()
  .replace(/^\/+/, "")
  .replace(/^\.\//, "")
  .replace(/\/+$/, "") || "templates"

export type HypitTemplateDef = {
  /**
   * Author Source（`.svml`）文本，含 `{{var}}` 占位符。
   * **不能含 `<target>`**——那是 Run Source 的元素。
   * 素材/recipes 用 `{{template_dir}}` 拼相对路径。
   */
  markup: string
  /** 要导出的产物名，顺序即交付顺序；名字须带比例标记。 */
  targets: string[]
}

/**
 * 通用卡片模板（方案 A：预置素材 + 换文案变量）。
 *
 * 三套 Canvas / Film / render:Video 共用同一张卡片与背景音，只换画布尺寸。
 * 可见标题**烤进卡片设计图**（方案 A：素材随模板预置、只换图），不在 markup 里叠
 * 文字层——Hypit 没有「静态叠字」图元，叠字要么走 AI 字幕（不可控、依赖模型）
 * 要么烤进图。卡片图通过 `{{card_image}}` 变量换：业务把带标题的设计稿预置在
 * `templates/<name>/assets/` 下，提交时传该变量即可；不传用默认占位图。
 * 文案（中汝达供暖 / 芳姐 IP / 通用卡片）由业务侧给，与图一起预置。
 */
const GENERIC_CARD_MARKUP = `<?svml using="@hypit/markup@1"?>
<svml>
  <import as="asset" from="@hypit/media@1"/>
  <import as="space" from="@hypit/spatial@1"/>
  <import as="time" from="@hypit/timeline-author@1"/>
  <import as="pipeline" from="@hypit/media-pipeline@1"/>
  <import as="media-track" from="@hypit/media-track@1"/>
  <import as="audio-track" from="@hypit/audio-track@1"/>
  <import as="film" from="@hypit/film@1"/>
  <import as="render" from="@hypit/render-hyperframes@1"/>
  <import as="recipes" source="{{template_dir}}/recipes.svs"/>

  <space:Canvas id="canvas-916" width="1080" height="1920"/>
  <space:Canvas id="canvas-169" width="1920" height="1080"/>
  <space:Canvas id="canvas-11"  width="1080" height="1080"/>

  <time:Clock id="clock" frame-rate="30"/>
  <time:Timeline id="program" clock={clock} end="6s"/>

  <space:Frame id="frame-916" within={canvas-916} left="0%" top="0%" right="100%" bottom="100%"/>
  <space:Frame id="frame-169" within={canvas-169} left="0%" top="0%" right="100%" bottom="100%"/>
  <space:Frame id="frame-11"  within={canvas-11}  left="0%" top="0%" right="100%" bottom="100%"/>
  <space:Extent id="extent-916" width="1080" height="1080"/>
  <space:Extent id="extent-169" width="1080" height="1080"/>
  <space:Extent id="extent-11"  width="1080" height="1080"/>

  <asset:Image id="card-image" src="{{card_image}}"/>
  <asset:Audio id="bed-audio" src="{{template_dir}}/assets/ranking-move.wav"/>
  <pipeline:Normalize id="bed-media" source={bed-audio}
    video="none" audio="default" span-authority="audio" clock={clock}/>

  <media-track:Track id="cards-916" timeline={program.timeline} canvas={canvas-916}>
    <media-track:Item id="card-916" image={card-image} extent={extent-916} during="program"
      frame={frame-916} appearance={recipes.media.card}/>
  </media-track:Track>
  <media-track:Track id="cards-169" timeline={program.timeline} canvas={canvas-169}>
    <media-track:Item id="card-169" image={card-image} extent={extent-169} during="program"
      frame={frame-169} appearance={recipes.media.card}/>
  </media-track:Track>
  <media-track:Track id="cards-11" timeline={program.timeline} canvas={canvas-11}>
    <media-track:Item id="card-11" image={card-image} extent={extent-11} during="program"
      frame={frame-11} appearance={recipes.media.card}/>
  </media-track:Track>

  <audio-track:Track id="bed" timeline={program.timeline}>
    <audio-track:Item source={bed-media.media} during="program"
      playback="once-start" gain="0.4"/>
  </audio-track:Track>

  <film:Film id="film-916" canvas={canvas-916} timeline={program.timeline}
    appearance={recipes.film.vertical}>
    <film:Track source={cards-916.visual}/>
    <film:Track source={bed.audio}/>
  </film:Film>
  <film:Film id="film-169" canvas={canvas-169} timeline={program.timeline}
    appearance={recipes.film.horizontal}>
    <film:Track source={cards-169.visual}/>
    <film:Track source={bed.audio}/>
  </film:Film>
  <film:Film id="film-11" canvas={canvas-11} timeline={program.timeline}
    appearance={recipes.film.square}>
    <film:Track source={cards-11.visual}/>
    <film:Track source={bed.audio}/>
  </film:Film>

  <render:Video id="final-916" composition={film-916.composition} timeline={program.timeline}/>
  <render:Video id="final-169" composition={film-169.composition} timeline={program.timeline}/>
  <render:Video id="final-11"  composition={film-11.composition}  timeline={program.timeline}/>
</svml>`

export const HYPIT_TEMPLATES: Record<string, HypitTemplateDef> = {
  "generic-card": {
    markup: GENERIC_CARD_MARKUP,
    targets: ["final-916.video", "final-169.video", "final-11.video"],
  },
}

export function listHypitTemplateNames(): string[] {
  return Object.keys(HYPIT_TEMPLATES)
}

/**
 * 按名字取出模板，用变量渲染成可提交的 Author Source。
 *
 * `template_dir` 由模板目录决定，调用方无需关心；业务变量叠加其上。
 *
 * @throws {HypitError} 模板名未知 → `HYPIT_UNKNOWN_TEMPLATE`
 * @throws {HypitTemplateError} 变量缺值 → `MISSING_VARIABLE`
 */
export function renderHypitTemplateByName(
  name: string,
  variables: Record<string, string | number | undefined | null>,
): { markup: string; targets: string[]; filename: string } {
  const def = HYPIT_TEMPLATES[name]
  if (!def) {
    throw new HypitError(
      "HYPIT_UNKNOWN_TEMPLATE",
      `未知的 Hypit 模板：${name}（可用：${listHypitTemplateNames().join("、") || "无"}）`,
    )
  }
  const merged: Record<string, string | number | undefined | null> = {
    template_dir: `./${TEMPLATE_DIR}/${name}`,
    // 卡片图可换：业务把带标题文字的设计稿预置在 `templates/<name>/assets/` 下，
    // 提交时传 `card_image` 指向它即可（例如 `./templates/generic-card/assets/zhongruda.jpg`）。
    // 不传则用默认占位图，保证链路始终可渲染。
    card_image: `./${TEMPLATE_DIR}/${name}/assets/card.jpg`,
    ...variables,
  }
  const markup = renderHypitTemplate({ template: def.markup, variables: merged })
  return { markup, targets: [...def.targets], filename: `${name}.svml` }
}

/**
 * 生成 Run Source（`.svrun`）文本。
 *
 * `<author>` 必须是**第一个**子元素且只能引用文件；`<target>` 至少有一个。
 * 这里是模板提交的第二步：把上一步落盘的 Author Source 文件名指进来。
 */
export function buildHypitRunSource(input: {
  /** Author Source 文件名（与 `.svrun` 同一目录，故用 `./name` 引用）。 */
  authorSource: string
  targets: string[]
}): { content: string; filename: string } {
  const author = input.authorSource.trim().replace(/^\.\//, "")
  if (!author) {
    throw new HypitError("HYPIT_INVALID_INPUT", "缺少 Author Source 文件名，无法生成 Run Source")
  }
  if (input.targets.length === 0) {
    throw new HypitError("HYPIT_INVALID_INPUT", "模板未声明任何 <target>，无法生成 Run Source")
  }
  const targets = input.targets
    .map((name) => `  <target output="${escapeXmlAttribute(name)}"/>`)
    .join("\n")
  const content = `<?svml using="@hypit/run-markup@1"?>
<svrun version="1">
  <author source="./${escapeXmlAttribute(author)}"/>
${targets}
</svrun>
`
  return { content, filename: "inline.svrun" }
}

/** 属性值转义：产物名理论上可控，但模板是产品内容，转义成本远低于出事故。 */
function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

export { HypitTemplateError }
