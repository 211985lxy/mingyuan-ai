# Phase 05-01 Summary

**Status:** Complete
**Date:** 2026-03-26

## What was built

- Filled `messages/zh.json` and `messages/en.json` with real bilingual marketing copy — zero empty strings
- Created 7 Server Component sections in `apps/web/src/components/marketing/`:
  - `hero-section.tsx` — Full-width hero with h1, subtitle, green primary CTA + indigo outline secondary CTA
  - `pain-points-section.tsx` — 4-column responsive grid of pain points with Lucide icons
  - `how-it-works-section.tsx` — 3 numbered steps with indigo circles and green step badges
  - `features-section.tsx` — 3 feature cards with indigo icon backgrounds
  - `differentiators-section.tsx` — 6 items on brand-indigo background with green checkmarks
  - `social-proof-section.tsx` — 3 stat cards with large indigo numbers
  - `cta-section.tsx` — Final conversion section with green CTA button
- Updated `(marketing)/page.tsx` to assemble all 7 sections in order

## Design Decisions

- Design system: flat design, #6366F1 indigo primary, #22C55E green CTA, #EEF2FF light background, #312E81 deep indigo text
- All sections are Server Components (no "use client") — translations run server-side
- Only `language-switcher.tsx` has "use client" (cookie write + router.refresh)
- Alternating white / #EEF2FF section backgrounds for visual rhythm
- DifferentiatorsSection uses brand-indigo background (#6366F1) as a visual break

## Acceptance Criteria — PASS

- [x] 7 sections assembled in page.tsx
- [x] Zero empty strings in both translation files
- [x] Zero hardcoded strings in any component
- [x] Only language-switcher.tsx has "use client"
- [x] All sections use useTranslations() from their respective namespaces
- [x] npm run build passes
