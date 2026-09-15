# 明远AIM 设计系统落地指南

> 本文档记录 `BRANDING-GUIDELINES.md`（同目录）在代码中的**实际落地情况**与用法约定。
> 规范描述「应该长什么样」，本文描述「代码里怎么写」，两者冲突时以本文的代码约定为准。
>
> 最后更新：2026-09-15

---

## 一、设计 token（`apps/web/src/app/globals.css`）

所有视觉值必须走 token，禁止在组件里硬编码颜色/阴影。

| 类别 | Token | 用途 |
| --- | --- | --- |
| 基础色 | `--background` `--foreground` `--card` `--primary` `--secondary` `--muted` `--border` | 明暗两套，`BRANDING-GUIDELINES.md` 二.1/二.2 对应值 |
| 阴影层级 | `--shadow-soft` `--shadow-card` `--shadow-float` | 静态小元素 / 卡片 / 浮层。暖褐调，非纯黑 |
| 品牌渐变 | `--gradient-primary` `--gradient-gold` | 朱砂赤主按钮 / 厚土金辅按钮 |
| 悬浮描边 | `--ring-gold` | 可交互卡片 hover 时描边转淡金泥 |

Tailwind 用法：`shadow-card`、`shadow-float`、`text-primary`、`bg-card` 等，均已由 `@theme inline` 映射。

---

## 二、语义色板（重要）

**背景**：控制台有 300+ 处使用 Tailwind 固定色阶（`bg-amber-50 text-amber-700` 等）做评级/分类标记。这些色阶是「浅底深字」，在深色界面上会成为刺眼白块。

**解法**：Tailwind v4 的色阶工具类引用 `var(--color-*)`，因此在 `.dark` 作用域内重定义这 96 个色阶即可全局生效，**无需改动任何组件**。实现见 `globals.css` 的「语义色板校准」段。

**约定**：
- 新增语义标记**继续用 Tailwind 色阶**（不要另造色板），暗色会自动适配
- `gray`/`slate` 已压到极低彩度并偏暖褐（68），与品牌暖底协调
- **营销页（`components/marketing/`、`features/marketing/`）不在校准范围内**——它有独立的浅色隔离主题（`.marketing-page`），不要往里加暗色假设

---

## 三、组件能力（`components/ui/`）

### 变体与属性

| 组件 | 能力 | 说明 |
| --- | --- | --- |
| `Button` | `variant="default"` | 朱砂渐变 + 柔光阴影 + hover 上浮（规范 四.1） |
| `Button` | `variant="gold"` | 厚土金渐变辅按钮 |
| `Button` | `variant="outline"` | hover 描边转淡金泥 |
| `Card` | `interactive` | 可点击卡片：悬浮上浮 + 描边转金 |
| `Badge` | `variant="gold"` | 金石印章（规范 三.4） |
| `Badge` | `variant="bamboo"` | 竹简标签（规范 三.5） |
| `Skeleton` | — | 已接 `.dao-shimmer` 水墨流光 |

### 结构化骨架（`components/ui/skeletons.tsx`）

加载态**优先用骨架屏而非文字**，且形状必须贴合真实内容：

- `ListSkeleton` — 行式列表。`variant="card"`（真实行是卡片，如成片任务）/ `variant="plain"`（轻量边框行，如配音历史）
- `CardGridSkeleton` — 卡片网格
- `TableSkeleton` — 表格
- `DetailSkeleton` — 详情页（标题 + 段落 + 大块）

> 踩坑记录：`variant` 用错会让加载态比真实内容更重（出现「卡片套卡片」）。新增骨架前先看真实行的形态。

### 空态（`components/ui/empty-state.tsx`）

`EmptyState` 三要素：图标给情绪 + 一句人话说明为什么空 + 一个明确的下一步动作。

存量页面有 41 个文件各写各的空态，新代码统一走该组件，存量逐步收敛。

### 确认对话框（`components/ui/confirm-dialog.tsx`）

**禁止使用 `window.confirm`**（样式随浏览器变化、无法定制、与品牌割裂）。

```tsx
const confirm = useConfirm()
if (!(await confirm({ title: "删除这条素材？", confirmText: "删除", destructive: true }))) return
```

无 `ConfirmProvider` 时自动降级为原生 confirm（不崩溃、也不静默通过）。`ConfirmProvider` 已挂在 `app/layout.tsx`。

### 无障碍辅助（`src/lib/a11y.ts`）

非交互元素需要可点击语义时，**不要手写 role/tabIndex/onKeyDown 四件套**：

```tsx
<div {...clickableProps(handler)}>…</div>   // 仅在 handler 存在时生效
```

> 只有 `role="button"` 而没有键盘响应是**假合规**——读屏会念「按钮」但按下去没反应。

### 路由兜底（`components/layout/route-states.tsx`）

`RouteErrorState` / `RouteNotFoundState` 供各段 `error.tsx`、`not-found.tsx` 复用。已在 `(dashboard)`、`(studio)`、全局挂载。

---

## 四、布局约定

- 主容器留白：`p-6 md:p-8`（`(dashboard)/layout.tsx`、`StudioShell` 统一口径）
- header 内边距与内容对齐：`px-6 md:px-8`
- 全屏页面若需抵消外层 padding，负边距必须同步：见 `app/(dashboard)/aim/page.tsx` 的 `-mx-6 -my-6 md:-mx-8 md:-my-8`
- 宽表格必须包 `overflow-x-auto`，否则窄屏会撑破整页

---

## 五、规范落地状态

| 规范条目 | 状态 |
| --- | --- |
| 二、核心配色（OKLCH 明暗两套） | ✅ 已落地 |
| 三.1 水墨流光 `.dao-shimmer` | ✅ 已用于骨架屏 |
| 三.2 薪火呼吸晕圈 `.fire-pulse-ring` | ✅ 已定义（按需使用） |
| 三.3 玉石浮印 `.jade-emboss` | ✅ 已定义 |
| 三.4 金石印章 `.badge-gold` | ✅ 已接入 `Badge variant="gold"` |
| 三.5 竹简标签 `.bamboo-scene-tag` | ✅ 已接入 `Badge variant="bamboo"` |
| 四.1 按钮（朱砂渐变 + hover 位移 + 柔光） | ✅ 已落地 |
| 四.2 卡片悬浮（阴影升级 + 描边转金） | ✅ 已落地（`Card interactive`） |
| 四.2 毛玻璃 | ⚠️ **仅用于浮层**（Dialog/Sheet），静态卡片保持实色——全站卡片加 `backdrop-filter` 会显著拖慢滚动 |
| 五.1 衬线排版 | ⚠️ 仅营销页；控制台保留无衬线（密集信息场景可读性优先） |
| 五.2 `【画面】/【旁白】` 徽记化 | ❌ 未落地 |

---

## 六、验证要求

改动 UI 后至少跑：

```bash
pnpm typecheck && pnpm typecheck:tests && pnpm lint && pnpm arch:size
pnpm test           # 主套件（node 环境）
pnpm test:component # 组件套件（jsdom）—— 改组件/导航/表单必跑
```

> 踩坑记录：只跑 `pnpm test` 会漏掉组件测试。曾因此让一个导航测试失效两个阶段未被发现。
>
> `pnpm test:e2e` 需要独立的 `TEST_DATABASE_URL` 测试库，本地默认不可运行。
