# Deployment & Auth Setup

Stack (all free tier):

- **Frontend:** Cloudflare Pages
- **Backend:** Render (free web service — sleeps when idle, auto-wakes on request)
- **Database + Auth:** Supabase (Postgres + email/password auth)
- **Keep-alive:** GitHub Actions cron (every 3 days) so the free Supabase project never auto-pauses

---

## 1. Supabase configuration

1. **Auth → Sign In / Providers → Email:** make sure *Email* is enabled (email + password).
2. **Email confirmation:** **turn *"Confirm email"* OFF** for the friends-test. The app gates new users with its own admin-approval step (below), so the email round-trip is redundant — and Supabase's free email is rate-limited and spam-prone. (You can re-enable it later with custom SMTP if you want.)
3. **Auth → Policies / password:** set a minimum password length (8+ recommended). The login form enforces 8 client-side; set the server policy to match.
4. Grab these from **Project Settings → API**: the project URL and the `anon`/publishable key.
5. Grab the DB connection string from **Connect → Session pooler** (the `...pooler.supabase.com:5432` URL — IPv4, works from local + Render; the direct `db.<ref>...` host is IPv6-only). It includes your password.

## 2. Local development

**`backend/.env`** — fill in:

```
DATABASE_URL=...        # Supabase → Connect → Prisma (pooled)
SUPABASE_URL=...        # https://<ref>.supabase.co
SUPABASE_ANON_KEY=...   # anon / publishable key
ADMIN_EMAILS=you@example.com   # auto-approved + admin (comma-separated)
TRUSTED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
# (existing AI keys stay as-is)
```

**`frontend/.env`** — create it from `.env.example`:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=           # leave empty locally (Vite proxies /api)
```

Then push the schema and run:

```bash
cd backend
npx prisma generate
npx prisma db push                       # creates the tables in Supabase Postgres
npx prisma db execute --file prisma/rls.sql --schema prisma/schema.prisma   # lock down the Data API
cd ..
npm run dev               # frontend + backend together
```

> **Why `rls.sql`:** Supabase exposes the `public` schema via its Data API using the
> anon key (which ships to the browser). Without Row-Level Security, that API could
> read/write our tables directly, bypassing the Express authorization. `rls.sql`
> enables RLS with no policies, blocking the Data API; our backend connects as the
> `postgres` role and bypasses RLS, so it keeps working. Re-run it whenever you add
> a new table.

Visit http://localhost:5173 → you'll be redirected to `/login`. Sign up, and you're in.

## 3. Keep-alive (GitHub Actions)

Add two repo secrets under **Settings → Secrets and variables → Actions**:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

The workflow at `.github/workflows/supabase-keepalive.yml` runs every 3 days and can be triggered manually from the Actions tab. (GitHub disables scheduled workflows after 60 days with no commits — normal activity avoids this.)

## 4. Deploy the backend → Render

New **Web Service**, connected to the repo:

- **Root directory:** `backend`
- **Build command:** `npm install && npx prisma generate`
- **Start command:** `npm start`
- **Environment variables:** `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_EMAILS`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_MAPS_API_KEY`, `NODE_ENV=production`, and `TRUSTED_ORIGINS=https://<your-pages-domain>` (set after step 5). Render provides `PORT` automatically.

Run `npx prisma db push` once against the production DB (locally with the prod `DATABASE_URL`, or via a one-off Render shell), then apply `prisma/rls.sql` the same way (`npx prisma db execute --file prisma/rls.sql --schema prisma/schema.prisma`).

## 5. Deploy the frontend → Cloudflare Pages

- **Root directory:** `frontend`
- **Build command:** `npm install && npm run build`
- **Output directory:** `dist`
- **Environment variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_URL=https://<your-render-backend>.onrender.com`

After this deploys, set the backend's `TRUSTED_ORIGINS` (on Render) to the Cloudflare Pages URL and redeploy the backend so CORS allows it.

---

## Security checklist

- [x] All `/api` data routes require a valid Supabase access token
- [x] Backend verifies JWTs locally via `getClaims` (asymmetric signing keys)
- [x] Trip access resolved through `TripMember` on every read/write (owner + shared collaborators)
- [x] Nested routes (days/slots/ideas/costs/research/places/ai) ownership-checked per `tripId`;
      cross-day/cross-trip writes (reorder/move) validated
- [x] Owner-only actions (delete trip, manage collaborators) enforce the OWNER role
- [x] New users start **pending**; `requireApproved` blocks all data/AI routes until an admin approves (protects API budget)
- [x] No Supabase service role key in the app — invites resolve via our own `AppUser` table
- [x] RLS enabled on all public tables (`prisma/rls.sql`) so the Supabase Data API can't bypass backend authorization
- [x] Secrets in env vars / platform secret stores, never committed
- [x] CORS limited to known frontend origins
- [ ] Server-side password policy set in Supabase to match the 8-char client rule

## Accounts & approval

- Anyone can **sign up**, but new accounts are **pending** and see an "awaiting approval"
  screen — they can't create trips or trigger any AI/API calls until approved.
- Emails listed in `ADMIN_EMAILS` are auto-approved and become **admins**.
- Admins get an **Admin** link in the header → `/admin` to approve / revoke users.

## Sharing / collaboration

- A trip's creator is the **OWNER**; from the **Share** button they invite others by email as
  **EDITOR** (can edit) or **VIEWER**.
- You can invite an email **before** that person has signed up — the invite is claimed
  automatically the first time they log in with that email. (They still need admin approval.)
- The trip list shows trips you own *and* trips shared with you.
