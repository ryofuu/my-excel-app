# Gridline 学習ガイド

このガイドは、Gridlineの実装を通して表計算エンジンの内部構造を理解するための入口です。Microsoft Excelの非公開実装を解析・再現するものではありません。ExcelやGoogle Sheetsにも現れる一般的な問題を、小さく観察可能なモデルとして実装しています。

## まずこの一文から始める

> スプレッドシートは、セルの格子に見えるUIを持った、依存関係ベースの小さなプログラミング言語である。

この見方を具体例から組み立てるのが、[0. スプレッドシートは小さなプログラム](00-spreadsheet-is-a-program.md)です。最初にここを読み、セル編集を「値の上書き」ではなく「プログラムのソース変更と再実行」として捉えてください。

## 最初に持つモデル

表計算エンジンの中心は、画面の格子ではなく次の変換です。

```mermaid
flowchart LR
  Input["利用者の入力"] --> Revision["WorkbookRevision<br/>計算の正本"]
  Revision --> Compile["Formulaの解析<br/>依存グラフ構築"]
  Compile --> Recalculate["Dirty判定<br/>評価順の決定"]
  Recalculate --> Snapshot["CalculationSnapshot<br/>導出された値"]
  Snapshot --> View["セル表示とInspector"]
```

`WorkbookRevision` と `CalculationSnapshot` を分けて考えることが、全章の土台です。

- `WorkbookRevision`: 利用者が入力した内容の、ある時点の完全な状態
- `CalculationSnapshot`: 1つの`WorkbookRevision`から計算した、互いに整合する値と計算メタデータ
- `WorkbookChangeSet`: 1回の利用者操作で変更するセルの集合
- `CellContent`: 入力の正本。LiteralまたはFormula
- `CellValue`: 計算結果。Blank、Number、Text、Boolean、Error

正式な用語定義は[CONTEXT.md](../../CONTEXT.md)を参照してください。

## 読む順番

| 章 | 理解する問い | 主なコード |
| --- | --- | --- |
| [0. スプレッドシートは小さなプログラム](00-spreadsheet-is-a-program.md) | なぜセルの表に計算エンジンが必要なのか | 全体のMental Model |
| [1. 入力状態とRevision](01-source-state-and-revision.md) | 入力と計算結果をなぜ分けるのか | Entity、CellContent、WorkbookChangeSet |
| [2. 数式をデータとして読む](02-formula-language.md) | `=A1+B1`をどう解釈し、コピーするのか | tokenizer、parser、AST、translator |
| [3. 依存グラフと再計算](03-dependency-and-recalculation.md) | どのセルを、どの順番で再計算するのか | compileRevision、recalculate |
| [4. 永続化と同時編集](04-persistence-and-concurrency.md) | 複数セル操作と競合をどう原子的に扱うのか | HTTP Repository、Node SQLite |
| [5. コードを動かして追跡する](05-guided-code-walkthrough.md) | 1回の編集が全層をどう通るのか | Web adapter、Inspector、テスト |

## 動かしながら読む

```bash
pnpm install
pnpm dev
```

ブラウザでセルを選択すると、右側のInspectorに次が表示されます。

- FormulaSource
- Token
- AST
- PrecedentとDependent
- DirtyCell
- 評価順
- Errorと発生元

ドキュメントで概念を読み、Inspectorで状態を確認し、リンク先のコードで実装を読む、という往復を想定しています。

各章では、用語を暗記するのではなく、次の順番で考えます。

1. まず素朴に実装するとどうなるか
2. その実装がどのケースで壊れるか
3. 壊れ方を防ぐには、どの状態を分ける必要があるか
4. Gridlineのデータ構造が、その状態をどう表現しているか

## この実装の現在地

理解のため、実装済みの境界と未実装の最適化を区別します。

- 再計算は純粋な同期関数としてメインスレッドで実行します。
- SQLiteはNode serverが所有し、Webは4つのCRUD HTTP resourceを通してアクセスします。
- 変更のない値は前回のSnapshotから再利用します。
- Formulaの解析と依存グラフ構築は、現在はRevisionごとに全Formulaを対象に行います。
- Excel互換の暗黙的な型変換ではなく、意図的に単純なstrict type規則を使います。
- CalculationSnapshotは保存せず、WorkbookRevisionから再生成します。
- SQLiteは現在のRevisionを物理化して保存し、Revision履歴全体は保存しません。
- DBは`data/gridline.sqlite3`にあり、SQLite CLIで直接観察できます。
- クロスシート参照、配列数式、揮発性関数、反復計算、並列評価は未実装です。

この境界が見えることで、「次に何を実装すれば本物の表計算エンジンへ近づくか」も判断できます。
