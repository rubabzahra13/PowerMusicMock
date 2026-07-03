# Authentication

Power Music Ops uses **Supabase Auth** as the single source of truth for authentication and user storage. Roles are stored in a `profiles` table linked to `auth.users`.

## Architecture

| Role | Access | Auth pages |
|------|--------|------------|
| **Admin** (single account) | Full dashboard (`/`, `/new-requests`, `/directory`, etc.) | `/admin/login` only — no signup |
| **Manager** | Submission form only (`/submit`) | `/submit/login`, `/submit/signup` |

Sessions are persisted by Supabase in the browser (local storage). Users stay signed in until they log out or the session expires.

### Route protection

- Dashboard routes are wrapped in `RequireAdmin` — unauthenticated users go to `/admin/login`; managers are redirected to `/submit`.
- `/submit` is wrapped in `RequireManager` — unauthenticated users go to `/submit/login`.
- Admins may also access `/submit` (admin can access everything).

### Role assignment

- **Managers**: created via self-service signup. A database trigger assigns `role = 'manager'`.
- **Admin**: created only via the seed script using the Supabase **service role key**. A unique partial index enforces at most one admin row in `profiles`.

---

## Setup

### 1. Supabase project

Use your existing Supabase project (same one used for PostgreSQL).

### 2. Run the database migration

In **Supabase Dashboard → SQL → New query**, run:

```
supabase/migrations/001_profiles_and_auth.sql
```

This creates:

- `public.profiles` table (`id`, `email`, `full_name`, `role`)
- Trigger to auto-create manager profiles on signup
- Unique constraint ensuring only one admin
- RLS policies (users can read their own profile; cannot self-elevate role)

### 3. Supabase Auth settings (recommended)

In **Authentication → Providers → Email**:

- Enable **Email** provider
- For lowest friction during MVP/demo: disable **Confirm email** so managers can sign in immediately after signup
- For production: enable confirm email and keep the signup flow as-is (users will see a message to confirm before signing in)

In **Authentication → URL configuration**, set:

- **Site URL**: your deployed frontend URL (e.g. `https://your-app.vercel.app`)
- **Redirect URLs**: add local dev URL (`http://localhost:5173`) and production URL

No public admin signup is exposed in the app. Managers sign up at `/submit/signup`.

### 4. Frontend environment variables

Copy `.env.example` to `.env.local` in the project root:

```bash
cp .env.example .env.local
```

Fill in:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Find these in **Supabase Dashboard → Project Settings → API**.

Restart the Vite dev server after changing env vars.

### 5. Seed the admin account

The admin account is **not** created through the UI. Run the seed script once with the **service role key** (never commit this key or expose it in the frontend):

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
ADMIN_EMAIL=andrea@your-domain.com \
ADMIN_PASSWORD='YourStrongPasswordHere!' \
ADMIN_FULL_NAME=Andrea \
node scripts/seed-admin.mjs
```

Or use npm:

```bash
npm run seed:admin
```

(with the same env vars set in your shell or a local `.env` file loaded by your terminal)

If `ADMIN_PASSWORD` is omitted, the script generates a strong password and prints it once — save it securely before deployment.

The script is idempotent: if an admin already exists, it exits without creating another.

---

## Usage

### Admin (Andrea)

1. Open `/admin/login`
2. Sign in with the seeded email and password
3. Use the dashboard as normal
4. Sign out from the sidebar

There is no admin signup page. To add or replace the admin, use the seed script (only works when no admin exists) or Supabase Dashboard / Admin API.

### Managers

1. First visit: go to `/submit/signup`, create an account (email + password)
2. Later visits: go to `/submit/login` (or `/submit`, which redirects to login)
3. Submit requests at `/submit`
4. Sign out from the header on the submission page

---

## Changing the admin password

**Before deployment** (recommended):

Re-run the seed only if no admin exists yet, or set the password when seeding via `ADMIN_PASSWORD`.

**After deployment**:

1. **Supabase Dashboard → Authentication → Users** → select the admin user → reset password, or
2. Use the Admin API / a one-off script with `supabase.auth.admin.updateUserById(userId, { password: '...' })`

---

## Files added/changed

| Path | Purpose |
|------|---------|
| `src/lib/supabaseClient.js` | Supabase browser client |
| `src/contexts/AuthContext.jsx` | Session state, sign in/up/out, role from `profiles` |
| `src/components/auth/RequireAuth.jsx` | Admin/manager route guards |
| `src/components/auth/AuthLayout.jsx` | Shared auth page UI |
| `src/pages/auth/AdminLogin.jsx` | Admin login |
| `src/pages/auth/ManagerLogin.jsx` | Manager login |
| `src/pages/auth/ManagerSignup.jsx` | Manager signup |
| `src/App.jsx` | Protected routes |
| `src/main.jsx` | `AuthProvider` wrapper |
| `src/components/layout/Sidebar.jsx` | User display + logout |
| `src/pages/ManagerForm.jsx` | Header logout |
| `supabase/migrations/001_profiles_and_auth.sql` | DB schema + RLS |
| `scripts/seed-admin.mjs` | One-time admin seed |
| `.env.example` | Frontend env template |

---

## Backend API (future)

When the FastAPI backend is wired to the frontend, protect API routes by validating the Supabase JWT (`Authorization: Bearer <access_token>`) and checking `profiles.role` for admin-only endpoints. The frontend can pass `session.access_token` from `useAuth().session`.

---

## Security notes

- The **anon key** is safe in the frontend; RLS prevents clients from changing roles.
- The **service role key** must only be used server-side or in local seed scripts — never in `VITE_*` variables.
- Only one admin is enforced at the database level.
- Manager signup always creates `role = 'manager'`; users cannot self-assign admin.
- Use a strong, unique admin password and rotate it before production go-live.
