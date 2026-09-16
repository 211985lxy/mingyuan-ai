export const LIVE_REASONING_MAX_CHARS = 8_000

export interface LiveReasoningState {
  text: string
  streaming: boolean
  done: boolean
  attempt: number
  startedAt: number
}

export const EMPTY_LIVE_REASONING: LiveReasoningState = {
  text: "",
  streaming: false,
  done: false,
  attempt: 1,
  startedAt: 0,
}

export function applyReasoningEvent(
  prev: LiveReasoningState,
  event: { text?: string; attempt?: number; reset?: boolean; done?: boolean },
): LiveReasoningState {
  if (event.reset) {
    return {
      text: (event.text ?? "").slice(0, LIVE_REASONING_MAX_CHARS),
      streaming: !event.done,
      done: Boolean(event.done),
      attempt: event.attempt ?? prev.attempt + 1,
      startedAt: Date.now(),
    }
  }
  const nextText = `${prev.text}${event.text ?? ""}`.slice(0, LIVE_REASONING_MAX_CHARS)
  return {
    text: nextText,
    streaming: event.done ? false : true,
    done: Boolean(event.done),
    attempt: event.attempt ?? prev.attempt,
    startedAt: prev.startedAt || Date.now(),
  }
}
