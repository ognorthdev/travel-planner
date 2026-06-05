-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "coverImageUrl" TEXT,
    "mealPreferences" TEXT,
    "activityPreferences" TEXT,
    "modelConfig" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripMember" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCost" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "model" TEXT,
    "costCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Day" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dayNumber" INTEGER NOT NULL,

    CONSTRAINT "Day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Slot" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "data" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "Slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "data" TEXT NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSummary" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trip_userId_idx" ON "Trip"("userId");

-- CreateIndex
CREATE INDEX "TripMember_userId_idx" ON "TripMember"("userId");

-- CreateIndex
CREATE INDEX "TripMember_email_idx" ON "TripMember"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TripMember_tripId_email_key" ON "TripMember"("tripId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_userId_key" ON "AppUser"("userId");

-- CreateIndex
CREATE INDEX "AppUser_email_idx" ON "AppUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Day_tripId_dayNumber_key" ON "Day"("tripId", "dayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ChatSummary_tripId_key" ON "ChatSummary"("tripId");

-- AddForeignKey
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiCost" ADD CONSTRAINT "ApiCost_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Day" ADD CONSTRAINT "Day_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "Day"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSummary" ADD CONSTRAINT "ChatSummary_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row Level Security (locks the Supabase Data API; backend bypasses via postgres role)
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
ALTER TABLE "AppUser"     ENABLE ROW LEVEL SECURITY;
