# 内容模板蓝图约定（V2）

## 目的

后台内容模板不再维护为“行业脚本示例集合”，而是维护为“通用表达蓝图 + brief 字段定义”。
前台 `/create` 会先让用户选择表达模板，再填写本次 brief，后端再把表达蓝图、IP 档案和热点上下文组装成候选文案。

这一层的核心原则：

- 模板定义表达逻辑，不定义行业身份
- 行业身份只存在于 `IP` 层
- brief 只承载这一条视频的具体事实
- 模板要稳定复用，而不是为单一行业写死一段口播稿

## 模板字段约定

- `scriptTemplate`
  模板蓝图文本。保留变量占位符，例如 `{{painPoint}}`、`{{offer}}`、`{{proof}}`。
- `variables`
  该模板要求前台收集的 brief 字段定义，至少包含：
  - `key`
  - `label`
  - `placeholder`
  - `required`
  - `type`
- `hookType`
  标识开场打法，例如 `pain`、`audience`、`effect`。
- `argumentPattern`
  表达逻辑类型，例如 `problem_solution`、`testimonial`、`listicle`、`comparison`。
- `evidenceMode`
  证据强度与偏好，例如 `light`、`medium`、`strong`。
- `ctaStyle`
  收束动作，例如 `consult`、`save`、`buy`、`follow`。
- `hotTopicModes`
  允许怎样借热点，例如 `bridge_angle`、`timely_offer`、`reactive_commentary`。
- `industry`
  如果保留，只允许做后台分析、检索或辅助过滤，不能再作为 `/create` 第二阶段的主分类轴。
- `hotTopicKeywords`
  可与热点匹配的关键词。
- `seasonalEvents`
  季节性或活动型模板的时间窗口。

## 管理原则

- 不再把模板当成最终脚本成品存储。
- 模板必须能解释“前台需要用户补什么 brief”。
- 模板必须优先保证跨行业复用能力，而不是行业定制感。
- 新增模板时，优先补齐 `variables` 定义，而不是只写一段完整口播稿。
- 如果模板不能稳定复用，只能作为示例文案，不应进入正式模板库。
- `/create` 第二阶段优先按表达逻辑组织卡片，而不是按行业组织卡片。

## 当前种子数据

当前 starter templates 仍带明显行业属性，只适合作为过渡种子数据。

下一轮应迁移为通用表达模板库，例如：

- 痛点解决
- 教程步骤
- 清单推荐
- 爆款主推
- 社会证明
- 真实见证
- 日常场景嵌入
- 对比选择
- 误区纠偏
- FAQ / 评论回复
- Before / After 成果
- 幕后透明
- 选购决策
- 热点嫁接
- 案例拆解
- 主理人观点
