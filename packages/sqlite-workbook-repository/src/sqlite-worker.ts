import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

import {
  createWorkbookInDatabase,
  createWorkbookRevisionInDatabase,
  deleteWorkbookInDatabase,
  findWorkbookInDatabase,
  findWorkbookRevisionInDatabase,
  initializeDatabase,
} from "./database-repository";
import type { SqlDatabase } from "./sqlite-database";
import type {
  RepositoryCommand,
  RepositoryCommandResult,
  RepositoryWorkerRequest,
  RepositoryWorkerResponse,
} from "./worker-protocol";

type DatabaseConstructor = new (
  filename: string,
  flags?: string,
) => SqlDatabase;

type SqliteModule = Readonly<{
  oo1: Readonly<{
    DB: DatabaseConstructor;
    OpfsDb?: DatabaseConstructor;
    OpfsSAHPoolDb?: DatabaseConstructor;
  }>;
  installOpfsSAHPoolVfs?: (options?: Readonly<{
    name?: string;
    directory?: string;
    initialCapacity?: number;
  }>) => Promise<Readonly<{ OpfsSAHPoolDb?: DatabaseConstructor }>>;
}>;

type DatabaseHandle = Readonly<{
  database: SqlDatabase;
  storage: "opfs-sahpool" | "opfs" | "memory";
}>;

const memoryFilename = ":memory:";

const openDatabase = async (databaseName: string): Promise<DatabaseHandle> => {
  const sqlite3 = (await sqlite3InitModule()) as unknown as SqliteModule;

  try {
    const pool = await sqlite3.installOpfsSAHPoolVfs?.({
      name: "gridline-sahpool",
      directory: "gridline-sahpool",
      initialCapacity: 8,
    });
    const PoolDatabase = pool?.OpfsSAHPoolDb ?? sqlite3.oo1.OpfsSAHPoolDb;
    if (PoolDatabase) {
      return {
        database: new PoolDatabase(databaseName),
        storage: "opfs-sahpool",
      };
    }
  } catch {
    // Cross-origin isolation and SharedArrayBuffer are not always available.
  }

  try {
    if (sqlite3.oo1.OpfsDb) {
      return {
        database: new sqlite3.oo1.OpfsDb(databaseName),
        storage: "opfs",
      };
    }
  } catch {
    // A transient database still preserves all repository semantics in-session.
  }

  return {
    database: new sqlite3.oo1.DB(memoryFilename, "ct"),
    storage: "memory",
  };
};

let handlePromise: Promise<DatabaseHandle> | undefined;

const databaseFor = async (databaseName: string): Promise<DatabaseHandle> => {
  handlePromise ??= openDatabase(databaseName).then((handle) => {
    initializeDatabase(handle.database);
    return handle;
  });
  return handlePromise;
};

const executeCommand = async (
  command: RepositoryCommand,
): Promise<RepositoryCommandResult> => {
  const handle = await databaseFor(
    command.kind === "initialize" ? command.databaseName : "/gridline.sqlite3",
  );
  const database = handle.database;
  switch (command.kind) {
    case "initialize":
      return { kind: "initialized", storage: handle.storage };
    case "workbook.create":
      return {
        kind: "workbook.created",
        workbook: createWorkbookInDatabase(database, command.seed),
      };
    case "workbook.find":
      return {
        kind: "workbook.found",
        workbook: findWorkbookInDatabase(database, command.workbookId),
      };
    case "workbook.delete":
      deleteWorkbookInDatabase(database, command.workbookId);
      return { kind: "workbook.deleted" };
    case "revision.create":
      return {
        kind: "revision.created",
        result: createWorkbookRevisionInDatabase(database, command.changeSet),
      };
    case "revision.find":
      return {
        kind: "revision.found",
        revision: findWorkbookRevisionInDatabase(
          database,
          command.workbookId,
          command.revision,
        ),
      };
  }
};

const workerScope = globalThis as unknown as Readonly<{
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<RepositoryWorkerRequest>) => void,
  ) => void;
  postMessage: (message: RepositoryWorkerResponse) => void;
}>;

workerScope.addEventListener("message", (event) => {
  const request = event.data;
  void executeCommand(request.command)
    .then((result) => {
      workerScope.postMessage({
        requestId: request.requestId,
        ok: true,
        result,
      });
    })
    .catch((error: unknown) => {
      workerScope.postMessage({
        requestId: request.requestId,
        ok: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    });
});
