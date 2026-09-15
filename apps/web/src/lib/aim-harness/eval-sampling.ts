import type { EvalFixture } from "./eval/contracts"

/** Deterministic sample of N fixtures; P0 regressions are always included. */
export function sampleFixtures(
  fixtures: readonly EvalFixture[],
  sampleSize?: number,
): EvalFixture[] {
  if (!sampleSize || sampleSize >= fixtures.length) return [...fixtures]

  const regressions = fixtures.filter((fixture) => fixture.contractRegressionOnly)
  const pool = fixtures.filter((fixture) => !fixture.contractRegressionOnly)
  const mandatoryCount = Math.min(sampleSize, regressions.length)
  const sampled: EvalFixture[] = regressions.slice(0, mandatoryCount)
  const remainingSlots = sampleSize - sampled.length

  for (let i = 0; i < remainingSlots; i += 1) {
    const index = Math.floor((i * pool.length) / remainingSlots)
    sampled.push(pool[index])
  }
  return sampled
}
