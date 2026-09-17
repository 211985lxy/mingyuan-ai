import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  FULLTEXT_INDEX_PROBE_SQL,
  createCachedFulltextProbe,
  detectUsableFulltextIndex,
} from "@/lib/llm/keyword-capability"

/**
 * FULLTEXT 词面召回能力探测的契约测试 + 「别把 ngram 加回来」的回归护栏。
 *
 * 背景（2026-09-16/17）：P1 的 ngram FULLTEXT 迁移在生产（MariaDB 10.5）上失败，
 * 因为 MariaDB 不支持 `WITH PARSER ngram`。CI 用 MySQL 8.4 所以没拦住。
 * 本次改成「索引可选 + 运行时探测降级」，用下面的静态断言把这个坑钉住：
 * 只要有人把 `WITH PARSER ngram` 写回迁移或把 `@@fulltext` 写回 schema，
 * 部署就会再次在生产上炸 —— 那不如在单测里先炸。
 */

const appRoot = resolve(__dirname, "../..")
const migrationsDir = resolve(appRoot, "prisma/migrations")

const row = (INDEX_TYPE: unknown, COLUMN_NAME: unknown, INDEX_NAME: unknown = "idx") => ({
  INDEX_TYPE,
  COLUMN_NAME,
  INDEX_NAME,
})

describe("keyword-capability / 探测结果判定", () => {
  it("识别 text 列上的 FULLTEXT 索引并回传索引名", () => {
    expect(
      detectUsableFulltextIndex([row("FULLTEXT", "text", "KnowledgeChunk_text_idx")]),
    ).toEqual({ available: true, indexName: "KnowledgeChunk_text_idx" })
  })

  it("索引名缺失时可用但索引名为 null（不因命名异常判不可用）", () => {
    expect(detectUsableFulltextIndex([{ INDEX_TYPE: "FULLTEXT", COLUMN_NAME: "text" }])).toEqual({
      available: true,
      indexName: null,
    })
  })

  it("★ 表上有 FULLTEXT 但不在 text 列 → 不可用（MATCH(text) 仍会报 1191）", () => {
    expect(detectUsableFulltextIndex([row("FULLTEXT", "title")])).toEqual({
      available: false,
      indexName: null,
    })
  })

  it("★ text 列上只有普通索引（BTREE）→ 不可用", () => {
    expect(detectUsableFulltextIndex([row("BTREE", "text")])).toEqual({
      available: false,
      indexName: null,
    })
  })

  it("大小写不敏感的 INDEX_TYPE / COLUMN_NAME", () => {
    expect(detectUsableFulltextIndex([row("fulltext", "TEXT")]).available).toBe(true)
  })

  it("非数组、空数组、缺字段、混合垃圾行都不崩", () => {
    expect(detectUsableFulltextIndex(undefined).available).toBe(false)
    expect(detectUsableFulltextIndex(null).available).toBe(false)
    expect(detectUsableFulltextIndex("[]").available).toBe(false)
    expect(detectUsableFulltextIndex([]).available).toBe(false)
    expect(detectUsableFulltextIndex([null, 42, "x", {}]).available).toBe(false)
    // 前几行是垃圾、最后一行才是真命中 → 仍要找到
    expect(detectUsableFulltextIndex([{ INDEX_TYPE: 1 }, row("FULLTEXT", "text")]).available).toBe(true)
  })

  it("探测 SQL 只读 INFORMATION_SCHEMA，且按表 + 列过滤（无外部输入拼接）", () => {
    expect(FULLTEXT_INDEX_PROBE_SQL).toContain("INFORMATION_SCHEMA.STATISTICS")
    expect(FULLTEXT_INDEX_PROBE_SQL).toContain("TABLE_NAME = 'KnowledgeChunk'")
    expect(FULLTEXT_INDEX_PROBE_SQL).toContain("COLUMN_NAME = 'text'")
    expect(FULLTEXT_INDEX_PROBE_SQL).not.toMatch(/\$\{|\?/)
  })
})

describe("keyword-capability / 缓存探针", () => {
  it("命中结果被缓存：多次调用只查一次库", async () => {
    let calls = 0
    const probe = createCachedFulltextProbe(async () => {
      calls += 1
      return [row("FULLTEXT", "text", "KnowledgeChunk_text_idx")]
    })

    expect(await probe()).toBe(true)
    expect(await probe()).toBe(true)
    expect(await probe()).toBe(true)
    expect(calls).toBe(1)
  })

  it("不可用结果同样被缓存（避免每次检索重复探测）", async () => {
    let calls = 0
    const probe = createCachedFulltextProbe(async () => {
      calls += 1
      return [row("BTREE", "text")]
    })

    expect(await probe()).toBe(false)
    expect(await probe()).toBe(false)
    expect(calls).toBe(1)
  })

  it("★ 并发调用共享同一次探测（不能一次启动 N 条查询）", async () => {
    let calls = 0
    let release: (() => void) | null = null
    const gate = new Promise<void>((r) => {
      release = r
    })
    const probe = createCachedFulltextProbe(async () => {
      calls += 1
      await gate
      return [row("FULLTEXT", "text")]
    })

    const all = Promise.all([probe(), probe(), probe(), probe()])
    release!()
    expect(await all).toEqual([true, true, true, true])
    expect(calls).toBe(1)
  })

  it("★ 探测抛错 → 返回 false 但**不落缓存**，下次调用重试", async () => {
    let calls = 0
    const errors: unknown[] = []
    const probe = createCachedFulltextProbe(
      async () => {
        calls += 1
        if (calls === 1) throw new Error("ECONNRESET")
        return [row("FULLTEXT", "text")]
      },
      { onError: (error) => errors.push(error) },
    )

    expect(await probe()).toBe(false)
    expect(errors).toHaveLength(1)
    // 第二次重试成功 → 说明失败没被缓存成「永久不可用」
    expect(await probe()).toBe(true)
    expect(calls).toBe(2)
  })

  it("onResolved 只在首次探得确定结果时回调一次", async () => {
    const seen: Array<{ available: boolean; indexName: string | null }> = []
    const probe = createCachedFulltextProbe(async () => [row("BTREE", "text")], {
      onResolved: (result) => seen.push(result),
    })

    await probe()
    await probe()
    expect(seen).toEqual([{ available: false, indexName: null }])
  })

  it("onResolved 不因探测异常而触发（异常不是确定结果）", async () => {
    const seen: unknown[] = []
    const probe = createCachedFulltextProbe(
      async () => {
        throw new Error("boom")
      },
      { onResolved: (result) => seen.push(result) },
    )

    await probe()
    expect(seen).toEqual([])
  })

  it("不传任何回调也能正常工作（回调是可选的）", async () => {
    const ok = createCachedFulltextProbe(async () => [row("FULLTEXT", "text")])
    const no = createCachedFulltextProbe(async () => [])
    expect(await ok()).toBe(true)
    expect(await no()).toBe(false)
  })
})

/**
 * 回归护栏。三个断言各自对应一个「会让生产部署失败或静默劣化」的动作。
 */
describe("回归护栏 / 别把 ngram FULLTEXT 加回来", () => {
  const stripSqlComments = (sql: string) =>
    sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")

  it("★ 没有任何迁移在**可执行 SQL** 里建 ngram FULLTEXT 索引（MariaDB 会 P3018）", () => {
    const offenders: string[] = []
    for (const entry of readdirSync(migrationsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const sqlPath = resolve(migrationsDir, entry.name, "migration.sql")
      let sql: string
      try {
        sql = readFileSync(sqlPath, "utf8")
      } catch {
        continue
      }
      const executable = stripSqlComments(sql)
      if (/ADD\s+FULLTEXT|WITH\s+PARSER/i.test(executable)) offenders.push(entry.name)
    }
    expect(
      offenders,
      `生产库是 MariaDB 10.5，不支持 WITH PARSER ngram。这些迁移会让 migrate deploy 在生产上失败：${offenders.join(", ")}`,
    ).toEqual([])
  })

  it("★ prisma schema 不声明 @@fulltext([text])（否则 migrate deploy 期望一个建不出的索引）", () => {
    const schema = readFileSync(resolve(appRoot, "prisma/knowledge.prisma"), "utf8")
    const executable = schema
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n")
    expect(executable).not.toMatch(/@@fulltext/)
    // 但 text 列本身必须在 —— 词面召回一旦恢复索引就靠它
    expect(executable).toMatch(/text\s+String\s+@db\.Text/)
  })

  it("★ 关键词检索必须走能力探测，不能直接查（否则每次检索都吃一次 errno 1191）", () => {
    const source = readFileSync(resolve(appRoot, "src/lib/llm/keyword-retrieval.ts"), "utf8")
    expect(source).toContain("createCachedFulltextProbe")
    const probeAt = source.indexOf("await isFulltextIndexAvailable()")
    const queryAt = source.indexOf("await runKeywordQuery(")
    expect(probeAt).toBeGreaterThan(-1)
    expect(queryAt).toBeGreaterThan(-1)
    // 探测必须早于真正的召回查询
    expect(probeAt).toBeLessThan(queryAt)
  })
})
