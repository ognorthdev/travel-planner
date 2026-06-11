-- Add account-level research context (AppUser) and trip-level research context (Trip).
ALTER TABLE "Trip" ADD COLUMN "researchContext" TEXT;
ALTER TABLE "AppUser" ADD COLUMN "researchContext" TEXT;
