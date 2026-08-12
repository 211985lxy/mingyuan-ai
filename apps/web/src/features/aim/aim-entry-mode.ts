export function shouldShowAimEntrySwitch(searchParams: URLSearchParams): boolean {
  return !searchParams.has("agent")
    && !searchParams.has("mode")
    && !searchParams.has("projectId")
    && !searchParams.has("stage")
    && !searchParams.has("generationId")
}
