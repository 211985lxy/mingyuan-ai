# 三比例模板契约（v2，已实测落地）

**目的**：把「模板要长什么样、AIM 怎么提交」定死。内容（文案/配色/素材）由业务侧给，
结构必须是下面这套，否则 AIM 侧拿不到三比例产物。

> v2 相对草稿的变化：**方案 A 已落地并真机验证**（2026-09-16）。
> 之前「素材怎么进工作区」是待决项，现在有确定答案；同时推翻了三条曾经以为可行的路，
> 都记在文末，避免重复踩。

## 一、为什么必须按约定命名

`hypit inspect` 是 CLI 输出的透传，产物清单里**没有宽高字段**——服务端无法
告诉你哪条是竖版。所以：

> **三比例的 `render:Video` 的 id 必须带比例标记。**

AIM 侧 `lib/hypit-ratio.ts` 的 `inferHypitAspectRatio()` 按产物名分派，认得这些写法：

| 写法 | 比例 |
| --- | --- |
| `916` / `9x16` / `9-16` / `9_16` | 9:16 |
| `vertical` / `portrait` | 9:16 |
| `169` / `16x9` / `16-9` / `16_9` | 16:9 |
| `horizontal` / `landscape` / `wide` | 16:9 |
| `11` / `1x1` / `1-1` | 1:1 |
| `square` | 1:1 |

认不出来 → `aspectRatio: null`，AIM 按渲染顺序取第一条当主产物。**不猜。**

边界：数字两侧必须是非数字，`take-1916` 不会被误判成 9:16。

## 二、源是**两个**文件：Author Source + Run Source

`hypit build` **只能**吃 Run Source（`<?svml using="@hypit/run-markup@1"?>`）。
而一次 API 调用只写一个文件，所以模板提交固定两步（见第三节）。

### 2.1 Author Source（`.svml`，AIM 侧持有模板文本）

- **不能出现 `<target>`** —— 那是 Run Source 的元素，写进去会报
  `MARKUP_UNKNOWN_SURFACE: No imported module declares <target>`。
- 三个 Canvas + 三个 Film + 三个 `render:Video`，一次渲染出三条片子。
- 素材与 recipes 用**相对**路径 `./templates/<name>/…`（从工作区根出发，原因见 2.3）。

```svml
<?svml using="@hypit/markup@1"?>
<svml>
  <import as="recipes" source="./templates/generic-card/recipes.svs"/>
  <!-- 三个画布 -->
  <space:Canvas id="canvas-916" width="1080" height="1920"/>
  <space:Canvas id="canvas-169" width="1920" height="1080"/>
  <space:Canvas id="canvas-11"  width="1080" height="1080"/>
  <!-- 三个合成（共用同一份文案与素材） -->
  <film:Film id="film-916" canvas={canvas-916} appearance={recipes.film.vertical}>   … </film:Film>
  <film:Film id="film-169" canvas={canvas-169} appearance={recipes.film.horizontal}> … </film:Film>
  <film:Film id="film-11"  canvas={canvas-11}  appearance={recipes.film.square}>     … </film:Film>
  <!-- 三个产物：id 必须带比例标记 -->
  <render:Video id="final-916" composition={film-916.composition} timeline={program.timeline}/>
  <render:Video id="final-169" composition={film-169.composition} timeline={program.timeline}/>
  <render:Video id="final-11"  composition={film-11.composition}  timeline={program.timeline}/>
</svml>
```

三套 Film 的内容要同步改（文案变三处）。更好的做法是在 `recipes` 里定义一次、
三处引用——模板定稿时按这个思路写，别复制三遍。

### 2.2 Run Source（`.svrun`，AIM 侧运行时生成）

`<author>` 必须**第一个**出现且只能引用文件；`<target>` 至少一个。

```svml
<?svml using="@hypit/run-markup@1"?>
<svrun version="1">
  <author source="./tpl_ab12cd.svml"/>
  <target output="final-916.video"/>
  <target output="final-169.video"/>
  <target output="final-11.video"/>
</svrun>
```

### 2.3 素材路径为什么是相对、以及基准在哪

内联提交的源落在**工作区根**（不是模板目录）。所以模板里的素材/recipes 必须写成
从工作区根出发的相对路径 `./templates/<name>/…`。

**绝对路径不行**：`.svs` 的 `<import source=...>` 只接受相对路径或 npm 包名，
绝对路径会被当成 npm 包 spec，报
`… must be one npm package Source export`。

同一套相对路径在本地与生产都成立，无需按环境切换：

| 环境 | 工作区根 | 模板实际位置 |
| --- | --- | --- |
| 生产容器 | `/opt/hypit`（`HYPIT_CWD`，`HYPIT_WORKSPACE` 未设） | `/opt/hypit/templates/<name>/`（Dockerfile 烤入） |
| 本地 | `services/hypit-renderer`（`.env` 的 `HYPIT_WORKSPACE`） | `services/hypit-renderer/templates/<name>/` |

> ⚠️ 因此 Dockerfile 里模板**必须**拷到 `/opt/hypit/templates`，拷到 `/app/templates`
> 会让所有模板提交找不到素材。

## 三、提交契约：两步（方案 A 落地）

```
1) POST /api/v1/checks  { content: 渲染后的 Author Source, filename: "<name>.svml" }
   → 200 { sourceKind: "author", ok: true, source: "tpl_ab12cd.svml", … }
   副作用：把源落盘到工作区，并校验它。
2) POST /api/v1/builds  { content: 上面生成的 .svrun, filename: "inline.svrun" }
   → 201/202 { jobId, buildId }
```

第 1 步走 `check`（只校验不执行）是有意的：**顺带校验**。变量渲染出的 markup
若有毛病，在这里就以 `MARKUP_*` 失败，不会浪费一次真正的渲染。两个文件落在同一
工作区目录，所以 `.svrun` 里用 `./<文件名>` 引用即可。

AIM 侧实现：`lib/hypit-templates.ts`（渲染 + 生成 svrun）、
`lib/hypit.ts#uploadHypitSource`（第 1 步）、
`lib/hypit-submit.ts#submitHypitVideo`（编排，三种来源互斥）。

**已验证**：一次提交产出三个真实 MP4（`final-916` 132KB / `final-169` 126KB /
`final-11` 96KB，`ftyp` 头校验通过）。复现脚本
`services/hypit-renderer/scripts/prove-template-flow.py`。

## 四、变量

引擎没有变量机制，变量在 AIM 侧替换（`lib/hypit-template.ts`）：

- `{{title}}` — 默认按 XML 转义（`&` `<` `>` `"` `'`）
- `{{raw:body}}` — 不转义，调用方自负
- `{{template_dir}}` — **内部变量**，由 `HYPIT_TEMPLATE_DIR`（默认 `templates`）
  拼出 `./templates/<name>`，调用方不用传
- 缺值 → **提交失败**（`MISSING_VARIABLE`），绝不留 `{{title}}` 进片子

`hypitVariables` 只接受字符串/数字；对象与数组会被丢弃（否则会被 `String()`
渲成 `[object Object]` 悄悄进片）。

## 五、素材：方案 A 已落地

模板与素材随镜像/工作区预置，AIM 只传变量。路径规则见 2.3，Dockerfile 里
`COPY templates /opt/hypit/templates`。

确实需要「每次不同素材」时，再评估 B（渲染服务加 `POST /api/v1/assets`，
需配套 SSRF 白名单）——当前未实现。

## 六、已经证伪的三条路（别再试）

| 做法 | 结果 |
| --- | --- |
| 直接 `build` 一个 `.svml`（哪怕写了 `<target>`） | `build requires a self-described Run Source`。`build/plan/pricing` 强制要求 Run Frontend（见 `packages/cli/src/main.ts`） |
| `.svrun` 内联 `<author><svml>…</svml></author>` | `<author> must be empty`，只接受 `<author source="文件"/>`（`packages/run-markup/src/syntax.ts`） |
| 把 recipes 内联成 markup 里的 `<sheet>` | markup 不接受 `<sheet>`，整个源解析失败，同样表现为「不是 self-described」 |

## 七、待确认（给业务侧）

1. 模板三份的内容：中汝达供暖 / 芳姐 IP / 通用卡片 —— 各自文案与配色。
   当前的 `generic-card` 是**占位模板**（卡片图 + 背景音，无文字层），只用来证明链路。
2. 要不要配音？配音走 AIM 既有 `voiceSource:"own_voice"`（Fish Audio），
   **Hypit 只管画面**；音频作为素材进 SVML 的 audio-track。
3. 每条片子的时长与分镜数。
