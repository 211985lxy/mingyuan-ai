export type BindingCandidateProject = {
  id: string
  name: string
  companyName: string | null
}

/** Normalize display names for a conservative migration-only exact match. */
export function normalizeBindingName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\p{P}\p{S}\s]+/gu, "")
}

export function chooseUniqueBindingCandidate(input: {
  userName: string | null | undefined
  profileNames: Array<string | null | undefined>
  projects: BindingCandidateProject[]
}): BindingCandidateProject | null {
  const accountNames = [input.userName, ...input.profileNames]
    .map(normalizeBindingName)
    .filter(Boolean)
  if (accountNames.length === 0) return null

  const candidates = input.projects.filter((project) => {
    const names = [project.name, project.companyName]
      .map(normalizeBindingName)
      .filter(Boolean)
    return names.some((name) => accountNames.includes(name))
  })
  return candidates.length === 1 ? candidates[0] : null
}
