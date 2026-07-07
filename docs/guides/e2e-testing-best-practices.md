# 明远AIM E2E 自动化测试与质量守则

> **文档版本**: 1.0.0 (2026-05)  
> **受众**: 项目核心开发人员、AI 协作 Agent  
> **核心原则**: 坚守 `Zero Mock Rule` 业务流闭环，科学隔离第三方网络依赖，确保 100% 绿标回归。

---

## 1. 核心架构红线 (Zero Mock Rule)

在 ClipFlow 系统中，E2E 自动化测试必须严格贯彻 **Zero Mock Rule**：
* **红线**：严禁在核心业务流（如 `IpProfile` 商业人设、`Script` 脚本文案、`VideoTask` 视频任务等）的生产/测试链路中使用硬编码的假数据或虚拟 Provider 来代替真实的数据库读写与处理流程。
* **目的**：确保整个业务系统从端到端都是真实的本地 MySQL 数据库存储与全流转，从而防范任何由于实体映射、外键约束、数据漂移或字段缺失导致的数据不一致问题。

---

## 2. 数据库级联清理与防死锁规范

在进行 E2E 自动化测试时，每次测试前后都需要对测试数据库进行清理。由于 ClipFlow 的表结构高度关联，外键死锁（Deadlock）是一个经典的质量隐患。

### 🚨 级联删除防死锁守则
在编写或升级 `__tests__/e2e/helpers.ts` 中的 `cleanDatabase()` 函数时，删除顺序必须严格遵循**先子表（依赖表），后主表（被依赖表）**的物理依赖拓扑结构：
1. **优先删除下游子表**：
   * 必须最先删除 `VideoTask`、`TopicSelection`、`Script` 等包含了 `userId` 或 `ipProfileId` 外键的子依赖表。
2. **最后删除顶层主表**：
   * 只有在所有底层关联表的数据完全清空后，方可删除 `IpProfile` 和 `User` 表。
3. **违反代价**：如果顺序颠倒，MySQL 事务在锁升级或外键约束检查时极易产生级联删除死锁冲突。

---

## 3. 第三方网络与 API Key 的 Mock 隔离

尽管业务数据必须落盘，但对于依赖外部服务且需要独立网络连接或 API 金钥的第三方接口（如 Pexels、Pixabay 等素材接口），**必须实行强制的网络隔离**。

### 🚨 素材接口测试隔离规约
在回归测试环境下，通常不具备真实的 `PEXELS_API_KEY_*` 或 `PIXABAY_API_KEY_*` 环境变量，任何直接向外部发起的网络请求均会导致抛出 `NO_KEYS` 等异常。
* **Mock 接管策略**：在对应的建议测试文件（如 `packaging-material-query.test.ts`）顶部，必须显式通过 `vi.mock` 接管其核心 lib 的 API。
  ```typescript
  vi.mock("@/lib/pexels", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/pexels")>()
    return {
      ...actual,
      searchPhotos: vi.fn().mockResolvedValue({
        total_results: 15,
        photos: [ /* 结构化 Mock Photo 数组 */ ]
      })
    }
  });
  ```
* **缓存一致性属性**：提供 Mock 数据时，其 `total_results`（Pexels）或 `totalHits`（Pixabay）必须**大于或等于 10**，以保证能够完美通过测试中 `QGEN-03` 的 PexelsQueryCache 记录阈值判定。
* **占位 Key 注入**：即使 Mock 了 lib，仍然需要在测试环境顶部通过注入占位环境变量来避开底层的初始化抛错：
  ```typescript
  process.env.PEXELS_API_KEY_1 = "mock-key";
  process.env.PIXABAY_API_KEY_1 = "mock-key";
  ```

---

## 4. API Router 请求的 Vitest 调用防御

在 Next.js 16 App Router 中，API Handle 处理函数（如 `GET()`、`POST()`）既会被路由调用，也会在 E2E 测试中被 Vitest 直接传入构造的模拟 `Request` 来调用。

### 🚨 路由解构防空指针红线
* **问题**：如果在 API 内部直接解构 `request.nextUrl`，在测试无参或传入普通 mock request 调用时，极易因 `request.nextUrl` 为空引发崩溃。
* **防御要求**：
  1. **生产防御**：API 处理器内部应采取兼容性解构，或者在解构前提供兜底的 URL 解析保护：
     ```typescript
     const url = request.url ? new URL(request.url) : new URL("/", "http://localhost");
     ```
  2. **测试防御**：在测试文件中直接传递由 `req` 辅助函数构造的、具备完整路径的安全 `NextRequest` 实体：
     ```typescript
     GET(req("/api/hot-topics")) // 严禁不带参数或传递裸 Object 直接调用 GET()
     ```

---

## 5. 系统缓存升级的一致性规约

ClipFlow 使用 Redis 来对全局品牌配置（OEM Branding）进行高速缓存。
* **红线**：当生产代码（如 `src/lib/branding.ts`）中的缓存版本发生升级时（例如由 `system:branding:v1` 升级为 `system:branding:v2`），**回归测试文件中的 `BRANDING_CACHE_KEY` 必须强制保持一致同步更新**。
* **后果**：任何 key 不一致均会导致测试中的“缓存失效断言”无法命中而遭遇 `expected null not to be null` 的失败。

---

## 6. LLM 退化降级测试的上下文保护

当回归测试环境被剥离了大模型秘钥（如 `delete process.env.OPENAI_API_KEY`）导致系统主动退化为 **基于规则的降级生成 (`rule-based-fallback`)** 时：
* **要求**：`script-generator.ts` 中的 `fallbackResult` 在生成简易文案时，**也必须将当前的 `buildContextBlock(params)` 上下文文本记录到 `promptText` 字段中并回填落盘**。
* **意义**：这不仅是为了在 fallback 状态下保持完整的生成血缘（Lineage）和审计追溯能力，同时也是通过 `script-generation.test.ts` 中断言“个人IP档案”关键字的底层技术保证。
