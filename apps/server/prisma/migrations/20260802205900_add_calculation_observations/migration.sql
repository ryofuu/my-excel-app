-- CreateTable
CREATE TABLE "calculation_observations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workbook_id" TEXT NOT NULL,
    "source_revision" INTEGER NOT NULL CHECK ("source_revision" >= 0),
    "observed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "graph_json" TEXT NOT NULL,
    "trace_json" TEXT NOT NULL,
    CONSTRAINT "calculation_observations_workbook_id_fkey"
      FOREIGN KEY ("workbook_id") REFERENCES "workbooks" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "calculation_cell_values" (
    "observation_id" TEXT NOT NULL,
    "worksheet_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL CHECK ("row_number" > 0),
    "column_number" INTEGER NOT NULL CHECK ("column_number" > 0),
    "kind" TEXT NOT NULL,
    "number_value" REAL,
    "text_value" TEXT,
    "boolean_value" BOOLEAN,
    "error_code" TEXT,
    "error_origin_cell_id" TEXT,
    "error_message" TEXT,
    "formula_analysis_json" TEXT,
    PRIMARY KEY ("observation_id", "worksheet_id", "row_number", "column_number"),
    CONSTRAINT "calculation_cell_values_observation_id_fkey"
      FOREIGN KEY ("observation_id") REFERENCES "calculation_observations" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "calculation_cell_values_shape_check" CHECK (
      ("kind" = 'blank' AND "number_value" IS NULL AND "text_value" IS NULL AND "boolean_value" IS NULL AND "error_code" IS NULL AND "error_origin_cell_id" IS NULL AND "error_message" IS NULL)
      OR ("kind" = 'number' AND "number_value" IS NOT NULL AND "text_value" IS NULL AND "boolean_value" IS NULL AND "error_code" IS NULL AND "error_origin_cell_id" IS NULL AND "error_message" IS NULL)
      OR ("kind" = 'text' AND "number_value" IS NULL AND "text_value" IS NOT NULL AND "boolean_value" IS NULL AND "error_code" IS NULL AND "error_origin_cell_id" IS NULL AND "error_message" IS NULL)
      OR ("kind" = 'boolean' AND "number_value" IS NULL AND "text_value" IS NULL AND "boolean_value" IS NOT NULL AND "error_code" IS NULL AND "error_origin_cell_id" IS NULL AND "error_message" IS NULL)
      OR ("kind" = 'error' AND "number_value" IS NULL AND "text_value" IS NULL AND "boolean_value" IS NULL AND "error_code" IS NOT NULL AND "error_origin_cell_id" IS NOT NULL AND "error_message" IS NOT NULL)
    )
);

-- CreateIndex
CREATE INDEX "calculation_observations_by_revision"
ON "calculation_observations"("workbook_id", "source_revision", "observed_at");

-- CreateIndex
CREATE INDEX "calculation_values_by_cell"
ON "calculation_cell_values"("worksheet_id", "row_number", "column_number");
