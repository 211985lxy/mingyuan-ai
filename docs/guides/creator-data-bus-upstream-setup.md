# 创作者数据总线：上游工具安装与飞书同步配置指引

> 面向对象：AIM 用户（或运营协助配置）· 更新：2026-09-03 · 配套方案：`docs/plans/2026-09-03-creator-metrics-feishu-data-bus-plan.md`
> 上游工具：[Xavier-168/data-scientist-community](https://github.com/Xavier-168/data-scientist-community)（第三方独立开源项目，v0.1.0-rc.2）

## 0. 使用前必读（免责与边界）

- 这是**第三方独立开源项目**，非 AIM 官方组件；AIM 只读取它同步到飞书多维表格的数据。
- 工具运行在**你自己的电脑**上，用**你自己的浏览器登录态**采集**你自己账号**的后台数据；账号 Cookie 不经过 AIM，也不经过该项目的服务器。
- 自动化访问创作者后台可能违反平台服务条款，存在被平台风控的可能；AIM 与上游均不承诺"不会被风控"。请自行评估。
- AIM 侧不集成其代码（AGPL 许可证边界见方案文档第 2 节）。

## 1. 系统要求

| 要求 | 说明 |
| --- | --- |
| 操作系统 | **仅 macOS 11+**（Apple Silicon 优先验证；Windows 暂不支持，可用 Excel 导入替代） |
| Python | 3.11+ |
| Node.js | >=22.12 且 <23 |
| Git | 必需 |
| 飞书 | 一个可创建"企业自建应用"的飞书账号/租户 |

## 2. 安装上游工具

当前为源码仓库发布（无签名 DMG）。以下命令摘自上游 README（v0.1.0-rc.2，**尚未实测**，P0 时回填实测结果）：

```bash
git clone https://github.com/Xavier-168/data-scientist-community.git
cd data-scientist-community

# 确认 Python 标准库完整（上游实测 3.12）
python3 -c "import ssl, sqlite3, xml.parsers.expat"
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
npm ci
npx playwright install chromium
chmod +x start.sh scripts/*.sh
./start.sh
```

- 启动后本地仪表盘为 `http://127.0.0.1:8811`（仅本机）。
- **首次采集必须由账号本人在可见浏览器窗口扫码/登录**；Cookie/Profile 保存在 `~/Library/Application Support/数据科学家 Community/`，不进源码目录、不上传。
- 工具每 6 小时做一次保守登录态检查（状态检查，非 Cookie 自动刷新）。
- 若 `python3 -m venv` 报 `dlopen`/`pyexpat`/`ensurepip` 错误，说明系统 Python 标准库损坏，先重装完整 Python（推荐 3.12）。

## 3. 配置飞书同步

工具通过飞书开放平台（OpenAPI）把数据写入你自己的多维表格，**表会自动创建**，无需手动建表。

1. 在[飞书开放平台](https://open.feishu.cn/)创建一个**企业自建应用**，开通**多维表格（bitable）**读写权限。
2. 拿到应用的 `App ID` 与 `App Secret`，填入上游工具的飞书同步配置（本地仪表盘内或 CLI 配置，以 README 为准）。
3. 首次同步时，工具会自动创建一个多维表格（base），内含 5 张数据表：

| 数据表 | 内容 |
| --- | --- |
| 平台明细V2 | 每个平台每条作品的当前指标（播放/点赞/评论/分享/收藏/涨粉/完播率等） |
| 作品总表V2 | 跨平台聚合后的作品总指标 |
| 作品增量表 | 相对上一快照的播放/互动增量、日均增量 |
| 作品图表表 | 日期 × 平台的指标矩阵 |
| 同步日志V2 | 每次同步的批次记录（AIM 用它判断数据新鲜度） |

4. 执行一次同步，打开生成的多维表格，确认 `平台明细V2` 有你作品的真实数据。
5. **把该多维表格共享给 AIM 的飞书机器人账号**（可阅读权限即可）——AIM 通过飞书开放接口读取，无共享则读不到。
6. 记下该多维表格的 `app_token`（表格 URL 中 `base/` 后面那段）。

## 4. 在 AIM 侧启用（P1 上线后）

服务端已支持三个环境变量（部署配置中设置）：

- `LARK_CREATOR_METRICS_BASE_TOKEN`：第 6 步的表格 app_token
- `LARK_CREATOR_METRICS_DETAIL_TABLE_ID`：`平台明细V2` 表 ID
- `LARK_CREATOR_METRICS_SYNC_LOG_TABLE_ID`：`同步日志V2` 表 ID（可选，用于标注数据新鲜度）

配置后：周度复盘接口会自动附带 `platformMetrics`（四平台作品指标 + 数据截止时间）；打开 `/api/aim/creator-metrics?start=…&end=…` 可单独查询。未配置时复盘照旧走人工回填，前端后续版本会提供配置引导入口。

## 5. 常见问题

- **我是 Windows 怎么办？** 上游暂不支持；先用工具导出的 Excel 走 AIM 手动导入（方案 B），或等上游 Windows 支持。
- **多久同步一次？** 你自己在工具里触发/定时；AIM 打开复盘页时读取最新数据（15 分钟缓存），不会主动拉取平台。
- **停用后 AIM 会怎样？** 复盘回退人工回填；已同步数据仍留在你自己的飞书表格里。
- **不想用了，数据在哪删？** 多维表格在你自己的飞书租户内，删除该 base 即可；上游工具数据在本机用户目录。
