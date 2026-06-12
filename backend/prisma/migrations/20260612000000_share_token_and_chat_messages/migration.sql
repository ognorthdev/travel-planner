-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "shareToken" TEXT;

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessage_tripId_createdAt_idx" ON "ChatMessage"("tripId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_shareToken_key" ON "Trip"("shareToken");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Lock down the new table from the Supabase Data API (see prisma/rls.sql):
-- RLS with no policies = anon/authenticated roles see zero rows; the backend
-- connects as postgres which bypasses RLS.
ALTER TABLE "ChatMessage" ENABLE ROW LEVEL SECURITY;
