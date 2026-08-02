# スプレッドシート本体を1 packageに統合する

この判断は[0010-core-and-application-packages](0010-core-and-application-packages.md)で置き換えた。

`domain`、`usecases`、`infra` は独立配布・独立versioningされる単位ではなく、単一のWebアプリから同時に利用されるスプレッドシート本体である。そのため3つのworkspace packageを `@gridline/spreadsheet` に統合し、責務の違いは `src/domain`、`src/usecases`、`src/infra` のmodule境界で表す。外部には `@gridline/spreadsheet/domain`、`@gridline/spreadsheet/usecases`、`@gridline/spreadsheet/infra` のsubpathだけを公開する。

内部依存は `domain ← usecases ← infra` に固定する。React/Viteを持つ `apps/web` とNode SQLiteを持つ`apps/server`は別packageとして残し、スプレッドシート本体をUI・server技術から分離する。旧SQLite Dedicated Worker境界は[0008-server-side-sqlite](0008-server-side-sqlite.md)でHTTP Repository境界へ置き換えた。

別runtimeのconsumer、独立公開・versioning、別release cadence、package単位のCI、またはmodule規約では防げない逆依存が実在したときに再分割を検討する。その場合は水平レイヤーを機械的に3分割せず、純粋な数式計算を `@gridline/engine` として切り出すことを第一候補とする。この判断は `0005-layered-source-layout` のpackage分割を置き換える。
