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

export function hasConflict(codeA: string, codeB: string): boolean {
  return conflictSet.has(`${codeA}:${codeB}`)
}

/**
 * Sample 2-3 non-conflicting elements from the full element code list.
 * Uses Fisher-Yates shuffle then picks greedily while checking conflicts.
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
export function pickStrategy(refreshCount: number): DerivationStrategy {
  if (refreshCount <= 1) return "fresh"
  if (refreshCount === 2) return "adjacent"
  if (refreshCount === 3) return "niche"
  // After 4+, cycle through strategies
  const strategies: DerivationStrategy[] = ["remix", "adjacent", "niche", "fresh"]
  return strategies[(refreshCount - 4) % strategies.length]
}

/**
 * Sample elements with history awareness. Avoids repeating the exact
 * same element sets the user has already seen, and uses derivation
 * strategies to create related-but-different combinations.
 */
export function sampleWithHistory(
  allCodes: string[],
  recentElementSets: string[][],
  strategy: DerivationStrategy,
): string[] {
  // Flatten recent sets into a frequency map
  const recentFreq = new Map<string, number>()
  for (const set of recentElementSets) {
    for (const code of set) {
      recentFreq.set(code, (recentFreq.get(code) ?? 0) + 1)
    }
  }

  const recentSetKeys = new Set(
    recentElementSets.map((s) => [...s].sort().join(",")),
  )

  function isNewCombo(codes: string[]): boolean {
    return !recentSetKeys.has([...codes].sort().join(","))
  }

  switch (strategy) {
    case "fresh": {
      // Prefer elements NOT used recently. Fall back to any if all used.
      const unused = allCodes.filter((c) => !recentFreq.has(c))
      const pool = unused.length >= 2 ? unused : allCodes
      const count = Math.random() < 0.5 ? 2 : 3

      // Try up to 10 times to find a new combination
      for (let attempt = 0; attempt < 10; attempt++) {
        const sampled = sampleElements(pool, count)
        if (sampled.length >= 2 && isNewCombo(sampled)) return sampled
      }
      return sampleElements(allCodes, count)
    }

    case "adjacent": {
      // Pick 1 element from the most recent set, then add an adjacent neighbor
      const lastSet = recentElementSets[0]
      if (!lastSet || lastSet.length === 0) return sampleElements(allCodes)

      const anchor = lastSet[Math.floor(Math.random() * lastSet.length)]
      const neighbors = (ADJACENCY[anchor] ?? []).filter(
        (n) => !hasConflict(anchor, n),
      )

      if (neighbors.length === 0) return sampleElements(allCodes)

      // Pick 1-2 neighbors not in the original set
      const freshNeighbors = neighbors.filter((n) => !lastSet.includes(n))
      const pool = freshNeighbors.length > 0 ? freshNeighbors : neighbors
      const shuffled = [...pool].sort(() => Math.random() - 0.5)
      const picked = [anchor, shuffled[0]]
      if (shuffled.length > 1 && Math.random() < 0.4) picked.push(shuffled[1])

      if (isNewCombo(picked)) return picked
      // Fall back to fresh
      return sampleElements(allCodes)
    }

    case "niche": {
      // Reuse the most recent element set — the prompt will instruct
      // the LLM to go deeper/narrower instead of broad
      const lastSet = recentElementSets[0]
      if (lastSet && lastSet.length >= 2) return [...lastSet]
      return sampleElements(allCodes)
    }

    case "remix": {
      // Combine 1 element from session N-1 and 1 from session N-2
      const set1 = recentElementSets[0] ?? []
      const set2 = recentElementSets[1] ?? []
      if (set1.length === 0 || set2.length === 0) return sampleElements(allCodes)

      const from1 = set1[Math.floor(Math.random() * set1.length)]
      const candidates2 = set2.filter(
        (c) => c !== from1 && !hasConflict(c, from1),
      )
      if (candidates2.length === 0) return sampleElements(allCodes)

      const from2 = candidates2[Math.floor(Math.random() * candidates2.length)]
      const combo = [from1, from2]

      // Optionally add a third wildcard
      if (Math.random() < 0.3) {
        const wild = allCodes.filter(
          (c) =>
            c !== from1 &&
            c !== from2 &&
            !hasConflict(c, from1) &&
            !hasConflict(c, from2),
        )
        if (wild.length > 0) {
          combo.push(wild[Math.floor(Math.random() * wild.length)])
        }
      }

      if (isNewCombo(combo)) return combo
      return sampleElements(allCodes)
    }
  }
}
