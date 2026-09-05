# 复盘数据导入与报告补强实施计划（岗位卡数据复盘官缺口）

> 状态：P1a/P1b/P1c 已实现（2026-09-05，含单测）；UI 入口与 P2 截图识别待后续批次 · 日期：2026-09-05
> 上游：《明动AIM-经营归因闭环升级计划-2026-09-03》第五节；《明动AIM-IP智能体岗位卡-2026-09-03》第五章
> 红线：零假数据——解析不出的字段不写入（空值≠0）；未配置的集成显式报错，不返回模拟成功；7/14/30 累计快照不相加。

## 交付记录（2026-09-05）

| 项 | 落点 | 测试 |
| --- | --- | --- |
| P1a 表格导入 API | `api/aim/outcome-import/route.ts`（薄壳）+ `lib/aim/outcome-import-service.ts`（解析→门闩→upsert）；复用 `parseDocument`（xlsx 受限子进程 / csv 进程内） | `aim-outcome-import-route.test.ts` 6 例 |
| P1b HTML 复盘报告 | `api/aim/history/[id]/retro-report/route.ts` + `lib/aim/retro-report-html.ts`（纯渲染）+ `lib/aim/retro-report-data.ts`（数据装配） | `aim-retro-report-html.test.ts` 7 例 + `aim-retro-report-route.test.ts` 3 例 |
| P1c 飞书写出复盘记录 | `lib/lark-base/outcome-export.ts` + `lark-base/index.ts` 增 `resultType: "outcome"`（表 `LARK_OUTCOME_TABLE_ID`，未配置显式报错；行级唯一键=outcome.id）；export 路由白名单放行 | `lark-outcome-export.test.ts` 4 例 |
| env 样例 | `.env.example` 增 `LARK_OUTCOME_TABLE_ID` | — |

门闩：typecheck ✅ · 单测 3108 全过 ✅ · arch:size 基线内 ✅。
第二批（同日）：UI 入口已接线——复盘对话框 retro 模式「上传平台导出表格」（`workflow-record-dialog.tsx` OutcomeImportRow + `use-aim-workflow-records.ts` `saveOutcomeImport/uploadOutcomeFile` + `lib/api/outcome-import.ts` 客户端）；交付卡片入口行新增「查看报告」（`aim-deliverable-bubble.tsx` 直链 `/api/aim/history/[id]/retro-report` 新标签打开）。测试 +4 例（dialogs/records）。
待后续批次：P2 截图识别仍暂缓。


## 0. 勘察结论（2026-09-05）

对照岗位卡「数据复盘官」输入规格，四项缺口代码实况：

| 岗位卡要求 | 实况 | 判定 |
| --- | --- | --- |
| 表格导入（Excel/CSV 文件） | 仅「粘贴纯文本解析」（`platform-analytics-parse.ts` + `run-analytics-paste-send.ts`），无文件上传通道 | ❌ 缺 |
| HTML 复盘报告（展示层） | 只有 markdown 对话产出 + docx 导出（`api/aim/export-office`），无 HTML 渲染 | ❌ 缺 |
| 复盘记录同步飞书多维表格（写出） | `api/lark-base/export` 仅支持 topic/script/positioning/moments_copy；飞书方向当前只读（creator-metrics） | ❌ 缺 |
| 截图识别回填 | 全库无 OCR/视觉识别代码 | ❌ 缺（本计划暂缓） |

可复用资产：`parseDocument`（xlsx 受限子进程解析，`document-parser.ts`）、`enforceUploadSizeLimit`、`prepareAnalyticsIngest` / `parsePlatformAnalyticsText`（解析→门闩→upsert 管线）、`upsertContentOutcome`、`ContentOutcome` 三组字段模型、WP-D 的 `attribution-insights.ts` 聚合。

## 1. P1a Excel/CSV 文件上传导入

**目标**：用户在复盘时上传平台导出的 `.xlsx/.csv` 文件 → 文本化 → 复用既有解析管线 → upsert `ContentOutcome`。与粘贴路径最终转成同一种结构化记录（岗位卡格式原则）。

**改动清单**

| 文件 | 改动 |
| --- | --- |
| `apps/web/src/app/api/aim/outcome-import/route.ts` | 新增 POST（multipart）：auth → `generationId` 归属校验 → `enforceUploadSizeLimit` → `parseDocument` 文本化 → `prepareAnalyticsIngest` → `upsertContentOutcome`；解析失败/未识别字段如实返回 summary 与 missingHints，不写库 |
| `apps/web/src/components/aim/workflow-record-dialog.tsx` | retro 模式增「上传表格」入口（后续批次，先 API 可用） |

**不做**：不做截图上传（走 P2）；不为解析失败的文件猜测归属内容；不自动发起复盘对话（与粘贴路径对齐的触发留 UI 批次）。

**验收**：xlsx/csv 样例文件导入后 Outcome 字段与等价粘贴文本一致；空文件/无法识别/跨用户 generationId 分别返回明确错误；未识别字段不出现在 upsert body。

## 2. P1b HTML 复盘报告（展示层）

**目标**：岗位卡输出 2——由结构化数据自动渲染 HTML 复盘报告（数据真源 = ContentOutcome + OutcomeAttribution + retroSnapshots），浏览器可直接打开预览、可存档。

**改动清单**

| 文件 | 改动 |
| --- | --- |
| `apps/web/src/lib/aim/retro-report-html.ts` | 纯函数渲染器：输入 generation 元信息 + 三窗口 outcomes + 线索归因 + retroSnapshots，输出完整 HTML 字符串；全字段 HTML 转义；缺失数据显式「未回填」，不画 0 |
| `apps/web/src/app/api/aim/history/[id]/retro-report/route.ts` | 新增 GET：auth → 归属校验 → 加载 → `text/html` 响应 |

**不做**：不做图表（v1 表格呈现，图表待真实数据样本后加）；不落库存 HTML（每次实时渲染，版本随数据走）；不替代 docx 导出。

**验收**：已复盘内容输出含三窗口数据、归因、结论的报告；未回填字段显示「未回填」而非 0；跨用户 404；HTML 注入样例（标题含 `<script>`）被转义。

## 3. P1c 复盘记录写出飞书多维表格

**目标**：补齐岗位卡「存数据库 + 同步飞书表格」的写出侧。

**改动清单**：`api/lark-base/export` 增 `resultType: "outcome"`；表配置读 `LARK_OUTCOME_TABLE_ID`（新 env，未配置时返回明确错误「未配置复盘记录飞书表」，不落到通用结果表、不伪造成功）。字段映射：作品标题/平台/窗口/三组数字/verdict。

**验收**：未配置 env 时显式 503 文案；配置后单条 outcome 记录写入成功；重复导出不产生脏数据（按唯一键覆盖写）。

## 4. P2 截图识别回填（本计划暂缓，另立项）

依赖视觉模型调用成本与「识别后必须人工确认」的交互设计；待 P1a/P1b 在试点客户跑通、确认手填+表格导入仍不够用后再立项。暂缓期间用户可用「截图 + 粘贴数字」走既有粘贴管线。

## 5. 交付门闩

`pnpm --filter web typecheck` → `pnpm --filter web test:unit`（新增用例 + 既有 analytics/workflow 用例回归）。新文件遵守 arch:size（≤500 行，目标 100–300）。
