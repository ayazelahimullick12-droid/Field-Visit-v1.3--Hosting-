-- Locations come from BRAC's branch API (api/src/locations).
-- Regions are BRAC's own and merged by name within each division, so a region name is unique
-- per division only (the same name can sit in two divisions).
DROP INDEX IF EXISTS "Region_name_key";
CREATE UNIQUE INDEX "Region_division_name_key" ON "Region"("division", "name");

-- A branch's BRAC branch ID, and every Division › Region › Area the API puts the office in.
ALTER TABLE "Office" ADD COLUMN "code" TEXT;
ALTER TABLE "Office" ADD COLUMN "placements" JSONB;

-- The API's rows as they arrive.
CREATE TABLE "ApiBranchRow" (
    "key" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "programName" TEXT,
    "data" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiBranchRow_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "ApiBranchRow_branchId_idx" ON "ApiBranchRow"("branchId");

-- Each sync or rebuild, and its report.
CREATE TABLE "LocationSync" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "message" TEXT,
    "report" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "LocationSync_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LocationSync_startedAt_idx" ON "LocationSync"("startedAt");
