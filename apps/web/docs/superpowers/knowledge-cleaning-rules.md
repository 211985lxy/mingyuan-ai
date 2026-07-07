# AIM 知识库清洗规则

## 清洗目标

知识库不是资料仓库。每条知识都要能说明：

- 它属于 IP 资产还是项目资产。
- 它能用于选题、成交、视频、小红书还是公众号。
- 它是已确认事实、用户叙事，还是待核验信息。

## 标签约定

- `kb_scope:ip`：个人/IP 资产。
- `kb_scope:project`：项目/产品/成交资产。
- `asset_role:story`：个人故事、转折、失败或高光。
- `asset_role:proof`：信任背书、证明材料、质疑回应。
- `asset_role:judgment`：行业判断、价值观、反常识观点。
- `asset_role:usp`：产品卖点、服务特性、定价逻辑。
- `asset_role:pain`：客户痛点、成交顾虑、用户问题。
- `asset_role:case`：案例、客户反馈、前后对比。
- `asset_role:benchmark`：竞品、对标账号、市场参考。
- `asset_role:inspiration`：热点、临时灵感、观察。
- `usable_for:xhs`：适合小红书图文。
- `usable_for:wechat`：适合公众号。
- `usable_for:video`：适合短视频。
- `usable_for:sales`：适合成交转化。
- `usable_for:topic`：适合选题生成。
- `confidence:confirmed`：已核验事实。
- `confidence:user_claim`：用户叙事或客户提供材料。
- `confidence:pending_verify`：待核验，AIM 可参考但必须标注。

## IP 知识库

收这些：

- 个人基本信息、长期身份、公开人设。
- 创始人故事、人生转折、失败教训、高光经历。
- 三观、行业判断、做事原则、反常识观点。
- 信任背书、质疑回应、边界声明。

不收这些：

- 单个项目的价格、交付细节、客户需求。
- 没有内容价值的流水账。
- 未核验但会影响公开表达的履历事实，除非标 `confidence:pending_verify`。

## 项目知识库

收这些：

- 产品卖点、服务范围、交付流程。
- 客户痛点、成交阻力、常见问答。
- 项目案例、客户反馈、前后对比。
- 竞品分析、市场数据、差评聚类、热点灵感。

不收这些：

- 只证明创始人个性的故事。
- 和当前项目无关的行业泛泛观点。
- 没有来源的市场数字，除非标 `confidence:pending_verify`。

## 清洗顺序

1. 先判定 `kb_scope`。
2. 再判定 `asset_role`。
3. 再标注 `usable_for`。
4. 最后判断 `confidence`。

重复资料只保留一条主资产，其他地方用标签复用，不复制多份。
