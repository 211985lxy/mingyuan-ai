## 1. Database Schema

- [x] 1.1 Add `ActivationCode` model to Prisma schema with fields: id, code (unique), batchId, batchNote, status (unused/used), usedBy (optional User relation), usedAt, createdBy (AdminUser relation), createdAt. Add indexes on batchId, status, and code.
- [x] 1.2 Add `SystemSetting` model to Prisma schema with fields: id, key (unique), value (Text), type (string/number/boolean/json), category, description, updatedBy, updatedAt, createdAt.
- [x] 1.3 Add `activationCodes` relation to `User` model and `AdminUser` model in Prisma schema.
- [x] 1.4 Run `prisma generate` and create database migration.

## 2. Admin Console Layout

- [x] 2.1 Create `(admin)` route group with root layout at `app/(admin)/layout.tsx` — includes sidebar, main content area, and admin auth guard.
- [x] 2.2 Create admin sidebar component with navigation links: Dashboard, Users, Activation Codes, Templates, Settings. Highlight active page. Show admin name/role and logout at bottom.
- [x] 2.3 Create admin auth guard component that checks admin JWT on page load, redirects to login if missing/expired.
- [x] 2.4 Create admin auth store (Zustand) for admin token/user state, separate from user auth store.
- [x] 2.5 Create admin login page at `app/(admin)/login/page.tsx` with email/password form using existing `/api/admin/auth/login` endpoint.
- [x] 2.6 Create admin API client (`lib/api/admin-client.ts`) with auth header injection and endpoints for all admin APIs.
- [x] 2.7 Make sidebar responsive: full width on desktop (1024px+), icon-only with tooltips on tablet (768px-1023px).

## 3. User Management API

- [x] 3.1 Create `GET /api/admin/users` — paginated user list with search (name/email) and plan filter. Return user data with video count, avatar count, asset count aggregates.
- [x] 3.2 Create `GET /api/admin/users/[id]` — user detail with relations: ipProfile, assets, and scripts count.
- [x] 3.3 Create `GET /api/admin/users/stats` — aggregate statistics: total users, count by plan, new users this week.

## 4. User Management UI

- [x] 4.1 Create Users list page at `app/(admin)/users/page.tsx` — stat cards at top, data table with search bar and plan filter, pagination.
- [x] 4.2 Create User detail page at `app/(admin)/users/[id]/page.tsx` — user info card, IP profile summary, and asset/script counts.

## 5. Activation Code API

- [x] 5.1 Create `POST /api/admin/activation-codes/generate` — accepts quantity (1-500) and optional batchNote. Generates 12-char codes (A-Z2-9 excluding ambiguous chars), assigns batchId, saves to DB. Requires `admin` role.
- [x] 5.2 Create `GET /api/admin/activation-codes` — paginated list with status and batchId filters. Include user email for used codes via relation.
- [x] 5.3 Create `GET /api/admin/activation-codes/export` — stream CSV download with columns: Code, Status, Batch Note, Used By, Used At, Created At. Respects query filters.
- [x] 5.4 Create `GET /api/admin/activation-codes/stats` — return total, unused, used counts and usage rate.

## 6. Activation Code UI

- [x] 6.1 Create Activation Codes list page at `app/(admin)/activation-codes/page.tsx` — stat cards, data table with status/batch filters, CSV export button, generate button.
- [x] 6.2 Create "Generate Codes" dialog — quantity input (1-500), optional batch note, generate button with loading state. Show success count on completion.
- [x] 6.3 Format codes as `XXXX-XXXX-XXXX` in display. Show used-by email and used-at date for used codes. No delete action anywhere.

## 7. System Settings API

- [x] 7.1 Create `GET /api/admin/settings` — return all settings grouped by category.
- [x] 7.2 Create `PUT /api/admin/settings/[key]` — update setting value with type validation. Record updatedBy. Requires `admin` role.
- [x] 7.3 Create `POST /api/admin/settings` — create new setting with key uniqueness check. Requires `admin` role.
- [x] 7.4 Seed default settings on first run: `default-credits` (number, 100), `registration-enabled` (boolean, true), `max-videos-free` (number, 5), `max-videos-basic` (number, 50), `max-videos-pro` (number, 500).

## 8. System Settings UI

- [x] 8.1 Create Settings page at `app/(admin)/settings/page.tsx` — settings grouped by category tabs, inline edit controls matching value types (text input, number input, toggle, JSON editor).
- [x] 8.2 Create "Add Setting" dialog — form with key, value, type selector, category selector, description fields.

## 9. Admin Dashboard

- [x] 9.1 Create admin dashboard page at `app/(admin)/page.tsx` — overview with key metrics: total users, active codes, recent signups chart, system health indicators. Link to existing `/api/admin/dashboard` data plus new stats endpoints.
