-- Division -> Region -> Area -> Branch (no districts).
-- Offices: the "district" column is now "region" (BRAC's own regions). Data is kept.
ALTER TABLE "Office" RENAME COLUMN "district" TO "region";

CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Region_name_key" ON "Region"("name");
CREATE UNIQUE INDEX "Area_regionId_name_key" ON "Area"("regionId", "name");
ALTER TABLE "Area" ADD CONSTRAINT "Area_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing data: each region and area the branches already use becomes a Region / Area, and the
-- office names the visit form used to make up ("<region> Region Office", "<area> Office") become
-- real Regional / Area Offices, so past visits still match. (A new, empty database skips this.)
INSERT INTO "Region" ("id", "name", "division")
SELECT 'RGN-' || upper(substr(md5("region"), 1, 8)), "region", min("division")
FROM "Office" WHERE "type" = 'branch' AND coalesce("region", '') <> ''
GROUP BY "region";

INSERT INTO "Area" ("id", "name", "regionId")
SELECT 'AREA-' || upper(substr(md5(o."region" || '::' || o."area"), 1, 8)), o."area", r."id"
FROM (SELECT DISTINCT "region", "area" FROM "Office" WHERE "type" = 'branch' AND coalesce("area", '') <> '') o
JOIN "Region" r ON r."name" = o."region";

INSERT INTO "Office" ("id", "name", "type", "division", "region", "active")
SELECT 'OFF-R' || upper(substr(md5("name"), 1, 7)), "name" || ' Region Office', 'region', "division", "name", true
FROM "Region";

INSERT INTO "Office" ("id", "name", "type", "division", "region", "area", "active")
SELECT 'OFF-A' || upper(substr(md5(r."name" || '::' || a."name"), 1, 7)), a."name" || ' Office', 'area', r."division", r."name", a."name", true
FROM "Area" a JOIN "Region" r ON r."id" = a."regionId";
