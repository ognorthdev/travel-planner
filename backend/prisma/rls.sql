-- Lock down the Supabase Data API (PostgREST).
--
-- Our authorization is enforced in the Express backend (assertTripAccess), and
-- the backend connects as the privileged `postgres` role, which BYPASSES RLS.
-- But Supabase exposes the `public` schema via the Data API using the anon key
-- that we ship to the browser. Without RLS, anyone could read/write these
-- tables directly through /rest/v1/... and skip our backend entirely.
--
-- Enabling RLS with NO policies means the anon/authenticated roles see zero
-- rows through the Data API, while our backend (postgres role) is unaffected.
--
-- Run this AFTER `npx prisma db push`, and re-run if you add new tables:
--   psql "$DATABASE_URL" -f prisma/rls.sql
-- or paste it into the Supabase SQL editor.

ALTER TABLE "Trip"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TripMember"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Day"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Slot"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Idea"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiCost"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatSummary" ENABLE ROW LEVEL SECURITY;
