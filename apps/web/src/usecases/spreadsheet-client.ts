import {
  createWorkbook,
  createWorkbookRevision,
  findWorkbook,
  type SpreadsheetRepositories,
} from "@gridline/core/usecases";
import {
  Worksheet,
  cellIdParts,
  formatA1Address,
  recalculate,
  workbookChangeSet,
  type CellAddress,
  type CellId,
  type Workbook,
  type WorksheetId,
  worksheetId,
  worksheetName,
} from "@gridline/core/domain";

import type { SpreadsheetClient } from "@/usecases/spreadsheet-client.port";
import { createHttpSpreadsheetRepositories } from "@/persistence/http-workbook.repository";

import {
  formulaLaboratorySeed,
  formulaLaboratoryWorkbookId,
} from "./formula-laboratory.seed";
import {
  calculationInspection,
  workbookView,
  type CalculatedWorkbookState,
} from "./spreadsheet-view.projection";
import { cellChangesFromCommand } from "./workbook-revision.command";

type DisposableRepositories = SpreadsheetRepositories &
  Readonly<{ dispose?: () => void }>;

type RepositorySource = () => Promise<DisposableRepositories>;

type ClientLifecycle =
  | Readonly<{ kind: "idle" }>
  | Readonly<{
      kind: "opening";
      state: Promise<CalculatedWorkbookState>;
    }>
  | Readonly<{
      kind: "ready";
      state: CalculatedWorkbookState;
    }>
  | Readonly<{ kind: "disposed" }>;

const serverRepositorySource: RepositorySource = () =>
  Promise.resolve(createHttpSpreadsheetRepositories());

const cellAddressFor = (id: CellId): string =>
  formatA1Address(cellIdParts(id).address);

const calculatedState = (
  workbook: Workbook,
  previous?: CalculatedWorkbookState,
): CalculatedWorkbookState => ({
  // Workbook が正本であり、CalculationSnapshot はそこから都度導出する読み取りモデルである。
  workbook,
  snapshot: recalculate(
    workbook,
    previous === undefined
      ? undefined
      : { workbook: previous.workbook, snapshot: previous.snapshot },
  ),
});

/**
 * ブラウザ側の Workbook ライフサイクルを管理する。
 * 状態変更は必ず Repository 経由で確定してから、表示用 CalculationSnapshot を導出する。
 */
export function createSpreadsheetClient(
  repositorySource: RepositorySource = serverRepositorySource,
): SpreadsheetClient {
  let lifecycle: ClientLifecycle = { kind: "idle" };
  let repositoriesPromise: Promise<DisposableRepositories> | undefined;
  let activeWorksheetId: WorksheetId | undefined;

  const assertActive = (): void => {
    if (lifecycle.kind === "disposed") {
      throw new Error("Spreadsheet client was disposed.");
    }
  };

  const repositories = (): Promise<DisposableRepositories> => {
    assertActive();
    repositoriesPromise ??= repositorySource();
    return repositoriesPromise;
  };

  const openState = async (): Promise<CalculatedWorkbookState> => {
    const activeRepositories = await repositories();
    assertActive();
    const existing = await findWorkbook(
      activeRepositories,
      formulaLaboratoryWorkbookId,
    );
    assertActive();
    if (existing !== null) {
      return calculatedState(existing);
    }

    // 初回だけ Seed を保存する。同時起動で作成に負けた場合は、勝者が保存した状態を読み直す。
    const seed = formulaLaboratorySeed();
    const creation = await createWorkbook(activeRepositories, seed);
    if (creation.kind === "created") {
      assertActive();
      return calculatedState(seed);
    }
    const concurrent = await findWorkbook(
      activeRepositories,
      formulaLaboratoryWorkbookId,
    );
    assertActive();
    if (concurrent === null) {
      throw new Error("Workbook was concurrently removed during creation.");
    }
    return calculatedState(concurrent);
  };

  const readyState = (): Promise<CalculatedWorkbookState> => {
    // opening の Promise 自体を状態に持ち、複数コンポーネントからの同時 open を1回に束ねる。
    switch (lifecycle.kind) {
      case "ready":
        return Promise.resolve(lifecycle.state);
      case "opening":
        return lifecycle.state;
      case "disposed":
        return Promise.reject(new Error("Spreadsheet client was disposed."));
      case "idle": {
        const opening = openState();
        const tracked = opening.then(
          (state) => {
            assertActive();
            if (lifecycle.kind === "opening" && lifecycle.state === tracked) {
              lifecycle = { kind: "ready", state };
            }
            return state;
          },
          (error: unknown) => {
            if (lifecycle.kind === "opening" && lifecycle.state === tracked) {
              lifecycle = { kind: "idle" };
            }
            throw error;
          },
        );
        lifecycle = { kind: "opening", state: tracked };
        return tracked;
      }
    }
  };

  const activate = (
    source: Workbook,
    previous?: CalculatedWorkbookState,
  ): CalculatedWorkbookState => {
    assertActive();
    // 永続化に成功した Workbook だけを正本として採用し、その後に表示状態を再計算する。
    const state = calculatedState(source, previous);
    lifecycle = { kind: "ready", state };
    return state;
  };

  const activeWorksheetFor = (
    state: CalculatedWorkbookState,
    requestedId?: WorksheetId,
  ): WorksheetId => {
    const requested = requestedId ?? activeWorksheetId;
    if (requested !== undefined) {
      const exists = state.workbook.revision.worksheets.some(
        (worksheet) => worksheet.id === requested,
      );
      if (exists) return requested;
      if (requestedId !== undefined) {
        throw new Error(`Worksheet not found: ${requestedId}`);
      }
    }
    const first = state.workbook.revision.worksheets[0];
    if (first === undefined) {
      throw new Error("WorkbookRevision must contain at least one Worksheet.");
    }
    return first.id;
  };

  const view = (
    state: CalculatedWorkbookState,
    requestedId?: WorksheetId,
  ): ReturnType<typeof workbookView> => {
    activeWorksheetId = activeWorksheetFor(state, requestedId);
    return workbookView(state, activeWorksheetId);
  };

  const nextWorksheetName = (
    state: CalculatedWorkbookState,
  ): ReturnType<typeof worksheetName> => {
    const names = new Set(
      state.workbook.revision.worksheets.map((worksheet) => String(worksheet.name)),
    );
    let sequence = 1;
    while (names.has(`Sheet${sequence}`)) sequence += 1;
    return worksheetName(`Sheet${sequence}`);
  };

  return {
    async open(worksheetIdValue) {
      const state = await readyState();
      return view(state, worksheetIdValue);
    },

    async createWorksheet() {
      const current = await readyState();
      const worksheet = new Worksheet({
        id: worksheetId(`worksheet-${crypto.randomUUID()}`),
        name: nextWorksheetName(current),
      });
      const result = await createWorkbookRevision(
        await repositories(),
        // Worksheet 構造は差分命令ではなく、次 Revision の完全な順序付き一覧として渡す。
        workbookChangeSet({
          workbookId: current.workbook.id,
          baseRevision: current.workbook.revision.number,
          cellChanges: [],
          nextWorksheets: [...current.workbook.revision.worksheets, worksheet],
        }),
      );
      assertActive();
      if (result.kind !== "created") {
        throw new Error("The active WorkbookRevision is no longer available.");
      }
      const state = activate(result.workbook, current);
      return view(state, worksheet.id);
    },

    async deleteWorksheet() {
      const current = await readyState();
      if (current.workbook.revision.worksheets.length === 1) {
        throw new Error("Workbook must retain at least one Worksheet.");
      }
      const worksheetIdValue = activeWorksheetFor(current);
      const currentIndex = current.workbook.revision.worksheets.findIndex(
        (worksheet) => worksheet.id === worksheetIdValue,
      );
      const nextWorksheets = current.workbook.revision.worksheets.filter(
        (worksheet) => worksheet.id !== worksheetIdValue,
      );
      const nextActiveWorksheet =
        nextWorksheets[Math.max(0, currentIndex - 1)] ?? nextWorksheets[0];
      if (nextActiveWorksheet === undefined) {
        throw new Error("Workbook must retain at least one Worksheet.");
      }
      const result = await createWorkbookRevision(
        await repositories(),
        // 削除後の完全な一覧を渡すことで、Domain が最低1枚などの不変条件を検証できる。
        workbookChangeSet({
          workbookId: current.workbook.id,
          baseRevision: current.workbook.revision.number,
          cellChanges: [],
          nextWorksheets,
        }),
      );
      assertActive();
      if (result.kind !== "created") {
        throw new Error("The active WorkbookRevision is no longer available.");
      }
      const state = activate(result.workbook, current);
      return view(state, nextActiveWorksheet.id);
    },

    async createRevision(command) {
      const current = await readyState();
      const worksheetIdValue = activeWorksheetFor(current);
      // 入力種別ごとの Command を CellChange へ変換し、1操作を1つの ChangeSet にまとめる。
      const cellChanges = cellChangesFromCommand(
        current.workbook,
        worksheetIdValue,
        command,
      );
      if (cellChanges.length === 0) {
        return view(current);
      }
      // Domain で次状態を作り、Repository で確定できた場合だけ Client の状態を進める。
      const result = await createWorkbookRevision(
        await repositories(),
        workbookChangeSet({
          workbookId: current.workbook.id,
          baseRevision: current.workbook.revision.number,
          cellChanges,
        }),
      );
      assertActive();
      if (result.kind !== "created") {
        throw new Error(
          result.kind === "edit-conflict"
            ? `Edit conflict in ${result.conflictingCellIds.map(cellAddressFor).join(", ")}.`
            : "The active WorkbookRevision is no longer available.",
        );
      }
      const state = activate(result.workbook, current);
      return view(state);
    },

    async inspect(address: CellAddress) {
      const current = await readyState();
      return calculationInspection(
        current,
        activeWorksheetFor(current),
        address,
      );
    },

    async recalculate() {
      const current = await readyState();
      assertActive();
      // 明示的な再計算は正本を変更しないため、Revision の作成や永続化は行わない。
      const state: CalculatedWorkbookState = {
        workbook: current.workbook,
        snapshot: recalculate(current.workbook),
      };
      lifecycle = { kind: "ready", state };
      return view(state);
    },

    dispose() {
      if (lifecycle.kind === "disposed") return;
      lifecycle = { kind: "disposed" };
      void repositoriesPromise?.then(
        (activeRepositories) => activeRepositories.dispose?.(),
        () => undefined,
      );
    },
  };
}
