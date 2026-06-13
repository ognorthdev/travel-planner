-- CreateTable
CREATE TABLE "PlaceCache" (
    "id" TEXT NOT NULL,
    "queryKey" TEXT NOT NULL,
    "placeId" TEXT,
    "data" TEXT NOT NULL DEFAULT '{}',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaceCache_queryKey_key" ON "PlaceCache"("queryKey");

-- CreateIndex
CREATE INDEX "PlaceCache_placeId_idx" ON "PlaceCache"("placeId");
