## ADDED Requirements

### Requirement: Douyin hot list service module
The system SHALL provide a centralized `lib/douyin-hot.ts` module that encapsulates hot list fetching, fallback logic, database storage, and Redis caching.

#### Scenario: API route uses the hot list service
- **WHEN** the cron route or the user-facing hot topics route needs hot list data
- **THEN** it imports and uses the shared DouyinHotService from the centralized module instead of implementing fetch logic inline

### Requirement: Template rendering engine module
The system SHALL provide a centralized `lib/template-engine.ts` module that performs `{{variable}}` placeholder replacement on template script text.

#### Scenario: Script generation route renders a template
- **WHEN** the template-based script generation endpoint needs to render a template with user values
- **THEN** it imports and uses the shared renderTemplate function from the centralized module

### Requirement: Cron job environment configuration
The system SHALL require a `CRON_SECRET` environment variable and fail fast if it is missing when the cron endpoints are invoked.

#### Scenario: Cron secret is not configured
- **WHEN** the hot list cron endpoint is invoked without CRON_SECRET in the environment
- **THEN** the system returns an error indicating the missing configuration

### Requirement: Douyin hot list data source configuration
The system SHALL accept configurable primary and fallback data source URLs via `DOUYIN_HOT_PRIMARY_URL` and `DOUYIN_HOT_FALLBACK_URL` environment variables, with sensible defaults.

#### Scenario: Custom data source URLs are configured
- **WHEN** the environment specifies custom values for DOUYIN_HOT_PRIMARY_URL and DOUYIN_HOT_FALLBACK_URL
- **THEN** the hot list service uses those URLs instead of the hardcoded defaults

#### Scenario: No custom URLs are configured
- **WHEN** the environment does not specify DOUYIN_HOT_PRIMARY_URL or DOUYIN_HOT_FALLBACK_URL
- **THEN** the hot list service uses the default values (xxapi.cn as primary, vvhan.com as fallback)

### Requirement: Vercel cron job configuration
The system SHALL declare cron job schedules in vercel.json for hot list collection (hourly) and data cleanup (daily).

#### Scenario: Vercel deployment includes cron configuration
- **WHEN** the application is deployed to Vercel
- **THEN** the vercel.json file declares cron schedules for `/api/cron/douyin-hot` (hourly) and `/api/cron/cleanup` (daily)
