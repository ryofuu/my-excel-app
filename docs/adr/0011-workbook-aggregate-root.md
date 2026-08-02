# Workbookを集約ルートにする

`Workbook`と`WorkbookRevision`を別々に返す`WorkbookState`は、WorkbookIdと現在版の対応を不正な組み合わせとして表現できるため廃止する。`Workbook`が現在の`WorkbookRevision`を内包する集約ルートとなり、`WorkbookRevision`は版番号、Worksheetの順序、`content`と`modifiedRevision`を持つCell集合の不変条件を守る。RepositoryとUseCaseは完成した`Workbook`だけを受け渡し、永続化層で集約の整合性を組み立て直さない。
