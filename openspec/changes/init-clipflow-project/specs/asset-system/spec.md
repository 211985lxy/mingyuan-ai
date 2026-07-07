## ADDED Requirements

### Requirement: Avatar cloning workflow
The system SHALL let a user upload a自拍视频 to create a digital avatar, send the source media to Shanjian for cloning, and track avatar status as `uploading`, `cloning`, `ready`, or `failed`.

#### Scenario: User creates a new avatar
- **WHEN** a signed-in user uploads a valid自拍视频 for avatar creation
- **THEN** the system stores the source media, creates an avatar record, submits the clone request, and returns an avatar in a non-ready state until the asynchronous result arrives

### Requirement: Avatar voice binding
The system SHALL persist the avatar's bound voice identifiers returned by Shanjian and expose voice information as part of the avatar asset detail.

#### Scenario: Avatar clone succeeds
- **WHEN** the avatar clone callback reports success with avatar and speaker identifiers
- **THEN** the avatar record is updated to `ready` and includes the external avatar and bound speaker metadata needed for later video generation

### Requirement: Material asset library
The system SHALL let users upload and manage reusable image, video, and music assets in OSS-backed storage.

#### Scenario: User uploads a material asset
- **WHEN** a signed-in user uploads an image, video, or music file from the assets page
- **THEN** the system stores the file in OSS and creates an asset record with type, URL, owner, and creation metadata

### Requirement: Asset center presentation
The assets page SHALL present digital avatars, bound voice information, and reusable material assets in one workspace.

#### Scenario: User opens the assets page
- **WHEN** a signed-in user navigates to asset management
- **THEN** the page displays the user's avatars with status, the voice information bound to those avatars, and the list of reusable uploaded assets
