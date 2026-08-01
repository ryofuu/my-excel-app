# レイヤーをパッケージとディレクトリに対応させる

`packages/domain` は `entities`、`value-objects`、純粋な `services` だけを持つ。`packages/usecases` は Workbook と WorkbookRevision の CRUD use case と repository port を持ち、`packages/infra` は in-memory と SQLite WASM/OPFS の adapter を持つ。Web は `presentation` と composition 用の `infra` を分け、React component が domain を直接操作しない。依存方向を domain ← usecases ← infra ← Web に固定することで、計算の正本、操作、外部技術の境界をファイルパスから読めるようにする。
