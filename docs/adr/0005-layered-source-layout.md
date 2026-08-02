# レイヤーをパッケージとディレクトリに対応させる

この文書のpackage分割に関する判断は `0007-consolidate-spreadsheet-package` で、ブラウザ内SQLiteに関する判断は `0008-server-side-sqlite` で置き換えた。レイヤーの依存方向に関する判断は継続する。

現在は単一の`packages/spreadsheet`内を`domain`、`usecases`、`infra`に分ける。`domain`は`entities`、`value-objects`、正本から再生成できる`derived`、純粋な`services`を持つ。`usecases`はWorkbookとWorkbookRevisionのCRUD use caseとrepository portを持ち、`infra`はin-memory、HTTP、SQLiteのadapterを持つ。Webは`presentation`とcomposition用の`infra`を分け、React componentがdomainを直接操作しない。依存方向をdomain ← usecases ← infra ← Web/Serverに固定することで、計算の正本、操作、派生状態、外部技術の境界をファイルパスから読めるようにする。
