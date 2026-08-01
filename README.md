# Gridline

Excel の数式計算の仕組みを学ぶための、ブラウザ内スプレッドシート実装です。入力状態を `WorkbookRevision`、導出結果を `CalculationSnapshot` として分離し、右側の Inspector でパース・依存グラフ・dirty cells・評価順・エラー伝播を確認できます。

## 起動

```bash
pnpm install
pnpm dev
```

表示されたローカル URL を開きます。SQLite WASM は Dedicated Worker 内で動作し、利用可能なら OPFS SAH pool、通常 OPFS、メモリの順に保存先を選びます。

## 確認コマンド

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 構成

| パッケージ | 責務 |
| --- | --- |
| `packages/spreadsheet-engine` | A1 参照・数式パース・依存グラフ・差分再計算・循環/型エラー |
| `packages/spreadsheet-application` | Repository port と Workbook/Revision の CRUD use case |
| `packages/sqlite-workbook-repository` | SQLite WASM Worker と OPFS 永続化アダプター |
| `apps/web` | Tailwind/shadcn 風の Excel ライク UI と Calculation Inspector |

## 初期版の数式範囲

数値・文字列・TRUE/FALSE、A1/絶対参照、範囲、`+ - * / &`、比較、単項演算、括弧、`SUM` をサポートします。コピー時は相対参照だけを移動します。クロスシート参照、`IF`、日付、配列、揮発性関数、反復計算は意図的に未実装です。
