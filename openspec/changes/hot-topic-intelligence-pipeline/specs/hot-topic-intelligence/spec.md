## ADDED Requirements

### Requirement: Hot topics MUST be enriched with real fact context before being treated as marketing inputs
The system SHALL fetch real public search results for a selected hot topic and derive a structured topic insight before the topic can be presented as an AI-understood event.

#### Scenario: User selects a hot topic
- **WHEN** an authenticated user requests insight for a selected hot topic from the latest hot list
- **THEN** the backend fetches real public search summaries for that topic, generates a structured insight, persists the insight snapshot, and returns the topic summary, why-it-is-trending explanation, source links, and risk notes

#### Scenario: Search source is unavailable
- **WHEN** the system cannot fetch enough real search evidence for the selected hot topic
- **THEN** the system returns an explicit insight-unavailable response and MUST NOT pretend the topic has already been understood

### Requirement: Topic insight MUST include marketing-safe interpretation metadata
The system SHALL produce structured marketing interpretation for each selected hot topic, including business-relevant themes and unsafe angles.

#### Scenario: Insight is generated successfully
- **WHEN** the topic insight pipeline completes
- **THEN** the insight contains a factual summary, why-trending explanation, key facts, suggested bridge themes, risk level, and not-recommended angles

### Requirement: Topic-to-business fit MUST be evaluated against the active creation context
The system SHALL evaluate whether a selected hot topic fits the current user’s IP profile, selected template, brief inputs, and chosen structure before script generation.

#### Scenario: Strong fit topic
- **WHEN** the selected hot topic aligns naturally with the user’s business context
- **THEN** the system returns a strong-fit evaluation including score, bridge reason, recommended angle, and suggested opening strategy

#### Scenario: Weak or unsafe fit topic
- **WHEN** the selected hot topic has weak business relevance or a sensitive risk profile
- **THEN** the system returns an explicit caution or avoid decision with reasons and guidance against hard association

### Requirement: Topic insight freshness MUST be surfaced to the user
The system SHALL indicate when hot-topic insight is based on stale ranking data or stale public search evidence.

#### Scenario: Topic data is stale
- **WHEN** the selected hot topic comes from an outdated fetch cycle or the source evidence is old
- **THEN** the system includes a freshness warning in the returned insight payload
