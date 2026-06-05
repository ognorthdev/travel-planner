# Deployment & Auth Setup

Stack (all free tier):

- **Frontend:** Cloudflare Pages
- **Backend:** Render (free web service — sleeps when idle, auto-wakes on request)
- **Database + Auth:** Supabase (Postgres + email/password auth)
- **Keep-alive:** GitHub Actions cron (every 3 days) so the free Supabase project never auto-pauses

---

## 1. Supabase configuration

1. **Auth → Providers → Email:** make sure *Email* is enabled (email + password).
2. **Email confirmation:** for a quick friends-test, you can turn *"Confirm email"* off (instant sign-in). Leave it on for stronger security — the login page already handles the "check your email" case.
3. **Auth → Policies / password:** set a minimum password length (8+ recommended). The login form enforces 8 client-side; set the server policy to match.
4. Grab these from **Project Settings → API**: the project URL and the `anon` public key.
5. Grab the DB connection string from **Connect → ORMs → Prisma** (the pooled `...pooler.supabase.com` URL). It includes your password.

## 2. Local development

**`backend/.env`** — fill in:

```
DATABASE_URL=...        # Supabase → Connect → Prisma (pooled)
SUPABASE_URL=...        # https://<ref>.supabase.co
SUPABASE_ANON_KEY=...   # anon public key
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
psql "$DATABASE_URL" -f prisma/rls.sql   # lock down the Data API (see below)
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
- **Environment variables:** `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-side only — needed to invite collaborators by email), `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_MAPS_API_KEY`, `NODE_ENV=production`, and `TRUSTED_ORIGINS=https://<your-pages-domain>` (set after step 5). Render provides `PORT` automatically.

Run `npx prisma db push` once against the production DB (locally with the prod `DATABASE_URL`, or via a one-off Render shell), then apply `prisma/rls.sql` the same way.

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
- [x] Service role key used server-side only (collaborator email lookup); never sent to the client
- [x] RLS enabled on all public tables (`prisma/rls.sql`) so the Supabase Data API can't bypass backend authorization
- [x] Secrets in env vars / platform secret stores, never committed
- [x] CORS limited to known frontend origins
- [ ] Email confirmation enabled (optional, recommended for public launch)
- [ ] Server-side password policy set in Supabase to match the 8-char client rule

## Sharing / collaboration

- A trip's creator is the **OWNER**; they can invite others by email as **EDITOR** (can edit) or
  **VIEWER** from the **Share** button on the trip page.
- Invitees must already have a Travel Planner account with that email.
- The trip list shows trips you own *and* trips shared with you.
