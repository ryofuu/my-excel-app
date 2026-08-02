# CoreとApplication packageを分離する

`packages/spreadsheet`は独立配布・独立versioningする単位ではなく、このリポジトリが扱う共有Coreそのものなので廃止し、Domainを`core/domain`、UseCaseを`core/usecases`へ移す。WebとServerはruntime、依存関係、buildが異なる実行可能Applicationであるため、`apps/web`と`apps/server`のworkspace packageとして残す。業務フローはUseCaseへ置き、HTTPとPrisma/SQLiteのRepository実装だけを各Applicationの技術境界へ置く。この判断はADR 0007を置き換える。
