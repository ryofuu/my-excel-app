# ブラウザ永続化にSQLite WASMとOPFSを使用する

サーバーを設けずにブラウザ内で `Workbook` を永続化するため、専用Worker上のSQLite WASMと単一接続向けのOPFS `opfs-sahpool` VFSを使用する。アプリケーション層は `WorkbookRepository` のinterfaceだけに依存し、SQLiteには入力の正本を保存して、`CalculationSnapshot`・構文木・依存グラフなど再生成可能な派生データは保存しない。データベースはorigin-private領域に置かれるため、通常ファイルとの交換は将来の明示的なインポート・エクスポート機能として扱う。
