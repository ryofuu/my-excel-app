# classはEntityだけに使用する

`Workbook`、`WorkbookRevision`、`Worksheet`、`Cell` は同一性と不変条件を守るreadonly classとして実装し、それ以外のValue Object、数式構文木、計算結果、UseCase、Repository実装はbranded primitive・readonly record・discriminated unionと関数で実装する。これによりEntityの境界を明示しつつ、計算処理を合成・テストしやすい純粋関数として保つ。Domain名に `Entity` や `VO` suffixは付けず、HTTP境界の`Resource`やPrisma境界の`Record`など、Domain外の表現だけに境界を示すsuffixを付ける。外部表現からはDomain factoryを通してEntityとValue Objectを復元する。
