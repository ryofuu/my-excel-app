# 4. 永続化と同時編集

計算エンジンが正しい値を返しても、複数セル操作が途中まで保存されたり、古い編集が新しい編集を上書きしたりするとWorkbookは壊れます。この章では、WorkbookChangeSetを原子的に保存し、Cell単位で競合を検出する仕組みを扱います。

## Workbook全体を1つのblobにすると何が起きるか

最初はWorkbookをJSONへ変換し、編集のたびに全体を保存する方法が簡単に見えます。

```text
workbook.json = {
  A1: ...,
  B1: ...,
  ...
}
```

しかしWorkbookが大きくなると、1Cellの変更でも全体を書き直します。さらに2つのClientが同じJSONを読み、別々のCellを編集して保存すると、後から保存したJSONが先の編集を消すlost updateになります。

```text
Client X: 古い全体 + A1変更 ──保存──┐
                                      ├─ 後勝ちで片方を失う
Client Y: 古い全体 + B1変更 ──保存──┘
```

GridlineはWorkbook全体ではなく、変更Cellの集合を保存単位にします。ただしCellを1個ずつ独立保存すると複数セル貼り付けが途中状態になるため、複数のCellChangeを1つのtransactionへまとめます。Worksheet構造を変える場合だけは、変更後の小さなWorksheet一覧を完全な順序付きSnapshotとして同じtransactionへ渡します。

つまり保存単位は「Workbook全体」でも「必ず1Cell」でもなく、「1回の利用者操作」です。

## Repository境界

UseCaseはSQLiteへ直接依存せず、[spreadsheet-repositories.port.ts](../../packages/spreadsheet/src/usecases/ports/spreadsheet-repositories.port.ts)のRepository interfaceだけを使います。

```mermaid
flowchart LR
  UI["React UI"] --> Client["SpreadsheetClient Adapter"]
  Client --> UseCase["createWorkbookRevision"]
  UseCase --> Port["WorkbookRevisionRepository"]
  Port --> HTTP["HTTP Repository Adapter"]
  Port --> Memory["In-memory Adapter"]
  HTTP --> Server["Node HTTP Server"]
  Server --> SQLite["Node SQLite Adapter"]
  SQLite --> File["data/gridline.sqlite3"]
```

Repositoryを交換しても、次の意味は同じです。

- 1つのWorkbookChangeSetから1つの次Revisionを作る
- ChangeSet全体を成功または失敗させる
- 同じCellへの古い編集をEditConflictにする
- 重ならない古い編集は受け入れる
- Worksheet構造変更は最新Revisionからだけ受け入れる

## SQLiteに保存するもの

[sqlite.schema.ts](../../packages/spreadsheet/src/infra/sqlite/sqlite.schema.ts)には3つのTableがあります。

| Table | 役割 |
| --- | --- |
| `workbooks` | WorkbookId、名前、現在のRevision番号 |
| `worksheets` | WorksheetId、名前、表示順 |
| `cells` | 座標、CellContent、最後に変更したRevision |

保存しないものは次のとおりです。

- CellValue
- TokenとAST
- DependencyGraph
- CalculationSnapshotとCalculationTrace

これらはWorkbookRevisionから再生成できる派生状態だからです。

## 論理Revisionと物理保存

DomainのWorkbookRevisionは、ある版の完全な入力状態です。ただし現在のSQLite実装はRevision履歴を行単位で保存していません。

```text
論理モデル:
  Revision 0 → Revision 1 → Revision 2

現在の物理モデル:
  workbooks.current_revision = 2
  cells = Revision 2を構成する現在のCell状態
```

`modified_revision`は各Cellが最後に変更された版を示し、競合検出に使います。過去版の復元やUndo履歴は現在の範囲外です。

## 原子的なChangeSet

[createWorkbookRevisionInDatabase](../../packages/spreadsheet/src/infra/sqlite/sqlite-workbook.repository.ts)は、1つのSQLite transaction内で次を行います。

1. WorkbookとbaseRevisionを検証する
2. Worksheet Snapshotがあれば、最新Revisionか、不変条件を満たすかを調べる
3. 変更対象Cellの`modified_revision`と所属Worksheetを調べる
4. 競合があれば何も書かずにEditConflictを返す
5. Worksheet行と変更Cell行を必要な分だけ更新する
6. `current_revision`を1つ進める
7. 完全な現在Revisionを読み返す

複数セル貼り付けの途中で失敗しても、一部だけ保存されません。

## Cell単位の楽観的競合検出

2つの利用者がRevision 0を開いているとします。

### 重ならない編集

```mermaid
sequenceDiagram
  participant X as Client X
  participant DB as Repository
  participant Y as Client Y
  X->>DB: base 0でA1を変更
  DB-->>X: Revision 1を作成
  Y->>DB: base 0でB1を変更
  Note over DB: B1はRevision 0以降未変更
  DB-->>Y: Revision 2を作成
```

YのbaseRevisionは古いですが、対象のB1は変更されていないため受け入れます。Workbook全体の版が古いだけで拒否すると、無関係な編集まで競合してしまいます。

### 同じCellへの編集

```mermaid
sequenceDiagram
  participant X as Client X
  participant DB as Repository
  participant Y as Client Y
  X->>DB: base 0でA1を変更
  DB-->>X: Revision 1を作成
  Y->>DB: base 0でA1を変更
  Note over DB: A1.modified_revision = 1 > base 0
  DB-->>Y: EditConflict(A1)
```

判定規則は次のとおりです。

```text
cell.modifiedRevision > changeSet.baseRevision
```

## 削除とtombstone

CellContentの削除は`content_json = NULL`として保存します。画面やWorkbookRevisionのCell Mapからは消えますが、`modified_revision`を持つ行は残します。

これがtombstoneです。tombstoneがなければ、Revision 2で削除されたA1に対して、Revision 1を基にした古い編集が「A1は存在しないから未変更」と誤判定されてしまいます。

## Worksheet構造の競合はCellとは別に考える

Worksheetの集合と順序は、個別Cellより広いWorkbook構造です。たとえば`[Sheet1, Sheet3]`を持つRevision 3を2つのClientが開き、一方がSheet2を追加し、もう一方が古い一覧からSheet1を削除したとします。

```text
Client X: base 3 → [Sheet1, Sheet3, Sheet2]
Client Y: base 3 → [Sheet3]
```

YのSnapshotを後からそのまま適用すると、Xが作ったSheet2まで消えます。逆に要素ごとの自動mergeは、「削除」と「維持」のどちらが利用者の意図かを判定できません。

そのため、`nextWorksheets`を持つWorkbookChangeSetは次の条件で扱います。

- 変更後の完全な順序付きWorksheet Snapshotとして解釈する
- 1つ以上のWorksheetを必須にする
- ID、名前、順序の重複や欠落を拒否する
- `baseRevision === currentRevision`の場合だけ適用する

一方、`nextWorksheets`を持たないCell変更は、従来どおりCell単位で競合を判定します。構造全体には厳しく、局所的なCell変更には並行性を残す設計です。

Worksheetを削除すると、SQLiteの外部キー`ON DELETE CASCADE`によって所属Cellも同じtransactionで削除されます。削除済みWorksheetへ古いClientがCell変更を送った場合は、そのCellを復活させずEditConflictを返します。

## Node serverと通常のSQLiteファイル

ブラウザはSQLiteへ直接アクセスしません。[http-spreadsheet-repositories.adapter.ts](../../packages/spreadsheet/src/infra/http/http-spreadsheet-repositories.adapter.ts)が、Repository interfaceを4つのHTTP resourceへ変換します。

```text
POST   /api/workbooks
GET    /api/workbooks/:workbookId
DELETE /api/workbooks/:workbookId
POST   /api/workbook-revisions
```

[spreadsheet-http-server.factory.ts](../../apps/server/src/presentation/http/spreadsheet-http-server.factory.ts)はDTOを受け取り、[node-sqlite.database.ts](../../apps/server/src/infra/sqlite/node-sqlite.database.ts)を通してNode 24組み込みSQLiteを使います。DBはリポジトリ直下の`data/gridline.sqlite3`です。

```bash
sqlite3 data/gridline.sqlite3
.schema
SELECT * FROM workbooks;
SELECT * FROM worksheets;
SELECT * FROM cells;
```

通常ファイルなので、ブラウザ固有のOPFSやVFSを理解しなくても、保存された正本と`modified_revision`を直接観察できます。serverへ接続できない場合はmemoryへfallbackせず、UIへ接続Errorを返します。永続化されたように見える一時状態を作らないためです。

## 再計算との接続

保存と再計算は、次の順番です。

```text
Cell入力
  → WorkbookChangeSetを作成
  → HTTP Repository
  → server上のSQLite transaction
  → 新しいWorkbookRevisionを取得
  → 前Revisionと前Snapshotを渡してrecalculate
  → 新しいCalculationSnapshotをUIへ投影
```

正本を先に確定し、そのRevisionからSnapshotを作るため、「保存は失敗したが画面の計算値だけ更新された」という状態を避けられます。

## この章で押さえること

1. Repositoryは保存技術ではなく、Revision作成の意味を抽象化する境界である。
2. 複数セル操作は1 transaction、1 WorkbookChangeSet、1 Revisionである。
3. 競合はWorkbook全体ではなく、変更対象Cellの最終変更版で判定する。
4. Worksheet構造は完全なSnapshotとして、最新Revisionからだけ変更する。
5. Cell削除後の競合検出にはtombstoneが必要である。
6. Worksheet削除では所属Cellも同じtransactionで削除する。
7. 保存するのは正本だけで、計算結果は再生成する。
8. DBファイルはserverが所有し、WebはRepository契約だけを見る。
