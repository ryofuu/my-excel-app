import type { SqliteWorkbookRepositories } from "./sqlite-workbook-repositories.adapter";
import { createSqliteWorkbookRepositories } from "./sqlite-workbook-repositories.adapter";
import {
  createSqliteWorkerClient,
  type RepositoryWorkerClient,
} from "./worker/repository-worker.client";

export type BrowserRepositoriesOptions = Readonly<{
  databaseName?: string;
  client?: RepositoryWorkerClient;
}>;

/** Opens the dedicated Worker and waits until its storage backend is known. */
export const createBrowserRepositories = async (
  options: BrowserRepositoriesOptions = {},
): Promise<SqliteWorkbookRepositories & Readonly<{
  storage: "opfs-sahpool" | "opfs" | "memory";
}>> => {
  const client = options.client ?? createSqliteWorkerClient();
  const initialized = await client.execute({
    kind: "initialize",
    databaseName: options.databaseName ?? "/gridline.sqlite3",
  });
  if (initialized.kind !== "initialized") {
    client.dispose();
    throw new Error(`Expected initialized from SQLite worker, received ${initialized.kind}.`);
  }
  return {
    ...createSqliteWorkbookRepositories(client),
    storage: initialized.storage,
  };
};
