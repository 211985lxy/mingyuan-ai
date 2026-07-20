/**
 * Element conflict checking, random sampling, and history-aware
 * derivation for topic generation.
 */

export const CONFLICT_PAIRS: [string, string][] = [
  ["cost", "authority"],
  ["cost", "emotion"],
  ["curiosity", "trust"],
  ["authority", "identity"],
]

const conflictSet = new Set(
  CONFLICT_PAIRS.flatMap(([a, b]) => [`${a}:${b}`, `${b}:${a}`])
)

/**
 * @description 判断是否包含conflict
 * @param codeA - 代码A
 * @param codeB - 代码B
 * @returns boolean
 */
export function hasConflict(codeA: string, codeB: string): boolean {
  return conflictSet.has(`${codeA}:${codeB}`)
}

/**
 * Sample 2-3 non-conflicting elements from the full element code list.
 * Uses Fisher-Yates shuffle then picks greedily while checking conflicts.
 */
/**
 * @description sampleelements
 * @param allCodes - allCodes
 * @param count - 数量
 * @returns string[]
 */
export function sampleElements(
  allCodes: string[],
  count: number = 2 + Math.round(Math.random()),
): string[] {
  const shuffled = [...allCodes].sort(() => Math.random() - 0.5)
  const selected: string[] = []

  for (const code of shuffled) {
    if (selected.length >= count) break
    const conflictsWithSelected = selected.some((s) => hasConflict(s, code))
    if (!conflictsWithSelected) {
      selected.push(code)
    }
  }

  return selected
}

// ─── History-Aware Derivation ─────────────────────────────

/**
 * Element adjacency map for "related but different" sampling.
 * Each element maps to codes that create interesting combinations
 * when used together — not opposites (those are in CONFLICT_PAIRS),
 * but complementary angles that feel like a natural next step.
 */
const ADJACENCY: Record<string, string[]> = {
  cost:      ["practical", "contrast", "scarcity"],
  authority: ["trust", "story", "social"],
  curiosity: ["novelty", "contrast", "story"],
  trust:     ["authority", "social", "story"],
  emotion:   ["identity", "story", "trust"],
  identity:  ["emotion", "social", "practical"],
  novelty:   ["curiosity", "contrast", "practical"],
  practical: ["cost", "trust", "novelty"],
  social:    ["identity", "trust", "emotion"],
  scarcity:  ["cost", "emotion", "curiosity"],
  story:     ["emotion", "identity", "curiosity"],
  contrast:  ["curiosity", "novelty", "cost"],
}

export type DerivationStrategy =
  | "fresh"        // brand new combination, exclude recent
  | "adjacent"     // pick 1 element from recent, add an adjacent neighbor
  | "niche"        // reuse same elements but prompt asks for deeper/narrower angle
  | "remix"        // combine elements from 2 different recent sessions

/**
 * Pick a derivation strategy based on how many times the user has
 * refreshed. Early refreshes get fresh combos; later ones get
 * smarter derivations to avoid the "same stuff" feeling.
 */
/**
 * @description pickstrategy
 * @param refreshCount - refresh数量
 * @returns DerivationStrategy
 */
export function pickStrategy(refreshCount: number): DerivationStrategy {
  if (refreshCount <= 1) return "fresh"
  if (refreshCount === 2) return "adjacent"
  if (refreshCount === 3) return "niche"
  // After 4+, cycle through strategies
  const strategies: DerivationStrategy[] = ["remix", "adjacent", "niche", "fresh"]
  return strategies[(refreshCount - 4) % strategies.length]
}

function sampleFresh(
  allCodes: string[],
  recentFreq: Map<string, number>,
  isNewCombo: (codes: string[]) => boolean,
): string[] {
  const unused = allCodes.filter((code) => !recentFreq.has(code))
  const pool = unused.length >= 2 ? unused : allCodes
  const count = Math.random() < 0.5 ? 2 : 3
  for (let attempt = 0; attempt < 10; attempt++) {
    const sampled = sampleElements(pool, count)
    if (sampled.length >= 2 && isNewCombo(sampled)) return sampled
  }
  return sampleElements(allCodes, count)
}

function sampleAdjacent(
  allCodes: string[],
  recentElementSets: string[][],
  isNewCombo: (codes: string[]) => boolean,
): string[] {
  const lastSet = recentElementSets[0]
  if (!lastSet || lastSet.length === 0) return sampleElements(allCodes)
  const anchor = lastSet[Math.floor(Math.random() * lastSet.length)]
  const neighbors = (ADJACENCY[anchor] ?? []).filter((code) => !hasConflict(anchor, code))
  if (neighbors.length === 0) return sampleElements(allCodes)

  const freshNeighbors = neighbors.filter((code) => !lastSet.includes(code))
  const pool = freshNeighbors.length > 0 ? freshNeighbors : neighbors
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  const picked = [anchor, shuffled[0]]
  if (shuffled.length > 1 && Math.random() < 0.4) picked.push(shuffled[1])
  return isNewCombo(picked) ? picked : sampleElements(allCodes)
}

function sampleNiche(allCodes: string[], recentElementSets: string[][]): string[] {
  const lastSet = recentElementSets[0]
  return lastSet && lastSet.length >= 2 ? [...lastSet] : sampleElements(allCodes)
}

function sampleRemix(
  allCodes: string[],
  recentElementSets: string[][],
  isNewCombo: (codes: string[]) => boolean,
): string[] {
  const set1 = recentElementSets[0] ?? []
  const set2 = recentElementSets[1] ?? []
  if (set1.length === 0 || set2.length === 0) return sampleElements(allCodes)
  const from1 = set1[Math.floor(Math.random() * set1.length)]
  const candidates2 = set2.filter((code) => code !== from1 && !hasConflict(code, from1))
  if (candidates2.length === 0) return sampleElements(allCodes)

  const from2 = candidates2[Math.floor(Math.random() * candidates2.length)]
  const combo = [from1, from2]
  if (Math.random() < 0.3) {
    const wild = allCodes.filter((code) =>
      code !== from1 && code !== from2 && !hasConflict(code, from1) && !hasConflict(code, from2))
    if (wild.length > 0) combo.push(wild[Math.floor(Math.random() * wild.length)])
  }
  return isNewCombo(combo) ? combo : sampleElements(allCodes)
}

/**
 * Sample elements with history awareness. Avoids repeating the exact
 * same element sets the user has already seen, and uses derivation
 * strategies to create related-but-different combinations.
 */
/**
 * @description samplewithhistory
 * @param allCodes - allCodes
 * @param recentElementSets - recent元素Sets
 * @param strategy - 策略
 * @returns string[]
 */
export function sampleWithHistory(
  allCodes: string[],
  recentElementSets: string[][],
  strategy: DerivationStrategy,
): string[] {
  const recentFreq = new Map<string, number>()
  for (const set of recentElementSets) {
    for (const code of set) {
      recentFreq.set(code, (recentFreq.get(code) ?? 0) + 1)
    }
  }

  const recentSetKeys = new Set(recentElementSets.map((set) => [...set].sort().join(",")))
  const isNewCombo = (codes: string[]) => !recentSetKeys.has([...codes].sort().join(","))

  switch (strategy) {
    case "fresh": return sampleFresh(allCodes, recentFreq, isNewCombo)
    case "adjacent": return sampleAdjacent(allCodes, recentElementSets, isNewCombo)
    case "niche": return sampleNiche(allCodes, recentElementSets)
    case "remix": return sampleRemix(allCodes, recentElementSets, isNewCombo)
  }
}
