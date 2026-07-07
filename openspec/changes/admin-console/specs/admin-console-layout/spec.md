## ADDED Requirements

### Requirement: Admin console has dedicated layout
The system SHALL provide a dedicated admin layout under the `(admin)` route group with a fixed sidebar and main content area. The layout SHALL be visually distinct from the user-facing dashboard to prevent confusion.

#### Scenario: Admin accesses console
- **WHEN** authenticated admin navigates to any admin page
- **THEN** system renders the admin layout with sidebar navigation and content area

#### Scenario: Unauthenticated access
- **WHEN** unauthenticated user navigates to an admin page
- **THEN** system redirects to admin login page

### Requirement: Admin sidebar navigation
The system SHALL display a sidebar with navigation links to: Dashboard (overview/stats), Users, Activation Codes, Templates (existing), Settings. The sidebar SHALL highlight the current active page. The sidebar SHALL show the admin user's name and role at the bottom.

#### Scenario: Navigate between sections
- **WHEN** admin clicks "Users" in the sidebar
- **THEN** system navigates to the Users page and highlights the Users link as active

#### Scenario: Show admin identity
- **WHEN** admin views the sidebar
- **THEN** sidebar displays the admin's name, role badge, and a logout button

### Requirement: Admin console has responsive layout
The system SHALL provide a responsive layout that works on desktop (1024px+) and tablet (768px+). On smaller viewports the sidebar SHALL collapse to an icon-only mode with a toggle to expand.

#### Scenario: Desktop view
- **WHEN** viewport width is 1024px or greater
- **THEN** sidebar is fully expanded with text labels

#### Scenario: Tablet view
- **WHEN** viewport width is between 768px and 1023px
- **THEN** sidebar collapses to icon-only mode with tooltip labels on hover

### Requirement: Admin auth guard protects all admin routes
The system SHALL verify admin JWT token on every admin page load. If the token is missing or expired, the system SHALL redirect to the admin login page. The auth guard SHALL use the existing `AdminUser` JWT system.

#### Scenario: Valid token
- **WHEN** admin with valid JWT navigates to an admin page
- **THEN** system renders the page normally

#### Scenario: Expired token
- **WHEN** admin with expired JWT navigates to an admin page
- **THEN** system redirects to admin login with a "Session expired" message

### Requirement: Admin login page
The system SHALL provide a login page at `/admin/login` with email and password fields. The login page SHALL use the existing `/api/admin/auth/login` endpoint. On success, the JWT token SHALL be stored and the admin SHALL be redirected to the admin dashboard.

#### Scenario: Successful login
- **WHEN** admin enters valid credentials and submits
- **THEN** system stores the JWT and redirects to admin dashboard

#### Scenario: Invalid credentials
- **WHEN** admin enters invalid credentials
- **THEN** system displays "Invalid email or password" error
