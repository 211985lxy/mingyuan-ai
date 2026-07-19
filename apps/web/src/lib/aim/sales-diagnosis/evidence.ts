export const MEETING_EVIDENCE_KINDS = [
  "pain",
  "goal",
  "budget",
  "objection",
  "commitment",
  "task",
] as const

export type MeetingEvidenceKind = (typeof MEETING_EVIDENCE_KINDS)[number]

/** Model-provided evidence. quote must be copied verbatim from the meeting transcript. */
export interface MeetingEvidence {
  kind: MeetingEvidenceKind
  statement: string
  quote: string
}

export function isMeetingEvidenceKind(value: string): value is MeetingEvidenceKind {
  return MEETING_EVIDENCE_KINDS.includes(value as MeetingEvidenceKind)
}
