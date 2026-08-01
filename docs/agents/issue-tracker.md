# Issue tracker: Local Markdown

このリポジトリの Issue と PRD は `.scratch/` 配下の Markdown ファイルとして管理する。

## 規約

- 1機能につき1ディレクトリ: `.scratch/<feature-slug>/`
- PRD: `.scratch/<feature-slug>/PRD.md`
- 実装 Issue: `.scratch/<feature-slug>/issues/<NN>-<slug>.md`。`NN` は `01` から連番にする
- triage 状態は各ファイル先頭付近の `Status:` 行に書く
- 会話・追記はファイル末尾の `## Comments` に追記する

## publish の意味

スキルが issue tracker への publish を求めた場合、対象 feature の `.scratch/<feature-slug>/` に Markdown を作成または更新する。

## 既存 ticket の参照

指定されたパスの Markdown を読み、用語は `CONTEXT.md`、設計判断は関係する ADR に従う。
