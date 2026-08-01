# レイヤーをパッケージとディレクトリに対応させる

この文書のpackage分割に関する判断は `0007-consolidate-spreadsheet-package` で置き換えた。レイヤーの依存方向に関する判断は継続する。

`packages/domain` は `entities`、`value-objects`、正本から再生成できる `derived`、純粋な `services` を持つ。`packages/usecases` は Workbook と WorkbookRevision の CRUD use case と repository port を持ち、`packages/infra` は in-memory と SQLite WASM/OPFS の adapter を持つ。Web は `presentation` と composition 用の `infra` を分け、React component が domain を直接操作しない。依存方向を domain ← usecases ← infra ← Web に固定することで、計算の正本、操作、派生状態、外部技術の境界をファイルパスから読めるようにする。
