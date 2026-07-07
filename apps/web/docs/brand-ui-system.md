# 明动 AIM 品牌 UI 设计系统

> 东方五行（火土）玄学美学 · 双主题 · oklch 色彩空间
> 亮色「暖玉玄黄」· 暗色「玄曜赤金」

源文件：[`src/app/globals.css`](../src/app/globals.css) · 组件库：shadcn/ui（style: `base-nova`）· 图标：lucide

---

## 1. 品牌定位

| 维度 | 设定 |
|---|---|
| 美学根基 | 东方五行（火生土）+ 道家玄学意象 |
| 主色属性 | **火**（朱砂红）+ **土**（玄黄 / 琥珀 / 古铜）；暗色提炼出**金**（纯阳赤金） |
| 气质关键词 | 厚重、温润、典雅、尊贵、克制有冲击力 |
| 视觉隐喻 | 玉石、宣纸、水墨、金石印章、太极、薪火、竹简 |
| 色彩空间 | **oklch**（感知均匀，亮暗主题切换时视觉一致） |

设计哲学：**火土相生**——朱砂红（火）主行动与尊贵，玄黄琥珀（土）主承载与温润；金（暗色）为火之精炼，象征极致与成就。

---

## 2. 色彩系统

### 亮色主题「暖玉玄黄」— 土德厚重，温润典雅

| Token | oklch | 色名 | 用途 |
|---|---|---|---|
| `--background` | `oklch(0.982 0.012 76)` | 极浅暖沙米白 | 页面底色 |
| `--foreground` | `oklch(0.24 0.035 68)` | 玄石褐黑 | 正文 |
| `--card` | `oklch(0.995 0.005 76)` | 羊脂温润白 | 卡片底 |
| `--popover` | `oklch(0.995 0.005 76)` | 羊脂温润白 | 弹层底 |
| **`--primary`** | **`oklch(0.575 0.205 28)`** | **尊贵朱砂红（火）** | 主按钮 / 强调 / 链接 |
| `--primary-foreground` | `oklch(0.985 0.008 76)` | 暖白 | 主色上的文字 |
| `--secondary` | `oklch(0.945 0.025 76)` | 暖润沙黄（土） | 次级容器 |
| `--secondary-foreground` | `oklch(0.38 0.08 68)` | 古铜玄黄 | 次级容器文字 |
| `--muted` | `oklch(0.955 0.015 76)` | 浅沙灰 | 弱化容器 |
| `--muted-foreground` | `oklch(0.54 0.03 68)` | 暖灰褐 | 辅助文字 |
| `--accent` | `oklch(0.935 0.03 76)` | 沙岩黄 | 悬停 / 强调底 |
| `--destructive` | `oklch(0.58 0.23 25)` | 熔岩红 | 危险 / 删除 |
| `--border` | `oklch(0.915 0.018 76)` | 温润玉线 | 分割线 / 边框 |
| `--ring` | `oklch(0.575 0.205 28)` | 朱砂红 | 聚焦环 |

### 暗色主题「玄曜赤金」— 大道无形，尊享极致

| Token | oklch | 色名 | 用途 |
|---|---|---|---|
| `--background` | `oklch(0.145 0.02 65)` | 玄天墨曜黑 | 页面底色（极高贵） |
| `--foreground` | `oklch(0.955 0.01 76)` | 羊脂白玉 | 正文 |
| `--card` | `oklch(0.18 0.025 65)` | 玄墨古岩 | 卡片底 |
| **`--primary`** | **`oklch(0.745 0.185 38)`** | **尊享纯阳赤金（金）** | 主按钮 / 强调 |
| `--secondary` | `oklch(0.23 0.03 65)` | 深玄古铜 | 次级容器 |
| `--muted-foreground` | `oklch(0.68 0.025 76)` | 暖玉灰 | 辅助文字 |
| `--border` | `oklch(1 0 0 / 12%)` | 半透明白线 | 分割线 |

> 主色在亮色是「朱砂红」（火），暗色升华为「纯阳赤金」（火之精炼）——同一品牌身份在两种语境下的进阶表达。

### 图表配色（火土系，亮暗共用）

| Token | oklch | 色名 |
|---|---|---|
| `--chart-1` | `oklch(0.575 0.205 28)` | 朱砂红 |
| `--chart-2` | `oklch(0.68 0.16 48)` | 琥珀橙 |
| `--chart-3` | `oklch(0.78 0.17 76)` | 黄金土 |
| `--chart-4` | `oklch(0.48 0.10 60)` | 铜褐色 |
| `--chart-5` | `oklch(0.60 0.15 32)` | 熔岩红 |

### 五行色映射速查

- **火** → 朱砂红 `oklch(0.575 0.205 28)`（亮 primary）/ 熔岩红
- **土** → 玄黄琥珀 `oklch(0.945 0.025 76)` / 古铜 `oklch(0.38 0.08 68)`
- **金** → 纯阳赤金 `oklch(0.745 0.185 38)`（暗 primary）/ 亮金 `oklch(0.85 0.16 85)`
- **玄（水）** → 墨曜黑 `oklch(0.145 0.02 65)`（暗 bg）

---

## 3. 字体系统

```css
--font-sans: "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, system-ui, sans-serif;
--font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
```

- **中文**：苹方 / 微软雅黑优先（系统字体，零加载成本，CJK 渲染清晰）
- **英文 / 数字**：Helvetica Neue / Arial
- **等宽**：代码、数据读数

**中文排版增强**（marketing 页）：
```css
line-height: 1.75;
letter-spacing: 0.02em;
```

---

## 4. 圆角与间距

基础 `--radius: 0.75rem`（12px），其余按比例派生：

| Token | 值 | Tailwind | 典型用途 |
|---|---|---|---|
| `--radius-sm` | `0.45rem` | `rounded-sm` | 小标签、角标 |
| `--radius-md` | `0.6rem` | `rounded-md` | 按钮、输入框 |
| `--radius-lg` | `0.75rem` | `rounded-lg` | 卡片 |
| `--radius-xl` | `1.05rem` | `rounded-xl` | 大卡片 |
| `--radius-2xl` | `1.35rem` | `rounded-2xl` | 容器、面板 |
| `--radius-3xl` | `1.65rem` | `rounded-3xl` | Hero 区 |
| `--radius-4xl` | `1.95rem` | `rounded-4xl` | 特殊大圆角 |

间距沿用 Tailwind 默认 4px 基准尺度。

---

## 5. 组件库

- **shadcn/ui**，style `base-nova`，`cssVariables: true`
- **图标**：lucide-react
- **路径别名**：`@/components/ui`（组件）、`@/lib/utils`（cn 等工具）
- 所有组件通过 CSS 变量取色，**自动适配亮暗主题与品牌色**，无需硬编码颜色。

---

## 6. 品牌质感与动效（核心特色）

这套 utility 类是明动 AIM 区别于通用 SaaS 的视觉语言，全部已在 `globals.css` 实现，直接加 className 即用。

### 质感类

| 类名 | 意象 | 用途 |
|---|---|---|
| `.jade-emboss` | 玉石浮印 | 卡片/按钮 hover——放大 1.02 + 朱砂柔影，按下缩 0.98 |
| `.badge-gold` | 金石印章 | 徽章/勋章——赤金渐变描边，亮暗自适应 |
| `.seal-icon` | 印章篆刻 | 小图标容器——朱砂底 + 朱砂色图标 |
| `.bamboo-scene-tag` | 竹简画面标签 | 场景标签——左侧朱砂竖线 + 沙黄底 |
| `.gold-ink-narration` | 金泥旁白 | 强调正文——古铜/赤金加粗 |
| `.ink-wash-mask` | 水墨晕染宣纸 | 加载/遮罩——半透模糊层 |

### 渐变背景

| 类名 | 意象 | 渐变 |
|---|---|---|
| `.bg-fire-earth-gradient` | 火土流光 | 朱砂红 → 纯阳赤金（135°） |
| `.bg-dawn-mountain` | 天道拂晓 / 山河日出 | 朱砂 → 赤金 → 琥珀 → 暖金（4 段） |
| `.bg-lava-waveform` | 红莲熔岩声波 | 朱砂 → 琥珀 → 赤金（向上） |

### 动效类

| 类名 | 意象 | 动效 |
|---|---|---|
| `.dao-shimmer` | 水墨宣纸流光 | 横向流光扫过（3s 循环） |
| `.tai-chi-rotate` | 乾坤太极微光 | 旋转（12s 线性循环） |
| `.fire-pulse-ring` | 薪火跳动呼吸 | box-shadow 呼吸晕圈（2s），暗色用赤金 |
| `.seal-stamp-anim` | 金石落印 | scale 1.3→0.95→1 弹性落定（0.4s） |
| `.gold-champion-badge` | 赤金榜首微光 | 金色文字流光闪烁（3s） |
| `.gold-flow-progress` | 纯阳赤金流光 | 进度条流光（2s） |

### 使用示例

```tsx
// 主行动按钮（玉石浮印 hover）
<Button className="jade-emboss">立即生成</Button>

// 强调数字 / 榜首
<span className="gold-champion-badge font-bold text-2xl">No.1</span>

// Hero 区背景（山河日出）
<section className="bg-dawn-mountain text-white">...</section>

// 成功落定动画
<div className="seal-stamp-anim">✓ 已保存</div>

// 加载遮罩
<div className="ink-wash-mask">正在生成...</div>

// 强调正文
<p>这条数据 <span className="gold-ink-narration">增长 320%</span>。</p>
```

---

## 7. 响应式与无障碍

- **移动优先**：`html { overflow-x: hidden }`、`overscroll-behavior-y: contain`（禁下拉刷新）
- **暗色模式**：`.dark` 类切换，所有 token 自动适配
- **动效降级**：`@media (prefers-reduced-motion: reduce)` 关闭 marketing 滚动动画
- **滚动驱动动画**：marketing 区用 `animation-timeline: view()`，不支持的环境自动 fallback

---

## 8. 新增页面 / 组件时的守则

1. **绝不硬编码颜色**——一律用 `bg-primary` / `text-foreground` / `border-border` 等 token 类。
2. **强调色只用一个**——主色 `primary`（朱砂红/赤金），避免多色争抢。
3. **质感优先用现成 utility**——卡片 hover 用 `jade-emboss`，不要自己写阴影。
4. **亮暗双测**——新增样式必须同时检查 `:root` 与 `.dark`。
5. **中文排版**：正文 `leading-relaxed`，长文区可加 `tracking-wide`。
6. **圆角层级**：按钮 `rounded-md`、卡片 `rounded-lg/xl`、大容器 `rounded-2xl`，不要混用随意值。

---

## 附：品牌色快速取用（复制即用）

```css
/* 朱砂红（火·主色） */
--cinnabar: oklch(0.575 0.205 28);
/* 纯阳赤金（金·暗色主色） */
--pure-gold: oklch(0.745 0.185 38);
/* 暖沙黄（土） */
--sand-yellow: oklch(0.945 0.025 76);
/* 古铜玄黄 */
--bronze: oklch(0.38 0.08 68);
/* 玄天墨曜黑 */
--obsidian: oklch(0.145 0.02 65);
/* 亮金（点缀） */
--bright-gold: oklch(0.85 0.16 85);
```
