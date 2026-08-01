# 入力状態と計算結果を分離する

`Workbook` は `CellContent` と `WorkbookRevision` を持ち、`Recalculation` はその版に対応する `CalculationSnapshot` を生成する。`CellValue` を入力と同じ可変状態へ格納する単純な方式は採用せず、再計算中に異なる版の結果が混ざらないことと、将来のバックグラウンド計算および並列化を可能にする境界を優先する。初期実装は単一スレッドかつ同期的でもよいが、この状態境界は維持する。
