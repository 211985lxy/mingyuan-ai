# 缺口升级启用手册（销售 Loop / 先查再写 / Skill / 群聊选题）

> 分支能力：`feat/aim-gap-phase-a`  
> 原则：默认安全（影子 / 关 ToolLoop）；生产用环境变量显式打开。

## 1. 销售 Loop 正式自动（supervised_auto）

```env
AIM_BUSINESS_LOOPS_ENABLED=true
AIM_LOOP_SHADOW_MODE=false
AIM_LOOP_OPERATING_MODE=supervised_auto
AIM_LOOP_PILOT_PROJECT_IDS=proj_xxx
AIM_LOOP_NOTIFICATIONS_ENABLED=true
AIM_SUPERVISOR_CHAT_ID=oc_xxx
AIM_WORK_ITEM_OWNER_USER_ID=user_xxx
LARK_BASE_TOKEN=...
LARK_WORK_ITEM_TABLE_ID=...
```

效果：

- Cron `GET /api/cron/feishu-work-items/dispatch` 对试点项目写飞书（非 ShadowStore）
- 仍进「待人工审核」，**不会**自动对客户发消息
- 响应字段：`mode=supervised_auto`、`liveWrite=true`

回退：设 `AIM_LOOP_SHADOW_MODE=true`（或关掉 `AIM_BUSINESS_LOOPS_ENABLED`）。

## 2. 「先查再写」BoundedToolLoop

```env
AIM_BOUNDED_TOOL_LOOP_ENABLED=true
```

自动开启路径：

- `business_diagnosis` + `positioning_topic`（销售/定位补证）
- `content_producer` + `new_copy` / `positioning_topic`（选题核验）

也可在请求里显式传 `executionMode: "bounded_tool_loop"`（须在白名单内）。

回退：`AIM_BOUNDED_TOOL_LOOP_ENABLED=false`（默认）。

## 3. 经验沉淀成手册（Skill）

默认开启，从 `docs/methodologies/*.md` 按智能体注入上下文。

```env
AIM_SKILL_LOADING_ENABLED=true   # 默认；设 false 关闭
```

失败轨迹候选：`buildEvalCandidateFromRunSummary` 只产候选，**不自动写入** eval fixtures。

记忆审核：`PATCH /api/aim/memories/[id]`，body `{ "action": "approve" | "reject" }`；新记忆默认 `candidate`，批准后才进生产召回。确定性评估：`pnpm --dir apps/web run eval:memory`。

运维演练清单：`docs/runbooks/ops-lifecycle-drills.md`。

## 4. 群聊丢视频出选题

管道代码已在；生产分三档：

```env
INSPIRATION_PIPELINE_ENABLED=true
BACKGROUND_TASKS_ENABLED=true
CRON_SECRET=...
# 先影子
INSPIRATION_PIPELINE_SHADOW_MODE=true
# 验收后
INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE=evaluate
# 正式回群
INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE=live
INSPIRATION_PIPELINE_SHADOW_MODE=false
```

就绪检查：`assessInspirationPipelineReadiness()`（单测覆盖）。

## 5. 建议开启顺序

1. 评估门禁（已在本分支）  
2. 销售 Loop：shadow → supervised_auto（试点项目）  
3. ToolLoop 开关  
4. Inspiration：shadow → evaluate → live  
5. Skill 保持默认开；观察 context 长度后再调预算
