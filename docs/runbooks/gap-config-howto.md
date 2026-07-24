# 缺口升级怎么配（白话版）

你不用记技术名词。下面分两块：**我已经帮你配好的本机**，以及**你要决定何时打开的正式自动**。

---

## 我已经帮你配好的（本机 `.env.local`）

这些在本地已写好，**安全默认**：

| 你要的能力 | 现在状态 | 含义 |
|---|---|---|
| 销售 Loop | 开着，但影子 | 会跑流程，**不真写飞书、不通知** |
| 先查再写 | 已开 | 定位/选题不够资料时会先查再写 |
| Skill 手册 | 已开 | 自动读 `docs/methodologies` |
| 群聊选题 | 开着，但影子 | 可入库处理，**先不回群** |
| 飞书群入口 | 关 | 等你绑定测试群再开 |
| 微信/企微入口 | 关 | 先别开 |

自检命令（在 `apps/web` 下）：

```bash
pnpm exec tsx scripts/print-gap-config-status.ts
```

---

## 四件能力分别怎么「正式用」

### 1）销售 Loop 正式自动（写飞书 + 人工审核）

**你已有：** 飞书经营事项表、负责人、试点项目 ID、Loop 总开关。

**还缺（建议补）：** 监督群 ID `AIM_SUPERVISOR_CHAT_ID`  
怎么拿：飞书群 → 把机器人拉进监督群 → 用调试/事件日志或开放平台拿到群 `chat_id`（形如 `oc_...`）。

确认试点跑通后，把本机或生产改成：

```env
AIM_LOOP_SHADOW_MODE=false
AIM_LOOP_OPERATING_MODE=supervised_auto
AIM_LOOP_NOTIFICATIONS_ENABLED=true
AIM_SUPERVISOR_CHAT_ID=oc_你的监督群
```

回退：改回 `AIM_LOOP_SHADOW_MODE=true`。

### 2）先查再写

本机已开。要关就设：

```env
AIM_BOUNDED_TOOL_LOOP_ENABLED=false
```

### 3）经验手册 Skill

本机已开。手册文件在：

- `docs/methodologies/ip-copywriting-methodology-core.md`
- `docs/methodologies/business-diagnosis-methodology-core.md`
- `docs/methodologies/event-storytelling-methodology-core.md`

改这些 Markdown 即改「岗位手册」。要关注入：

```env
AIM_SKILL_LOADING_ENABLED=false
```

### 4）群聊丢视频出选题

**本机当前：** 管道开 + 影子（不回群）+ 飞书群入口关。

正式上线顺序：

1. 账户设置里绑定测试群 + 项目（ChannelBinding）
2. 开飞书入口：`FEISHU_TOPIC_PIPELINE_ENABLED=true`
3. 先影子验收（现在就是）
4. 再：`INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE=evaluate`
5. 最后：`INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE=live` 且 `INSPIRATION_PIPELINE_SHADOW_MODE=false`

微信 / 企微：专项验收通过前保持 `false`（见 `docs/runbooks/group-video-topic-pipeline.md`）。

---

## 生产服务器怎么配

生产 **不是** 改本机 `.env.local`，而是改服务器上的环境变量（Compose / ECS env / 面板）。

把下面整段贴进生产环境（**先影子**，确认后再把销售 Loop / 群聊改成 live）：

```env
# 销售 Loop — 先影子
AIM_BUSINESS_LOOPS_ENABLED=true
AIM_LOOP_SHADOW_MODE=true
AIM_LOOP_OPERATING_MODE=assisted
AIM_LOOP_PILOT_PROJECT_IDS=（填你的试点项目ID）
AIM_LOOP_NOTIFICATIONS_ENABLED=false

# 先查再写 + Skill
AIM_BOUNDED_TOOL_LOOP_ENABLED=true
AIM_SKILL_LOADING_ENABLED=true

# 群聊选题 — 先影子
INSPIRATION_PIPELINE_ENABLED=true
INSPIRATION_PIPELINE_SHADOW_MODE=true
BACKGROUND_TASKS_ENABLED=true
FEISHU_TOPIC_PIPELINE_ENABLED=false
WORKBUDDY_WECHAT_ENABLED=false
WECOM_INSPIRATION_ENABLED=false
```

生产当前站点 `mingyuan-ai.cn` 的 `releaseSha` 还是旧提交时，**先合并本分支并部署**，再改上述开关，否则新开关代码不存在。

---

## 我可以继续替你做的两件事

1. **本机：** 已配好；你只要跑状态脚本看一眼。  
2. **生产：** 需要你明确说「可以改生产环境」——我才能动服务器 env / 部署；否则只给清单，避免误开正式自动。

回复其一即可：

- `只看本机` — 我帮你跑状态脚本解读  
- `可以改生产（先影子）` — 我按影子方案写生产 env  
- `销售 Loop 正式自动` — 在确认试点后，再帮你改 `SHADOW=false` + `supervised_auto`
