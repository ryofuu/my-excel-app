# ファイル名に責務を表す suffix を付ける

ディレクトリだけでなく、単体のファイル名からも責務を読めるように、原則として `<concept>.<role>.ts` を使う。Domain の同一性を持つ class は `*.entity.ts`、Value Object は `*.vo.ts`、正本から再生成する状態は `*.derived.ts`、純粋な計算は `*.service.ts` とする。Use case は `*.usecase.ts`、境界契約は `*.port.ts`、Repository実装は `*.repository.ts`、変換表現は `*.resource.ts` / `*.row.ts` / `*.codec.ts`、生成責務は `*.factory.ts`、UI は `*.component.tsx` / `*.hook.ts` / `*.utility.ts` を使う。`adapter`のように実際の責務を隠す総称はファイル名へ使わない。

Entity の公開 class 名は ubiquitous language を保つため `Workbook` のままとし、`WorkbookEntity` にはしない。`index.ts`、アプリの bootstrap、型定義、テスト、スタイルシートはエコシステムで慣例化された名前を例外として使う。数式 AST・parser・tokenizer・translator のように Entity/VO ではないものへ `vo` suffix を付けない。これは `0004-classes-only-for-entities` の「domain 名には Entity/VO suffix を付けない」というファイル名に関する判断を置き換える。
