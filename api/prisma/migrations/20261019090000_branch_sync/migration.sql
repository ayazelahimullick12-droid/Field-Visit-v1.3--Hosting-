-- BRAC's own divisions (from the ERP branch list, or added by the admin).
CREATE TABLE "Division" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalId" TEXT,
    "erpCode" TEXT,
    "source" TEXT NOT NULL DEFAULT 'admin',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Division_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Division_name_key" ON "Division"("name");
CREATE UNIQUE INDEX "Division_externalId_key" ON "Division"("externalId");

-- Where each region, area and office came from (the ERP or the admin) and its ERP ids.
ALTER TABLE "Region" ADD COLUMN "externalId" TEXT, ADD COLUMN "erpCode" TEXT, ADD COLUMN "source" TEXT NOT NULL DEFAULT 'admin';
CREATE UNIQUE INDEX "Region_externalId_key" ON "Region"("externalId");

ALTER TABLE "Area" ADD COLUMN "externalId" TEXT, ADD COLUMN "erpCode" TEXT, ADD COLUMN "source" TEXT NOT NULL DEFAULT 'admin';
CREATE UNIQUE INDEX "Area_externalId_key" ON "Area"("externalId");

ALTER TABLE "Office" ADD COLUMN "externalId" TEXT, ADD COLUMN "erpCode" TEXT, ADD COLUMN "source" TEXT NOT NULL DEFAULT 'admin', ADD COLUMN "sourceUpdatedAt" TEXT;
CREATE UNIQUE INDEX "Office_externalId_key" ON "Office"("externalId");
