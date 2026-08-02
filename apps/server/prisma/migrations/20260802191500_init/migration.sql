-- CreateTable
CREATE TABLE "workbooks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "current_revision" INTEGER NOT NULL CHECK ("current_revision" >= 0)
);

-- CreateTable
CREATE TABLE "worksheets" (
    "workbook_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL CHECK ("position" >= 0),

    PRIMARY KEY ("workbook_id", "id"),
    CONSTRAINT "worksheets_workbook_id_fkey" FOREIGN KEY ("workbook_id") REFERENCES "workbooks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cells" (
    "workbook_id" TEXT NOT NULL,
    "worksheet_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL CHECK ("row_number" > 0),
    "column_number" INTEGER NOT NULL CHECK ("column_number" > 0),
    "content_json" TEXT,
    "modified_revision" INTEGER NOT NULL CHECK ("modified_revision" >= 0),

    PRIMARY KEY ("workbook_id", "worksheet_id", "row_number", "column_number"),
    CONSTRAINT "cells_workbook_id_worksheet_id_fkey" FOREIGN KEY ("workbook_id", "worksheet_id") REFERENCES "worksheets" ("workbook_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "worksheets_workbook_id_position_key" ON "worksheets"("workbook_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "worksheets_workbook_id_name_key" ON "worksheets"("workbook_id", "name");

-- CreateIndex
CREATE INDEX "cells_by_workbook" ON "cells"("workbook_id", "worksheet_id", "row_number", "column_number");
