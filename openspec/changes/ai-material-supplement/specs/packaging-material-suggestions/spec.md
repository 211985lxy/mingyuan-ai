## ADDED Requirements

### Requirement: Packaging material suggestions are planned server-side from real creation context
The system SHALL generate packaging material suggestions from the selected script, the current editable script content, the active IP profile, the selected packaging template, and the current packaging draft state. The backend MUST own this context assembly and MUST NOT trust a client-supplied IP profile snapshot as authoritative input.

#### Scenario: User requests suggestions from the packaging step
- **WHEN** an authenticated user calls the packaging material suggestion endpoint with a selected `scriptId`, the current edited script text, and a selected `packagingTemplateId`
- **THEN** the backend loads the active IP profile and packaging template capabilities, plans the suggestion search on the server, and returns reviewable packaging suggestion items

#### Scenario: Repeated planned queries reuse cached stock metadata
- **WHEN** the suggestion service issues the same Pexels query with the same locale and search modifiers
- **THEN** the system reuses cached Pexels metadata instead of treating that request as a distinct uncached stock search

### Requirement: AI stock suggestions obey authenticity-safe role boundaries
The system SHALL only auto-suggest generic stock materials for authenticity-safe support roles. It MUST NOT auto-fill claim-sensitive proof roles such as customer cases, qualifications, or before/after evidence with generic stock media.

#### Scenario: Claim-sensitive roles remain manual-only
- **WHEN** the packaging context includes roles such as `customer_case`, `qualification`, or `before_after`
- **THEN** the suggestion service marks those roles as requiring user-supplied real assets and does not auto-assign generic Pexels media to them

#### Scenario: Safe support roles receive stock suggestions
- **WHEN** the packaging context includes support roles such as `product_detail`, `store_environment`, or `process`
- **THEN** the suggestion service may return stock image suggestions for those roles as supplemental packaging material

### Requirement: Suggestion items retain provenance and regenerate cleanly
The system SHALL treat AI suggestions as reviewable packaging draft items with provenance metadata. Each suggested item MUST remain distinguishable from manual materials so the user can delete, review, or regenerate AI suggestions without overwriting manual work.

#### Scenario: Suggested item includes provenance and transfer status
- **WHEN** the suggestion service returns an AI packaging item
- **THEN** that item includes its role, source label, `pexelsId`, search query, preview metadata, and current OSS transfer status

#### Scenario: Regenerating AI suggestions preserves manual items
- **WHEN** the user requests a fresh AI suggestion run after manually adding or removing packaging materials
- **THEN** the system replaces the prior AI-suggested items only and keeps `manual_upload` and `manual_library` material items untouched

### Requirement: Suggestion volume remains bounded and supplement-oriented
The system SHALL size AI stock suggestions to supplement the spoken video rather than replace it. Phase 1 suggestions MUST remain photo-only and MUST stay within a bounded count derived from script length.

#### Scenario: Long script is capped at a bounded suggestion count
- **WHEN** the selected script would imply a large number of supporting visuals
- **THEN** the service still returns a bounded photo-only suggestion set rather than trying to fully cover the entire script duration

#### Scenario: Short script still gets a minimum viable suggestion set
- **WHEN** the selected script is brief but still benefits from packaging evidence
- **THEN** the service returns a minimum viable number of support images instead of zero or one token suggestion
