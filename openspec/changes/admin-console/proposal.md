## Why

ClipFlow lacks a management interface for operations. Admins cannot view user activity, manage access control, or configure system behavior without directly querying the database. As the user base grows, we need a proper admin console to handle user oversight, activation-code-based access control, and runtime configuration — all behind the existing admin auth system.

## What Changes

- Add **User Management** UI and API: paginated user list with search/filter, user detail view showing IP, plan, credits, video count, avatars, assets, and IP profile summary.
- Add **Activation Code** system (new Prisma model + API + UI): batch generation of 12-character alphanumeric codes, immutable after creation (no delete), status tracking (unused/used), CSV export, filterable list showing who redeemed each code and when.
- Add **System Settings** UI and API: key-value configuration store for runtime settings (plan limits, feature toggles, default credits, etc.) editable through the admin console.
- Add admin console layout with sidebar navigation under `(admin)` route group.

## Capabilities

### New Capabilities
- `admin-user-management`: View all users, search/filter, drill into user detail with associated resources (videos, avatars, assets, IP profile)
- `admin-activation-codes`: Batch generate 12-char codes, list with status filter, CSV export, view redemption info. Codes are immutable once created.
- `admin-system-settings`: Key-value configuration store for runtime system settings, editable via admin UI
- `admin-console-layout`: Shared admin layout with sidebar navigation, breadcrumbs, and admin auth guard

### Modified Capabilities

_None — this is a new, self-contained admin module._

## Impact

- **Database**: New `ActivationCode` and `SystemSetting` Prisma models; migration required.
- **API**: New admin API routes under `/api/admin/users`, `/api/admin/activation-codes`, `/api/admin/settings`.
- **Frontend**: New `(admin)` route group with layout, sidebar, and pages for each module.
- **Auth**: Leverages existing `AdminUser` model and `withAdminAuth` middleware — no auth changes needed.
- **Dependencies**: No new packages required; uses existing shadcn/ui + Lucide icons.
