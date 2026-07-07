## ADDED Requirements

### Requirement: Admin can view paginated user list
The system SHALL display a paginated list of all registered users. Each row SHALL show: user name, email, plan, credits, video count, registration date, and last active date. The list SHALL support server-side pagination with 20 items per page.

#### Scenario: View user list
- **WHEN** admin navigates to the Users page
- **THEN** system displays a table of users sorted by creation date (newest first) with pagination controls

#### Scenario: Empty state
- **WHEN** no users exist in the system
- **THEN** system displays an empty state message "No users found"

### Requirement: Admin can search and filter users
The system SHALL allow admins to search users by name or email. The system SHALL allow filtering by plan type (all / free / basic / pro).

#### Scenario: Search by email
- **WHEN** admin types a search query in the search field
- **THEN** system filters the user list to show only users whose name or email contains the query

#### Scenario: Filter by plan
- **WHEN** admin selects a plan filter (e.g., "pro")
- **THEN** system shows only users with that plan type

#### Scenario: Combined search and filter
- **WHEN** admin applies both a search query and a plan filter
- **THEN** system shows users matching both criteria

### Requirement: Admin can view user detail
The system SHALL display a detail view for each user showing: full profile information, IP profile summary (if exists), list of video tasks with status, avatar count, asset count, and credit usage history.

#### Scenario: View user detail with all data
- **WHEN** admin clicks on a user row in the list
- **THEN** system navigates to a detail page showing the user's full information and associated resources

#### Scenario: View user detail with no IP profile
- **WHEN** admin views detail for a user without an IP profile
- **THEN** system shows "No IP profile created" in the IP profile section

### Requirement: User list shows aggregate statistics
The system SHALL display aggregate user statistics at the top of the users page: total users, users by plan breakdown, and new users this week.

#### Scenario: View user statistics
- **WHEN** admin navigates to the Users page
- **THEN** system displays stat cards showing total user count, count per plan type, and new users in the last 7 days
