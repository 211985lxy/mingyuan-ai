## Context

ClipFlow currently has an `AdminUser` model with JWT-based authentication and role-based access control (`editor` / `admin`). Existing admin APIs cover template management and dashboard stats. There is no admin-facing UI — all admin operations are API-only.

The admin console will be a new `(admin)` route group in the Next.js app, completely separate from the user-facing `(dashboard)` routes. It reuses the existing `withAdminAuth` middleware and admin JWT system.

**Current state:**
- `AdminUser` model exists in Prisma schema
- Admin auth API at `/api/admin/auth/login`
- Admin middleware `withAdminAuth()` in `lib/admin-auth.ts`
- Admin template APIs already follow the pattern we'll extend

## Goals / Non-Goals

**Goals:**
- Provide admin visibility into all users and their activity
- Enable activation-code-based access control with full audit trail
- Support runtime system configuration without code deploys
- Consistent admin UI built on shadcn/ui + existing design system

**Non-Goals:**
- Admin user CRUD (admins are seeded/managed via database for now)
- Real-time dashboards or WebSocket-based updates
- User impersonation or acting on behalf of users
- Activation code integration into user registration flow (separate change)
- Analytics or reporting beyond basic counts

## Decisions

### 1. Route group: `(admin)` separate from `(dashboard)`

Admin pages live under `app/(admin)/` with their own layout, sidebar, and auth guard. This keeps admin concerns fully isolated from the user-facing app.

**Alternative considered:** Nested under `(dashboard)/admin/` — rejected because admin and user layouts differ significantly and mixing them increases complexity.

### 2. ActivationCode model design

```prisma
model ActivationCode {
  id         String    @id @default(cuid())
  code       String    @unique
  batchId    String
  status     String    @default("unused")  // unused | used
  usedBy     String?
  usedAt     DateTime?
  createdBy  String
  createdAt  DateTime  @default(now())

  user       User?     @relation(fields: [usedBy], references: [id])
  admin      AdminUser @relation(fields: [createdBy], references: [id])

  @@index([batchId])
  @@index([status])
  @@index([code])
}
```

Key decisions:
- **No soft delete** — codes are immutable once created, enforced at API level (no DELETE endpoint).
- **12-char alphanumeric** — uppercase letters + digits, excluding ambiguous chars (0/O, 1/I/L) for readability. Format: `XXXX-XXXX-XXXX` displayed, stored without dashes.
- **batchId** — groups codes by generation batch for filtering and audit.
- **createdBy** references AdminUser who generated the batch.

### 3. SystemSetting as key-value store

```prisma
model SystemSetting {
  id          String   @id @default(cuid())
  key         String   @unique
  value       String   @db.Text
  type        String   @default("string")  // string | number | boolean | json
  category    String   @default("general")
  description String?
  updatedBy   String?
  updatedAt   DateTime @updatedAt
  createdAt   DateTime @default(now())
}
```

Simple key-value with typed values. Categories group related settings in the UI. This avoids a rigid config schema while keeping things manageable.

**Alternative considered:** JSON config file — rejected because it requires redeployment and doesn't support audit trails.

### 4. API pattern: extend existing admin route structure

All new APIs follow the established pattern:
- `GET /api/admin/users` — paginated list
- `GET /api/admin/users/[id]` — user detail with relations
- `POST /api/admin/activation-codes/generate` — batch generation
- `GET /api/admin/activation-codes` — paginated list with filters
- `GET /api/admin/activation-codes/export` — CSV download
- `GET/PUT /api/admin/settings` — read/write settings

All routes use `withAdminAuth()` middleware. User management is read-only (view, not edit). Activation code generation requires `admin` role.

### 5. CSV export: server-side streaming

Activation code CSV export is generated server-side and streamed as a download. This handles large datasets without memory issues and keeps the implementation simple.

## Risks / Trade-offs

- **[Risk] Large user base pagination** → Use cursor-based pagination for users API; offset-based is fine for activation codes (bounded by generation batches).
- **[Risk] Activation code collision** → 12-char from 32-char alphabet = 32^12 ≈ 10^18 combinations. Collision is astronomically unlikely, but we add a unique constraint and retry logic.
- **[Risk] Settings cache invalidation** → Settings are read infrequently by the admin; no caching needed initially. If user-facing code reads settings, add Redis cache later.
- **[Trade-off] No real-time updates** → Admin reloads to see changes. Acceptable for MVP; WebSocket can be added later if needed.
