# Gridline — 数式計算エンジン中心の表計算学習アプリ

Status: ready-for-agent

## 課題

Excel や Google スプレッドシートはセル入力、数式の解析、参照関係、再計算、循環参照、保存、画面更新を一貫して扱う。しかし、完成品の表計算ソフトは対象が広すぎるため、内部の因果関係を追いながら学ぶには向かない。特に、利用者が入力した `CellContent` と計算後の `CellValue`、入力版である `WorkbookRevision` と結果集合である `CalculationSnapshot` を混同しない体験が必要である。

## 解決策

ブラウザだけで動作する小さく本格的な Spreadsheet を作る。利用者は Excel に近いグリッドで値と `Formula` を編集し、右側の Calculation Inspector で式の token、AST、Precedent、Dependent、DirtyCell、評価順、Error を確認できる。内部は深く独立した計算エンジン、関数型の application 層、SQLite WASM 永続化、React UI に分け、各層をテスト可能にする。

## ユーザーストーリー

1. 表計算を学ぶ開発者として、セルへ数値・文字列・真偽値・Formula を入力し、結果をすぐ確認したい。
2. 表計算を学ぶ開発者として、`=A1+B1` のような A1 参照がどの Cell を読むか理解するために、選択セルの Precedent を確認したい。
3. 表計算を学ぶ開発者として、入力変更がどの Formula を再計算させるか理解するために、Dependent と DirtyCell を確認したい。
4. 表計算を学ぶ開発者として、Formula の解釈を追うために、元の `FormulaSource`、token、AST を確認したい。
5. 表計算を学ぶ開発者として、`SUM(A1:A10)` が範囲をどのように扱うか理解するために、範囲依存を確認したい。
6. 利用者として、`+`、`-`、`*`、`/`、`&`、比較演算子、単項演算子、括弧、`SUM` を使って計算したい。
7. 利用者として、`$A$1`、`A$1`、`$A1` を使い、コピー時に相対参照だけが移動することを確認したい。
8. 利用者として、不正な Formula を修正できるように、構文が壊れていても元の `FormulaSource` を保持して Error を見たい。
9. 利用者として、循環参照とゼロ除算、型不一致、未定義参照を明確に区別した Error として確認したい。
10. 利用者として、空の Cell、数値の `0`、空文字列が別の `CellValue` であることを確認したい。
11. 利用者として、ある Cell を編集しても無関係な Formula を再計算しない様子を、評価順と DirtyCell で確認したい。
12. 利用者として、セルをクリック・キーボード移動・ダブルクリック・数式バーから編集し、Excel に近い操作感で学びたい。
13. 利用者として、シート名とステータスを持つ見慣れたワークスペースで、計算の仕組みに集中したい。
14. 利用者として、ブラウザを再読み込みしても Workbook の入力状態を保ちたい。
15. 複数編集を扱う利用者として、同一 Cell への競合だけを `EditConflict` とし、異なる Cell への変更は両方保存したい。
16. 将来の実装者として、計算が同期実装でも `CalculationSnapshot` 境界を維持し、将来 Worker/並列再計算へ置換できるようにしたい。

## 実装上の決定事項

- pnpm workspace を `web`、`spreadsheet-engine`、`spreadsheet-application`、`sqlite-workbook-repository` に分割する。依存方向は Web → application → engine とし、SQLite adapter は application の repository port を実装する。
- `Workbook`、`WorkbookRevision`、`Worksheet`、`Cell` だけを readonly class の Entity とする。識別子、参照、値、AST、依存、ChangeSet、Error は branded primitive、readonly record、discriminated union、関数で表す。名前に `Entity` / `VO` suffix は付けない。
- `WorkbookRevision` は Cell の入力状態と Worksheet 順序を表す。`CalculationSnapshot` はその版に対する値・DirtyCell・評価順・循環情報を表し、Workbook のコピーではない。
- Cell state は疎に保持し、content のない Cell は engine 上に materialize しない。削除は persistence 上で tombstone として `modifiedRevision` を残す。
- Formula の正本は `FormulaSource` であり、parse 結果、AST、依存グラフ、snapshot は派生データとして再生成する。
- Formula 初期範囲は number/text/boolean、A1 と混合絶対参照、矩形 range、四則演算、文字列連結、比較、単項演算、括弧、`SUM` とする。cross-sheet reference、名前付き範囲、配列、日付、IF、volatile function、反復計算は含めない。
- 依存グラフは Precedent/Dependent の両方向 index を保持する。Range はセル全展開せず symbolic `RangeDependency` として保持し、必要な reverse lookup を初期実装では走査する。
- Recalculation は変更 Cell とその transitive Dependent を DirtyCell にし、SCC により CircularReference を検出して Error 化し、残りを topological order で評価する。値が同じでも DirtyCell は評価する。
- Error は code と origin `CellId` を持つ構造化 `CellValue` とし、参照による伝播でも origin を保持する。Blank は 0 と空文字列から区別する。
- Repository の動詞は `create`、`find`、`delete` のみとする。`WorkbookChangeSet` の適用は新しい `WorkbookRevision` の `create` として表現する。
- 楽観的競合検出は ChangeSet の base revision と各 Cell の `modifiedRevision` を比較する。同じ Cell への変更・削除は conflict、異なる Cell の変更は同一 base revision からでも許可する。
- SQLite WASM は専用 Worker 上で動かし、OPFS `opfs-sahpool` VFS を優先する。利用不能な環境では in-memory SQLite に fallback し、UI が学習用途として使える状態を保つ。SQLite に保存するのは Workbook、Worksheet、Cell source state と revision counter のみである。
- UI は React、Vite、Tailwind CSS、shadcn/ui 系の primitive を使う。深い green を選択・primary に使う dense light theme とし、title bar、toolbar、name box、formula bar、custom grid、sheet tabs/status、右側 Inspector を配置する。
- Inspector は選択 Cell に対して FormulaSource、tokens、AST、Precedent、Dependent、DirtyCell、評価順、Error を表示し、再計算時には影響 Cell と Inspector を短く強調する。

## テスト方針

- 実装詳細ではなく、WorkbookRevision から CalculationSnapshot を得る外部振る舞いを保護する。
- 計算エンジンは parser/evaluator の小さな単体テストに加え、参照、range、Error 伝播、循環、DirtyCell、評価順、参照コピーを通す統合テストを厚く書く。
- application/repository は create/find/delete、atomic ChangeSet、tombstone、同一 Cell conflict、異なる Cell の並行変更を統合テストで保護する。
- SQLite Worker は schema/DTO/transaction を adapter 境界でテストし、OPFS 非対応時の fallback も検証する。
- UI は重要な編集・選択・formula bar・Inspector 表示だけを少数の E2E で確認する。見た目の細部はビルドと実ブラウザで確認する。
- 既存コードベースには参考となるテストがないため、この PRD と `CONTEXT.md` を振る舞いの正本とする。

## スコープ外

- Excel / Google スプレッドシートとの完全互換性
- cross-sheet reference、名前付き範囲、配列数式、日付、IF など初期 Formula 範囲外の機能
- RAND など volatile function と非決定的再計算
- iterative calculation と循環参照の収束計算
- 複数タブの同時編集、リモート共同編集、認証・サーバー同期
- ファイル import/export、印刷、セル書式、グラフ、ピボットテーブル
- durable revision history、undo/redo、共有データベース

## 補足

- このアプリの主目的は、完成品の表計算ソフトを代替することではなく、計算モデルを観察できる学習装置になることである。
- 用語は root の `CONTEXT.md` を正本にする。実装判断は `docs/adr/` を参照し、矛盾が必要になった場合は ADR を追加する。
- この PRD は既に `ready-for-agent` であり、実装・テスト・ブラウザ検証までを完了条件とする。
