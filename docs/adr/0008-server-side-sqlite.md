# SQLiteをNode serverの通常ファイルとして保存する

SQLite WASM、Dedicated Worker、OPFS VFSを廃止し、Node 24組み込みSQLiteを使う`apps/server`が`data/gridline.sqlite3`を所有する。Webは`SpreadsheetRepositories`のinterfaceを維持し、`POST /workbooks`、`GET/DELETE /workbooks/:workbookId`、`POST /workbook-revisions`のCRUD HTTP resourceを通して正本を読み書きする。Formulaのcompile、再計算、CalculationSnapshotとUI projectionはWeb側に残す。

このプロジェクトの目的は表計算エンジンの内部構造を理解することである。OPFS SAH Poolはブラウザ内永続化を可能にする一方、SQLiteファイルとtableを通常のtoolで観察できず、VFS・WASM・Worker fallbackが学習対象へ混ざる。server-side SQLiteなら、`sqlite3 data/gridline.sqlite3`でWorkbookRevisionの物理状態、Cell単位の`modified_revision`、削除tombstoneを直接観察できる。

serverへ接続できない場合にin-memory Repositoryへfallbackしない。保存されたように見える一時状態を作らず、接続Errorとして扱う。In-memory adapterはDomain・UseCaseのtest doubleとして残す。SQLiteには現在の入力Snapshotだけを保存し、CalculationSnapshot・AST・DependencyGraphは引き続き保存しない。

この判断は`0002-sqlite-wasm-opfs`を置き換える。
