import type {
  WorkbookChangeSetDto,
  WorkbookRevisionCreateDtoResult,
  WorkbookSeedDto,
  WorkbookStateDto,
} from "../sqlite-workbook.dto";

export type RepositoryCommand =
  | Readonly<{ kind: "initialize"; databaseName: string }>
  | Readonly<{ kind: "workbook.create"; seed: WorkbookSeedDto }>
  | Readonly<{ kind: "workbook.find"; workbookId: string }>
  | Readonly<{ kind: "workbook.delete"; workbookId: string }>
  | Readonly<{
      kind: "revision.create";
      changeSet: WorkbookChangeSetDto;
    }>;

export type RepositoryCommandResult =
  | Readonly<{ kind: "initialized"; storage: "opfs-sahpool" | "opfs" | "memory" }>
  | Readonly<{ kind: "workbook.created"; state: WorkbookStateDto }>
  | Readonly<{ kind: "workbook.found"; state: WorkbookStateDto | null }>
  | Readonly<{ kind: "workbook.deleted" }>
  | Readonly<{
      kind: "revision.created";
      result: WorkbookRevisionCreateDtoResult;
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
