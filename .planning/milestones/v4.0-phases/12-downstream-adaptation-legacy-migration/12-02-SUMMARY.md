---
phase: 12-downstream-adaptation-legacy-migration
plan: "02"
subsystem: ui
tags: [shadcn-ui, react, nextjs, ip-profile, upgrade-flow, v1-migration]

# Dependency graph
requires:
  - phase: 11-ip-profile-wizard-and-3d-result
    provides: "v2 profileVersion field, isV2Profile/hasCompletePositioning helpers, wizard state machine"
provides:
  - "Dismissible upgrade banner on /ip-profile for v1 complete users with 5-field pre-fill mapping"
  - "Non-blocking upgrade nudge banner on /home for v1 complete users linking to /ip-profile"
  - "handleStartUpgrade pre-fill: industry->Q1, displayName->Q2, primaryOffer->Q3, ipTraits->Q4, callToAction->Q5"
affects: [downstream-adaptation, legacy-migration, ip-profile-v2, create-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "profileVersion dual-track detection: (profile.profileVersion ?? 1) === 1 for v1 user detection"
    - "Non-blocking upgrade banners via Card+CardContent+Button (no Alert component)"
    - "Pre-fill mapping: v1 flat fields mapped to v2 wizard survey answers as best-effort partial fill"

key-files:
  created: []
  modified:
    - apps/web/src/app/(dashboard)/ip-profile/page.tsx
    - apps/web/src/app/(dashboard)/home/page.tsx

key-decisions:
  - "Banner rendered via wrapping div around WizardView (not inside WizardView component) to avoid modifying WizardViewProps interface"
  - "aria-label on X dismiss buttons per ui-ux-pro-max accessibility rules"
  - "surveyMonetization pre-fill uses single-item array [primaryOffer] — partial pre-fill is better than wrong pre-fill if value doesn't match wizard options exactly"
  - "No Link component for home banner CTA — router.push used to stay consistent with existing button interaction pattern"

patterns-established:
  - "Upgrade banner pattern: Card+CardContent with flex justify-between, Sparkles icon, text block, CTA+X buttons"
  - "v1 detection: (profile.profileVersion ?? 1) === 1 — null/undefined treated as v1 for backward compatibility"

requirements-completed: [INTG-04, INTG-05, INTG-06]

# Metrics
duration: 5min
completed: 2026-04-02
---

# Phase 12 Plan 02: Legacy User Upgrade Banners Summary

**Non-blocking opt-in upgrade banners for v1 IP profile users on /home and /ip-profile, with pre-fill mapping from 9 flat fields to 5 wizard survey questions**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-02T14:39:56Z
- **Completed:** 2026-04-02T14:44:44Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- IP profile page detects v1 complete users via `(profileVersion ?? 1) === 1` and shows a dismissible upgrade banner above the wizard
- `handleStartUpgrade` pre-fills 5 wizard survey answers from v1 flat fields: industry, displayName, primaryOffer (as array), ipTraits, callToAction
- Home page shows a non-blocking "解锁 AI 三维定位" banner for v1 complete users with "了解更多" CTA linking to /ip-profile
- v2 complete users see no banners; incomplete users still see the existing modal on /home (no regression)
- /create page verified compatible via code reading — `isComplete: true` from API passes existing gate checks for v1 complete users

## Task Commits

Each task was committed atomically:

1. **Task 1: Add v1 complete user upgrade banner with pre-fill logic to IP profile page (INTG-04, INTG-05)** - `5d30058` (feat)
2. **Task 2: Add home page upgrade banner for v1 complete users (INTG-06)** - `eb7f00d` (feat)

## Files Created/Modified

- `apps/web/src/app/(dashboard)/ip-profile/page.tsx` - Added showUpgradeBanner/v1Profile state, v1 detection branch in useEffect, handleStartUpgrade pre-fill function, dismissible Card banner above WizardView
- `apps/web/src/app/(dashboard)/home/page.tsx` - Added X to lucide imports, showUpgradeBanner state, v1 detection in getIpProfile effect, non-blocking Card banner before header

## Decisions Made

- Rendered the banner as a wrapper div + Card above `<WizardView>` in the ip-profile page (not by modifying WizardViewProps interface), since the WizardView is already a standalone component.
- Added `aria-label="关闭升级提示"` to X dismiss buttons per ui-ux-pro-max accessibility rules (icon-only buttons need labels).
- surveyMonetization pre-fill uses a single-item array from `primaryOffer`. If the value doesn't match any wizard card option, the user sees no pre-selection and picks manually — partial pre-fill is better than wrong pre-fill.
- Used `router.push("/ip-profile")` instead of `<Link>` for the home banner CTA to stay consistent with the existing Dialog button pattern in that component.

## Deviations from Plan

None - plan executed exactly as written, plus minor ui-ux-pro-max accessibility additions (aria-label on dismiss buttons).

## Issues Encountered

None - TypeScript pre-existing errors in test files and unrelated API routes (vitest, jsonwebtoken, ali-oss types) did not affect the modified files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- v1 upgrade flow is complete: banner detection, pre-fill, and wizard transition all working
- Phase 12-03 (if any) can build on the same v1/v2 detection pattern established here
- /create page backward compatibility confirmed — no changes needed

---
*Phase: 12-downstream-adaptation-legacy-migration*
*Completed: 2026-04-02*
