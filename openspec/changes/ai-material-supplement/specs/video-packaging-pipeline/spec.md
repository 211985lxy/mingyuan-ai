## ADDED Requirements

### Requirement: Packaging assets use dual-mode acquisition instead of raw URL entry
The packaging pipeline SHALL let users satisfy material and BGM needs through two explicit paths: AI-assisted stock suggestions and user-managed asset upload or selection. The normal packaging workflow MUST NOT require end users to provide raw asset URLs.

#### Scenario: User uploads manual packaging evidence
- **WHEN** the user wants to add their own product image, store video, or process clip during packaging
- **THEN** the system lets the user upload that file through the managed asset flow and adds it to the current packaging draft without asking for a URL

#### Scenario: User uploads or selects custom background music
- **WHEN** the user wants custom BGM for the selected packaging template
- **THEN** the system lets the user upload or select a managed `music` asset instead of entering an `audioUrl` by hand

### Requirement: Manual packaging inputs preserve managed asset lineage
The system SHALL preserve the relation between manual packaging inputs and the managed asset records that produced them, so packaging decisions remain traceable and reusable.

#### Scenario: Existing asset selected from library
- **WHEN** the user chooses an existing image, video, or music asset from their asset library during packaging
- **THEN** the packaging draft preserves that asset's lineage together with the role it fulfills in the production plan

#### Scenario: Newly uploaded asset becomes immediately selectable
- **WHEN** the user uploads a new packaging asset from within `/create`
- **THEN** the asset is registered through the real asset APIs and becomes immediately selectable in the same packaging session
