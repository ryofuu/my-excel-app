# classはEntityだけに使用する

`Workbook`、`WorkbookRevision`、`Worksheet`、`Cell` は同一性と不変条件を守るreadonly classとして実装し、それ以外のValue Object、数式構文木、計算結果、UseCase、Repository adapterはbranded primitive・readonly record・discriminated unionと関数で実装する。これによりEntityの境界を明示しつつ、計算処理を合成・テストしやすい純粋関数として保つ。ドメイン名に `Entity` や `VO` suffixは付けず、Web Worker境界の `Dto` やSQLite境界の `Row` など、ドメイン外の表現だけに境界を示すsuffixを付ける。Worker境界ではclass instanceを転送せずplain DTOを使用し、Worker外のadapterでEntityを復元する。
