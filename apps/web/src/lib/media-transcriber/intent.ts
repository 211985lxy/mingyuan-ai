const MEDIA_TRANSCRIPTION_PATTERN = /(?:小\s*[dD]|转录|整理(?:一下|成)?|提纯)/u

export function isMediaTranscriptionIntent(text: string): boolean {
  return MEDIA_TRANSCRIPTION_PATTERN.test(text.trim())
}
