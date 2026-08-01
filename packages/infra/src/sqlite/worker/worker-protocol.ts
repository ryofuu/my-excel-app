import type {
  WorkbookChangeSetDto,
  WorkbookDto,
  WorkbookRevisionCreateDtoResult,
  WorkbookRevisionDto,
  WorkbookSeedDto,
} from "../dto";

export type RepositoryCommand =
  | Readonly<{ kind: "initialize"; databaseName: string }>
  | Readonly<{ kind: "workbook.create"; seed: WorkbookSeedDto }>
  | Readonly<{ kind: "workbook.find"; workbookId: string }>
  | Readonly<{ kind: "workbook.delete"; workbookId: string }>
  | Readonly<{
      kind: "revision.create";
      changeSet: WorkbookChangeSetDto;
    }>
  | Readonly<{
      kind: "revision.find";
      workbookId: string;
      revision: number;
    }>;

export type RepositoryCommandResult =
  | Readonly<{ kind: "initialized"; storage: "opfs-sahpool" | "opfs" | "memory" }>
  | Readonly<{ kind: "workbook.created"; workbook: WorkbookDto }>
  | Readonly<{ kind: "workbook.found"; workbook: WorkbookDto | null }>
  | Readonly<{ kind: "workbook.deleted" }>
  | Readonly<{
      kind: "revision.created";
      result: WorkbookRevisionCreateDtoResult;
    }>
  | Readonly<{
      kind: "revision.found";
      revision: WorkbookRevisionDto | null;
    }>;

export type RepositoryWorkerRequest = Readonly<{
  requestId: string;
  command: RepositoryCommand;
}>;

export type RepositoryWorkerResponse =
  | Readonly<{
      requestId: string;
      ok: true;
      result: RepositoryCommandResult;
    }>
  | Readonly<{
      requestId: string;
      ok: false;
      error: Readonly<{ message: string }>;
    }>;
