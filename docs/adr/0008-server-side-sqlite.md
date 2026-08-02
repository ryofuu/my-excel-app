# SQLiteをNode serverの通常ファイルとして保存する

Node組み込みSQLiteを直接操作する実装は[0013-use-prisma-for-sqlite-persistence](0013-use-prisma-for-sqlite-persistence.md)で置き換えた。SQLiteファイルをserverが所有する判断は継続する。

SQLite WASM、Dedicated Worker、OPFS VFSを廃止し、Node 24組み込みSQLiteを使う`apps/server`が`data/gridline.sqlite3`を所有する。Webは`SpreadsheetRepositories`のinterfaceを維持し、`POST /workbooks`と`GET/PUT/DELETE /workbooks/:workbookId`のCRUD HTTP resourceを通して正本を読み書きする。`PUT`は完成したWorkbook集約と期待Revisionを受け取るcompare-and-swapであり、Revision生成はDomainが担当する。Formulaのcompile、再計算、CalculationSnapshotとUI projectionはWeb側に残す。

このプロジェクトの目的は表計算エンジンの内部構造を理解することである。OPFS SAH Poolはブラウザ内永続化を可能にする一方、SQLiteファイルとtableを通常のtoolで観察できず、VFS・WASM・Worker fallbackが学習対象へ混ざる。server-side SQLiteなら、`sqlite3 data/gridline.sqlite3`でWorkbookRevisionの物理状態、Cell単位の`modified_revision`、`content_json = NULL`として残る内容削除済みCellを直接観察できる。

serverへ接続できない場合にin-memory Repositoryへfallbackしない。保存されたように見える一時状態を作らず、接続Errorとして扱う。In-memory RepositoryはDomain・UseCaseのtest doubleとして残す。SQLiteには現在の入力Snapshotだけを保存し、CalculationSnapshot・AST・DependencyGraphは引き続き保存しない。

この判断は`0002-sqlite-wasm-opfs`を置き換える。
