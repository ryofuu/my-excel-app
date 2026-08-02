export type CellInputDraft = Readonly<{
  address: string;
  input: string;
}>;

export type WorkbookRevisionDraft =
  | Readonly<{
      kind: "set-cell-contents";
      inputs: readonly CellInputDraft[];
    }>
  | Readonly<{
      kind: "copy-cells";
      copies: readonly Readonly<{
        sourceAddress: string;
        targetAddress: string;
      }>[];
    }>;
