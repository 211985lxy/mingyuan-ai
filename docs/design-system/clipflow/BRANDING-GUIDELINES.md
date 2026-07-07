# 明远AIM / 明远先生 品牌与 UI 设计规范

> 设计主旨：暖玉玄黄 (土德温润，厚重包容) & 玄曜赤金 (火德明动，尊贵热烈)

本手册记录 明远AIM 与明远先生系列自媒体/社交媒体平台统一的品牌配色标准与 UI 规范，供后续项目与开发执行使用。

## 一、品牌标志与核心意象

明动 AIM 采用中式“火土德”交融的图腾标志作为全局核心视觉资产。

### 1. Logo 图腾构成与视觉寓意

- **朱砂阳火环 (`#D14A33`)**：上方环绕的朱砂红圆环和跳跃的火种路径，代表“火德”，寓意“明动、热烈、充满传播生命力”的 AI 自媒体内容属性。
- **厚土金字塔印 (`#B88C33`)**：下方稳固的三维山峰形印章路径，代表“土德”，寓意“稳重、包容、大道无形”的企业营销资产沉淀与底座。
- **太极咬合**：火与土两条视觉线索在此处完美交汇，构成一个现代抽象的中式太极合印，传递“生生不息、商业持续增长”的深邃远见。

### 2. 标志矢量 SVG 规范（无字侧边栏图标版本）

```xml
<svg viewBox="0 0 400 280" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="200" cy="150" r="100" fill="none" stroke="#D14A33" stroke-width="20"/>
  <path d="M200 70 C180 90, 170 110, 180 130 C170 140, 175 155, 190 165 C195 160, 205 160, 210 165 C225 155, 230 140, 220 130 C230 110, 220 90, 200 70 L230 100 L250 80 L240 110 Z" fill="#D14A33"/>
  <path d="M225 150 C235 160, 240 170, 235 180 L215 165 Z" fill="#D14A33"/>
  <path d="M130 250 L200 120 L270 250 L230 250 L200 190 L170 250 Z" fill="#B88C33"/>
</svg>
```

---

## 二、核心配色系统

本系统采用现代的 **OKLCH 色彩空间** 进行精确的视觉亮度和色度控制，并提供标准 **HEX 十六进制** 与 **RGB** 映射，用于不同前端框架的适配。

### 1. 浅色模式：暖玉玄黄

| 角色 | 变量名 | OKLCH 参数 | HEX | 视觉释义与应用场景 |
| :--- | :--- | :--- | :--- | :--- |
| **主色 (Primary)** | `--color-primary` | `oklch(0.575 0.205 28.0)` | `#D14A33` | 朱砂红：主按钮、强调文本、重要激活态。 |
| **主背景 (Background)** | `--color-background` | `oklch(0.982 0.012 76.0)` | `#FAF8F3` | 极浅暖沙米白：页面大背景。 |
| **卡片背景 (Card)** | `--color-card` | `oklch(0.995 0.005 76.0)` | `#FEFDFB` | 羊脂白玉：容器、对话框、白底卡片。 |
| **主要文字 (Foreground)** | `--color-foreground` | `oklch(0.24 0.035 68.0)` | `#25211D` | 玄石褐黑：正文标题与高亮字。 |
| **次要文字 (Regular)** | `--color-text-regular`| `oklch(0.38 0.08 68.0)` | `#5F5A52` | 古铜玄黄：副标题、说明文字、二级信息。 |
| **辅助色 (Secondary)** | `--color-secondary` | `oklch(0.945 0.025 76.0)` | `#F6EEDA` | 暖润沙黄：次级卡片背景、浅色标签或提示底色。 |
| **边框 (Border)** | `--color-border` | `oklch(0.915 0.018 76.0)` | `#EFE7DC` | 温润玉线：极淡暖黄色边界。 |
| **灰度辅助 (Muted)** | `--color-muted-text` | `oklch(0.54 0.03 68.0)` | `#8A8175` | 岩灰：表单占位符、小字备注、辅助提示。 |

### 2. 深色模式：玄曜赤金

| 角色 | 变量名 | OKLCH 参数 | HEX | 视觉释义与应用场景 |
| :--- | :--- | :--- | :--- | :--- |
| **主色 (Primary)** | `--color-primary` | `oklch(0.745 0.185 38.0)` | `#B88C33` | 纯阳赤金：主交互、按钮悬浮、金泥高亮。 |
| **主背景 (Background)** | `--color-background` | `oklch(0.145 0.02 65.0)` | `#1A1816` | 玄天墨曜黑：暗黑大背景。 |
| **卡片背景 (Card)** | `--color-card` | `oklch(0.18 0.025 65.0)` | `#25211D` | 玄墨古岩：暗色卡片、弹出窗底座。 |
| **主要文字 (Foreground)** | `--color-foreground` | `oklch(0.955 0.01 76.0)` | `#F5F3EF` | 羊脂白玉：温润反差文本。 |
| **次要色 (Secondary)** | `--color-secondary` | `oklch(0.23 0.03 65.0)` | `#2E2B27` | 深玄古铜：次级板块边框、深色标签底座。 |

---

## 三、东方意境 UI 特效类

### 1. 东方水墨宣纸流光晕染 (`.dao-shimmer`)

- 视觉寓意：如同水墨滴在宣纸上，随光线漫反射泛出微弱的金光。
- 使用场景：骨架屏加载、重要操作完成后的卡片流光、活动宣传卡片。

```scss
.dao-shimmer {
  position: relative;
  overflow: hidden;
}
.dao-shimmer::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent,
    rgba(212, 168, 68, 0.08) 20%,
    rgba(209, 74, 51, 0.05) 60%,
    transparent
  );
  animation: dao-shimmer-anim 3s infinite ease-in-out;
}

@keyframes dao-shimmer-anim {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
```

### 2. 薪火跳动呼吸晕圈 (`.fire-pulse-ring`)

- 视觉寓意：象征点点火种，有生命力地呼入呼出，带有朱砂赤的温暖能量。
- 使用场景：进行中的任务进度条周圈、新账号扫码等待、重要待办呼吸提示。

```scss
.fire-pulse-ring {
  animation: fire-pulse-glow 2s ease-in-out infinite;
}
@keyframes fire-pulse-glow {
  0%, 100% {
    box-shadow: 0 0 12px rgba(209, 74, 51, 0.15), 0 0 24px rgba(209, 74, 51, 0.08);
  }
  50% {
    box-shadow: 0 0 20px rgba(209, 74, 51, 0.25), 0 0 40px rgba(184, 140, 51, 0.12);
  }
}
```

### 3. 玉石浮印质感 (`.jade-emboss`)

- 视觉寓意：天然玉石刻成的印章和雕件，手指抚摸过会有温润、饱满的浮雕感。
- 使用场景：功能卡片、模块入口的悬浮反馈。

```scss
.jade-emboss {
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease;
}
.jade-emboss:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 16px rgba(209, 74, 51, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
}
.jade-emboss:active {
  transform: scale(0.98);
}
```

### 4. 金石印章与印记效果 (`.badge-gold`)

- 使用场景：高亮 Tag、小徽章、专业认定标识。
- 实现：金泥与朱砂微渐变的边框与柔和底色。

```scss
.badge-gold {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  border: 1px solid rgba(209, 74, 51, 0.25);
  background: linear-gradient(135deg, rgba(209, 74, 51, 0.12), rgba(184, 140, 51, 0.12));
  color: #3c2f1e;
}
```

### 5. 竹简画面标签 (`.bamboo-scene-tag`)

- 使用场景：列表项前垂直指示条、文章/选题分类前缀。
- 样式：左侧厚实古铜玄黄边线与米色填充，模拟竹简刻字的高雅质感。

```scss
.bamboo-scene-tag {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.75rem;
  border-radius: 0.75rem;
  background: #F6EEDA;
  border: 1px solid #D5C5A8;
  color: #5F5A52;
  box-shadow: inset 0 0 0 1px rgba(184, 140, 51, 0.1);
}
```

---

## 四、UI 核心交互规范

### 1. 按钮设计

- **朱砂赤主按钮 (`el-button--primary` / `btn-primary`)**：
  - 背景采用朱砂红渐变，Hover 时触发轻微 `translateY(-2px)` 上位移。
  - 增加朱砂赤柔光阴影。
  - 统一圆角半径：`10px` 或更圆润。
- **厚土金辅按钮 (`el-button--success` / `btn-secondary`)**：
  - 背景采用土金渐变，Hover 时触发金土发光阴影。

### 2. 卡片与弹窗

- 使用现代毛玻璃背景填充：`rgba(255, 255, 255, 0.75)`。
- 搭配微弱 `backdrop-filter: blur(16px)` 与超淡浅米色描边。
- 悬浮时，平滑由 `--shadow-base` 渐变为 `--shadow-md`，描边颜色转换为淡金泥。

---

## 五、中式排版与文案标记规范

### 1. 衬线排版与宽阔间距

- 字体系列：
  `font-family: 'Noto Serif SC', 'Songti SC', 'STSong', serif;`
- 字距：`letter-spacing: 0.1em` 到 `0.15em`。
- 行高：`line-height: 1.8` 到 `2.2`。
- 正文阅读色：
  - Light 模式：`#2C2B2A`
  - Dark 模式：`#F3EDE2`

### 2. 括号标记徽记化

对于文案中出现的提示词（如 `【画面】`、`【旁白】`、`【动作】` 等），应通过正则拆分并自动套用对应徽章样式。

#### `【画面】` 标记

- 样式：使用 `.bamboo-scene-tag`，高亮左侧玄黄边线。

```html
<span class="inline-block mx-1 px-2.5 py-0.5 rounded-xs text-xs font-serif font-bold bamboo-scene-tag shadow-[1px_1px_3px_rgba(197,160,89,0.12)]">【画面】</span>
```

#### `【旁白】` 标记

- 样式：使用 `.gold-ink-narration`，搭配古铜描边。

```html
<span class="inline-block mx-1 px-2.5 py-0.5 rounded-xs text-xs font-serif font-bold gold-ink-narration shadow-[1px_1px_3px_rgba(197,160,89,0.15)] border border-amber-700/20">【旁白】</span>
```

#### 其他自定义括号标记

- 样式：使用 `.badge-gold`，背景呈现朱砂赤-赤金微渐变，边缘金石落泥。

```html
<span class="inline-block mx-1 px-2.5 py-0.5 rounded-xs text-xs font-serif font-bold badge-gold border border-primary/30">【标记内容】</span>
```
```}{