# AIM × 飞书「丝滑连接」升级计划（对标豆包企业内搜索）

> 日期：2026-09-10
> 状态：待评审（未开工）
> 范围：mingyuan 主仓（apps/web）
> 依据：2026-09-10 代码实证（所有论断附文件路径）+ 本机 lark-cli 真实链路演示（以用户身份搜"爆款选题"命中 66 条 → 读取《爆款选题定义与自查表》成功）
> 对标样本：豆包电脑版「豆包 工作」的企业内搜索技能——用户授权一次后，对话中实时检索飞书并引用作答

---

## 0. 背景与勘察结论

### 豆包体验的本质 = 三机制

1. **连接器**：授权一次，长期可用，无需每次登录；
2. **身份随人走**：以用户身份（user_access_token）检索，看到的恰好是用户有权限看的内容——不越权、不需预先同步；
3. **Agent 自主工具调用**：模型判断问题需要查飞书时自己调工具，链路对用户透明，所以"发一句话它就直接知道"。

### AIM 现状对照（已逐项核实）

| 机制 | 豆包 | AIM 现状 | 差距 |
|---|---|---|---|
| 工具调用 | 模型自主调"企业内搜索" | `tool-registry.ts:19-92` 共 8 个工具，无任何飞书检索工具 | **自主 Tool Loop 查不了飞书** |
| 网关能力 | 官方内置 | `lark-cli-runner.ts:64-108` 已白名单 `docs +search/+fetch`，`:138` 支持 `--as user/bot` | 能力在，但仅 Base 导入导出接线 |
| 身份 | 用户身份随行 | 服务端仅 tenant/bot（`feishu-topic-chat.ts`）；user_access_token 只存在于开发机 lark-cli | **产品未承接用户身份——丝滑的关键缺口** |
| 引用体验 | 标注"内容来自你的飞书"+ 文档卡片 | 卡片体系已有（`feishu-agent-card.ts`），但对话回答不挂来源 | 缺引用回链 |

### 两条早期判断的修正（诚实登记）

1. ~~"网关白名单未开 search/fetch"~~ 不成立：白名单已含（`lark-cli-runner.ts:75-80`）。真实缺口在 Agent 工具层与生产部署形态。
2. ~~"LLM function-calling 已接飞书"~~ 需限定：`import_lark_topics` 等走 `aim-tool-actions.ts` 的工具动作路径（用户点击触发），不在 harness 自主 Tool Loop 内。

### 生产部署事实

`scripts/deploy-ecs-standalone.sh` 无 lark-cli 安装步骤，生产 ECS（mingyuan-ai.cn，systemd `mingyuan-web`）上不存在 lark-cli 及其用户授权状态。

---

## 1. 总体设计

三个工作包递进：**WP-1 工具层**（bot 身份 MVP，应用可见范围）→ **WP-2 用户身份承接**（丝滑关键）→ **WP-3 引用体验与治理**。

顺序理由：WP-1 完全复用现有 registry/token 模式，当天可用；WP-2 是体验跃迁但涉及凭证管理，必须独立验收；WP-3 依赖前两者产出。

### 关键架构决策：直连 OpenAPI，不走 lark-cli 网关

新检索能力用 `@larksuiteoapi/node-sdk` / HTTP 直连飞书开放平台，理由：

- 生产未装 lark-cli（见 §0），在服务器维护 CLI 二进制 + 用户授权状态文件运维重、不可审计；
- token 的获取/缓存/刷新本就必须在服务端，`feishu-topic-chat.ts` 的 tenant token 模式可复用；
- SDK 已是现有依赖（`apps/web/package.json`）。

lark-cli 网关保留给本地开发与 Base 导入导出，本计划不动它。

---

## 2. WP-1：飞书知识检索进入 Agent Tool Loop（MVP）

### 目标

用户在 AIM 对话中问"爆款选题是什么"这类问题时，模型可自主调用 `feishu_knowledge_search` → `feishu_doc_read`，从飞书（应用可见范围）检索并引用作答，全程无需用户手动操作。

### 改动清单

| 文件 | 改动 |
|---|---|
| `src/lib/integrations/feishu-knowledge-client.ts`（新增） | 统一搜索（search v2）+ docx 正文读取（raw_content）+ wiki token → obj_token 解析；复用 `feishu-topic-chat.ts` 的 tenant token 获取与缓存模式 |
| `src/lib/aim-harness/tool-registry.ts` | 注册 `feishu_knowledge_search` / `feishu_doc_read`：permission `"external"`、`allowInToolLoop: true`、timeoutMs 15s、idempotent true |
| `src/lib/aim-harness/tool-loop-tools.ts` | 两个工具的执行器：入参校验、结果裁剪（标题 + 摘要 + URL，正文按需截断）、失败显式结构化错误（零假数据） |
| `apps/web/src/env.ts` | 新增 `FEISHU_KNOWLEDGE_ENABLED`（默认 off 灰度）+ 检索范围配置（wiki space id 白名单） |
| `apps/web/__tests__/unit/` | client 单测（token 缓存 / 错误分类 / wiki 解析，注入替身）+ 工具注册与拒绝路径单测 |

### 首日联调核实项（禁止臆测，查不到就降级）

- search v2 对 tenant 身份的真实可用性。若仅支持用户身份 → WP-1 降级为「wiki 空间节点遍历 + docx 读取」（范围限于授权空间，但真实可用），统一搜索留给 WP-2。
- 所需 scope 名称以飞书开发者后台实际提示为准，不写死假设值。

### 不做

- 不做用户身份（WP-2）；
- 不改 lark-cli 网关与其白名单；
- 不建索引/缓存层（WP-3 评估）；
- 不动 6 个 bot 应用的既有事件链路。

### 验收

- 代码层：typecheck / 相关单测 / `arch:size` / 生产构建全绿；新文件 ≤400 行；
- 集成层（为准）：以生产同构自建应用，在授权 wiki 空间放一篇真实方法论文档 → 对话提问命中并正确引用；无权限 / 空间为空 / 接口失败三类失败路径返回可行动错误；
- 灰度开关关闭时零行为变化（回归现有对话链路）。

---

## 3. WP-2：用户身份承接（丝滑的关键）

豆包"恰好能看到你能看的文档"的本质就是 user_access_token。分两片：

### WP-2a 运营者身份（先做：小、可逆、当下够用）

- OAuth 授权码流程拿 user_access_token + refresh_token；
- 凭证加密落库：Prisma 新 model（refresh_token 加密存储，密钥走环境变量，不入代码/日志/快照，对齐 AGENTS.md §8）；
- 检索身份切换：有运营者凭证 → user 身份（覆盖个人云空间 + 统一搜索 v2）；无 → 回退 WP-1 的 bot 范围；
- scope 最小化：仅检索与文档只读（以开发者后台提示为准），禁止一把梭全量 scope。

### WP-2b 多用户 OAuth（后置，产品确认后单独立项）

- 每用户授权、按用户隔离检索权限；涉及登录体系打通（现状 `api/auth` 无 feishu），不在本计划内。

### 验收

- token 刷新 / 过期 / 用户撤销三条路径真实演练，撤销后自动回退 bot 身份；
- 检索结果与该身份在飞书客户端肉眼可见范围一致（抽 3 篇权限边界文档核对：私有 / 共享 / 无权限）；
- 审计验证：全链路日志 grep 无 token 明文。

---

## 4. WP-3：引用体验与治理

- 回答附来源卡片（复用 `feishu-agent-card.ts` 模式）：文档标题 + 链接 + "内容来自你的飞书"标注，与豆包对齐；
- 检索审计落库：谁 / 何时 / 查了什么 / 引用了哪篇（对齐 §8 数据安全）;
- 可选：高频知识库增量索引——先在 WP-1/2 加使用率观测，有数据后再决定，防止过早优化。

---

## 5. 交付门闩与节奏

- 每个 WP 独立分支 + 独立验收，一个 WP 一个线程（AGENTS.md §6）；WP-1 可先行，WP-2 依赖 WP-1 的 client，WP-3 依赖 WP-2；
- 门闩：`pnpm --filter web typecheck` → 相关 `test:unit` → `arch:size` → `build` → 真实联调 → 部署后 healthz 冒烟（以 `releaseSha` 为准）；
- 估时：WP-1 约 1 天 / WP-2a 约 1–2 天 / WP-3 约 1 天 / WP-2b 待评估。

## 6. 风险与回滚

| 风险 | 缓解 |
|---|---|
| search v2 对 tenant 身份不可用 | WP-1 首日核实；不可用则降级 wiki 遍历，统一搜索随 WP-2 解锁 |
| 用户 token 泄露面 | 加密存储 + 最小 scope + 审计；撤销即回退 bot 身份 |
| 检索质量弱（纯关键词） | WP-3 用观测数据决定是否上语义索引，不在 MVP 过度设计 |
| 回滚 | 开关默认 off，各 WP 均为增量注册，revert 单个 WP 即回原状 |

## 7. 移交项

- WP-2b 多用户 OAuth：待产品决策（何时多租户、登录体系方案）；
- im / mail / minutes / calendar 等更广域接入（本机 lark skills 已覆盖能力面）：超出本计划，按真实业务需求另行立项。
