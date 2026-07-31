## 1. Data Model & Service Layer

- [x] 1.1 扩展 Prisma schema：`VideoStructure` 新增 `origin`、`sourceScriptsCount`、`sourceScriptText`、`userId`、`projectId` 字段；批量产出的文案落库到草稿箱并关联模板 ID
- [x] 1.2 实现 `lib/aim/script-structure-extractor.ts`：批量输入校验、LLM JSON-mode 提取、段落排序与通用化命名、单批超额自动分批
- [x] 1.3 实现 `lib/aim/script-structure-generator.ts`：知识库注入、数量参数 clamp、temperature 控制、JSON 解析与失败重试
- [x] 1.4 实现 `lib/aim/script-structure-store.ts`：模板 CRUD、用户 / 项目作用域过滤、生成记录持久化

## 2. API Integration

- [x] 2.1 `POST /api/aim/script-structures`：批量提取 + 保存结构模板，返回模板与分析详情
- [x] 2.2 `GET /api/aim/script-structures`：列出当前用户 / 项目的模板
- [x] 2.3 `GET /api/aim/script-structures/:id`：获取单个模板详情
- [x] 2.4 `DELETE /api/aim/script-structures/:id`：删除模板（仅 origin=extracted 且归属当前用户）
- [x] 2.5 `POST /api/aim/script-structures/:id/generate`：按模板批量生成文案，接受 count / topicTitle / projectId
- [x] 2.6 `POST /api/aim/script-structures/pipeline`：一键提取 + 生成

## 3. Frontend UX

- [x] 3.1 新增 `components/aim/batch-script-studio.tsx`：三 Tab（提取 / 生成 / 串联）弹窗
- [x] 3.2 内容台入口新增「批量文案工作室」技能按钮，触发弹窗
- [x] 3.3 提取 Tab：多行文本输入、提取结果可视化、错误状态、加载状态
- [x] 3.4 生成 Tab：模板列表单选、选题方向输入、数量控制、生成结果卡片
- [x] 3.5 串联 Tab：单次输入 + 数量 + 选题方向，同时展示提取结构与生成文案

## 4. End-to-End Validation

- [ ] 4.1 真实 LLM 调用验证：用 3-5 条真实爆款文案提取结构，确认段落识别合理
- [ ] 4.2 真实生成验证：用提取的模板 + 真实项目知识库生成 5 条文案，确认结构一致且表达差异化
- [ ] 4.3 一键串联验证：从对标输入到生成完成走通完整链路
- [ ] 4.4 边界验证：空输入、超大批量、无项目、模板不存在等错误路径

## 5. Spec-Driven Gaps (基于规格补全)

- [x] 5.1 补全「LLM 返回 malformed JSON 时重试一次再失败」的失败重试逻辑（提取 + 生成共用 `lib/aim/llm-json-retry.ts`）
- [x] 5.2 补全「oversized batch 显式拒绝」的输入校验（`MAX_BATCH_INPUT=10` + `BatchTooLargeError`，route 捕获返回 400）
- [x] 5.3 补全「生成文案持久化到草稿箱 + 关联模板 ID」的落库逻辑（`Script.structureId` 已存在，`saveGeneratedScripts` 已写入）
- [x] 5.4 补全单测：提取器 JSON 解析失败重试、生成器 count clamp、coerce 截断（`aim-script-structure-replication.test.ts` 14 用例全绿）
