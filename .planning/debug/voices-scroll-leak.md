---
status: awaiting_human_verify
trigger: "On the 资产管理 (Assets) page, the 公共声音 (Public Voices) section has a horizontal row of voice cards. When the user scrolls (mouse wheel) within this voice cards area, the scroll event propagates to the parent container, causing the entire right-side content area to scroll vertically."
created: 2026-03-22T00:00:00Z
updated: 2026-03-22T00:00:00Z
symptoms_prefilled: true
goal: find_and_fix
---

## Current Focus

hypothesis: The voices scroll container at line 582 of assets/page.tsx uses `overflow-x: auto` but lacks `overscroll-behavior-x: contain`, so when the user's wheel input reaches the scroll boundary, the browser propagates the scroll event to the parent page, causing vertical scroll.
test: Read the container element's CSS classes and confirm the absence of overscroll containment.
expecting: Adding `[overscroll-behavior-x:contain]` Tailwind utility (or inline style) to the voices flex container will stop scroll propagation.
next_action: Apply the fix to line 582 in apps/web/src/app/(dashboard)/assets/page.tsx

## Symptoms

expected: Scrolling within the public voices card row should only scroll the voices horizontally (if overflow exists), and should NOT cause the parent page to scroll vertically.
actual: Mouse wheel scrolling on the voices section causes the entire right-side area to scroll down, moving past the voices section unexpectedly.
errors: No JS errors - this is a CSS/scroll containment issue
reproduction: Go to 资产管理 page > 素材 tab > hover over the 公共声音 cards row > scroll with mouse wheel → entire page scrolls vertically
started: Likely always been this way since the voices section was added

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-22T00:00:00Z
  checked: apps/web/src/app/(dashboard)/assets/page.tsx line 582
  found: `<div className="flex gap-3 overflow-x-auto pb-2">` — no overscroll containment
  implication: When wheel scroll reaches the horizontal boundary of this container, the browser bubbles the event to the parent page scroll context, causing vertical scroll.

## Resolution

root_cause: The voices horizontal scroll container (`div.flex.gap-3.overflow-x-auto`) at line 582 has no `overscroll-behavior` set. By default browsers use `overscroll-behavior: auto`, which means scroll chaining is enabled — when the inner container can no longer scroll (reached the edge), the scroll event propagates to the nearest scrollable ancestor (the page), which then scrolls vertically.
fix: Add `overscroll-x-contain` Tailwind class (maps to `overscroll-behavior-x: contain`) to the voices container div. This cuts the scroll chain so wheel events consumed by the horizontal row never reach the page.
verification: Added `overscroll-x-contain` class to the voices flex container at line 582. Self-verified: class maps to `overscroll-behavior-x: contain` in Tailwind, which is the standard CSS property to disable scroll chaining on the x-axis. The container still scrolls horizontally internally; it just no longer propagates wheel events to ancestors when it hits its scroll boundary.
files_changed: [apps/web/src/app/(dashboard)/assets/page.tsx]
