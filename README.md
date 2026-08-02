# Gridline

Excel の数式計算の仕組みを学ぶための、ブラウザ内スプレッドシート実装です。入力状態を `WorkbookRevision`、導出結果を `CalculationSnapshot` として分離し、右側の Inspector でパース・依存グラフ・dirty cells・評価順・エラー伝播を確認できます。下部のSheetタブでは、Worksheetの作成・切替・削除も試せます。

## 内部の仕組みを学ぶ

[学習ガイド](docs/learning/README.md)では、セル入力が `CellContent` として保存され、数式の字句解析・構文解析・依存グラフ構築・増分再計算を経て `CalculationSnapshot` になるまでを、実際のコードと対応づけて説明しています。

## 起動

```bash
pnpm install
pnpm dev
```

表示されたWebのローカルURLを開きます。`pnpm dev`はWebとNode serverを同時に起動し、入力状態を通常のSQLiteファイル`data/gridline.sqlite3`へ保存します。

DBの中身はSQLite CLIで直接確認できます。

```bash
sqlite3 data/gridline.sqlite3
.tables
SELECT * FROM cells;
```

## 確認コマンド

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 構成

| 配置 | 責務 |
| --- | --- |
| `core/domain` | Entity、Value Object、計算・Revision生成のDomain Service |
| `core/usecases` | 業務操作を組み立てるUseCaseとRepository port |
| `apps/server` | Hono HTTP resourceとPrisma Repository。SQLiteファイル`data/gridline.sqlite3`を所有 |
| `apps/web` | React UI、画面用UseCase、HTTP Repositoryをcomposition |

`core/domain ← core/usecases ← apps` の依存方向を保ちます。外部から来た不完全な値はWeb・HTTP境界でZodやDomain factoryを使って検証し、UseCaseには検証済みのEntity・Value Objectだけを渡します。主な配置は次のとおりです。

```text
core/domain/{entities,value-objects,derived,services}
core/usecases/{workbooks,workbook-revisions,ports,testing}
apps/server/{prisma,src/presentation/http,src/persistence/prisma}
apps/web/src/{usecases,presentation,persistence}
```

各ファイルは原則として `<concept>.<role>.ts(x)` で命名します。たとえば `workbook.entity.ts`、`cell-address.vo.ts`、`recalculate.service.ts`、`create-workbook.usecase.ts`、`http-workbook.repository.ts` です。`index.ts`、`main.tsx`、テスト、スタイルシートは慣例名を使います。

## 初期版の数式範囲

数値・文字列・TRUE/FALSE、A1/絶対参照、範囲、`+ - * / &`、比較、単項演算、括弧、`SUM` をサポートします。コピー時は相対参照だけを移動します。クロスシート参照、`IF`、日付、配列、揮発性関数、反復計算は意図的に未実装です。
