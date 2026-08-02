import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { revisionNumber, workbookId } from "@gridline/core/domain";
import {
  createCalculationObservation,
  type CalculationObservationRepositories,
} from "@gridline/core/usecases";

import {
  calculationObservationRequestSchema,
  calculationSnapshotResource,
} from "./calculation-snapshot.resource";
import {
  workbookFromResource,
  workbookPathSchema,
  workbookResource,
  workbookResourceSchema,
  workbookUpdateResourceSchema,
} from "./workbook.resource";

const errorBody = (message: string) => ({ error: { message } });

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : "Unexpected server error.";

export const createSpreadsheetHttpApp = (
  repositories: CalculationObservationRepositories,
) => {
  const app = new Hono();
  const repository = repositories.workbooks;

  app.post(
    "/api/workbooks",
    zValidator("json", workbookResourceSchema, (result, context) => {
      if (!result.success) {
        return context.json(errorBody(result.error.message), 400);
      }
    }),
    async (context) => {
      let workbook;
      try {
        // Zod は HTTP の形、Domain Factory は名前・識別子・Aggregate の不変条件を検証する。
        workbook = workbookFromResource(context.req.valid("json"));
      } catch (error) {
        return context.json(errorBody(messageOf(error)), 400);
      }
      const result = await repository.create(workbook);
      if (result.kind === "already-exists") {
        return context.json(errorBody("Workbook already exists."), 409);
      }
      return context.json(workbookResource(workbook), 201);
    },
  );

  app.get(
    "/api/workbooks/:id",
    zValidator("param", workbookPathSchema),
    async (context) => {
      let id;
      try {
        id = workbookId(context.req.valid("param").id);
      } catch (error) {
        return context.json(errorBody(messageOf(error)), 400);
      }
      const workbook = await repository.find(id);
      if (workbook === null) {
        return context.json(errorBody("Workbook not found."), 404);
      }
      return context.json(workbookResource(workbook));
    },
  );

  app.post(
    "/api/workbooks/:id/calculation-observations",
    zValidator("param", workbookPathSchema),
    zValidator("json", calculationObservationRequestSchema, (result, context) => {
      if (!result.success) {
        return context.json(errorBody(result.error.message), 400);
      }
    }),
    async (context) => {
      let id;
      let sourceRevision;
      try {
        id = workbookId(context.req.valid("param").id);
        sourceRevision = revisionNumber(
          context.req.valid("json").sourceRevision,
        );
      } catch (error) {
        return context.json(errorBody(messageOf(error)), 400);
      }

      // 保存済み観測値は読まず、指定Revisionから毎回新しいSnapshotを生成する。
      const result = await createCalculationObservation(repositories, {
        workbookId: id,
        sourceRevision,
      });
      switch (result.kind) {
        case "created":
          return context.json(calculationSnapshotResource(result.snapshot), 201);
        case "workbook-not-found":
          return context.json(errorBody("Workbook not found."), 404);
        case "revision-not-found":
          return context.json(
            errorBody("WorkbookRevision is no longer current."),
            409,
          );
      }
    },
  );

  app.put(
    "/api/workbooks/:id",
    zValidator("param", workbookPathSchema),
    zValidator("json", workbookUpdateResourceSchema, (result, context) => {
      if (!result.success) {
        return context.json(errorBody(result.error.message), 400);
      }
    }),
    async (context) => {
      let workbook;
      let expectedRevision;
      try {
        const resource = context.req.valid("json");
        workbook = workbookFromResource(resource.workbook);
        expectedRevision = revisionNumber(resource.expectedRevision);
      } catch (error) {
        return context.json(errorBody(messageOf(error)), 400);
      }
      // URL が示す Aggregate と Body の Aggregate が同一であることを境界で保証する。
      if (String(workbook.id) !== context.req.valid("param").id) {
        return context.json(
          errorBody("Path WorkbookId and body WorkbookId must match."),
          400,
        );
      }

      // HTTP 層は Repository の結果を Status Code へ翻訳するだけで、Revision の業務判断は持たない。
      const result = await repository.update(workbook, expectedRevision);
      switch (result.kind) {
        case "updated":
          return context.body(null, 204);
        case "concurrent-write":
          return context.json(errorBody("Workbook was updated concurrently."), 409);
        case "workbook-not-found":
          return context.json(errorBody("Workbook not found."), 404);
      }
    },
  );

  app.delete(
    "/api/workbooks/:id",
    zValidator("param", workbookPathSchema),
    async (context) => {
      let id;
      try {
        id = workbookId(context.req.valid("param").id);
      } catch (error) {
        return context.json(errorBody(messageOf(error)), 400);
      }
      await repository.delete(id);
      return context.body(null, 204);
    },
  );

  app.notFound((context) =>
    context.json(errorBody("Resource not found."), 404),
  );
  app.onError((error, context) =>
    context.json(errorBody(messageOf(error)), 500),
  );

  return app;
};

export type SpreadsheetHttpApp = ReturnType<
  typeof createSpreadsheetHttpApp
>;
