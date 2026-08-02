import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      pathToFileURL(
        resolve(import.meta.dirname, "../../data/gridline.sqlite3"),
      ).href,
  },
});
