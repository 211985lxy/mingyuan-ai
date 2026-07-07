/**
 * Maps CopyStructure codes (user-facing) to VideoStructure names (internal).
 * VideoStructure remains the backend packaging guide; CopyStructure is what users select.
 */

export const FALLBACK_VIDEO_STRUCTURE = "contrast-hook"

export const COPY_TO_VIDEO_STRUCTURE_MAP: Record<string, string> = {
  suspense_reveal: "suspense-reveal",
  contrast_hook: "contrast-hook",
  three_beat_ramp: "three-beat-ramp",
  proof_first: "proof-first",
  pain_solution: "pain-resonance",
  pov_walkthrough: "pov-walkthrough",
  objection_dialogue: "objection-dialogue",
  before_after: "before-after-contrast",
  universal: "contrast-hook",
}

export function mapCopyToVideoStructure(copyStructureCode: string): string {
  return COPY_TO_VIDEO_STRUCTURE_MAP[copyStructureCode] ?? FALLBACK_VIDEO_STRUCTURE
}
