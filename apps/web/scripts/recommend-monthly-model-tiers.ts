#!/usr/bin/env node
/**
 * 按 route key 打印月度模型档位建议。只 stdout，不写库、不改路由表。
 * 用法：把 eval 日报 JSON 喂进来；没有输入时打印空建议。
 */
import { recommendMonthlyModelTiers } from "../src/lib/aim/monthly-model-tiers"

const raw = process.argv[2]
const rows = raw
  ? JSON.parse(raw) as Array<{ routeKey: string; rubricMean: number | null; costCny: number | null }>
  : []
process.stdout.write(`${JSON.stringify(recommendMonthlyModelTiers(rows), null, 2)}\n`)
