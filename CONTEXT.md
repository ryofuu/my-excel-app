# Spreadsheet

セルに入力された値と数式から計算結果を得る、表計算の概念を扱うコンテキスト。特定製品の画面やファイル形式ではなく、表計算そのものの意味を明確にするために存在する。

## Language

**Spreadsheet**:
値や数式をセルに保持し、セル同士を参照して計算する表計算の仕組み全体。
_Avoid_: Workbook, Excel（前者は個別の文書、後者は特定の製品名を指すため）

**Workbook**:
変更不能な **WorkbookId** を持ち、1つ以上の **Worksheet** をまとめる、保存と計算の最上位単位。
_Avoid_: Spreadsheet, file

**WorkbookId**:
版が変わっても同じ **Workbook** であることを一意かつ永続的に識別する、変更不能な識別子。
_Avoid_: WorkbookRevision, WorksheetId

**WorkbookRevision**:
**Workbook** に属する **Worksheet** の順序と、各 **Cell** の **CellContent** からなる入力状態を一意に識別する版。**WorkbookChangeSet** が適用されるたびに1つ進む。
_Avoid_: WorkbookId, CalculationSnapshot, file version

**WorkbookChangeSet**:
1回の利用者操作として原子的に適用する、**CellContent** の作成・更新・削除、または変更後の順序を含む完全な **Worksheet** 集合。両方を同時に含めてもよい。編集の基になった **WorkbookRevision** を持ち、適用すると新しい版を作る。
_Avoid_: WorkbookRevision, individual keystroke, partial edit

**EditConflict**:
**WorkbookChangeSet** が変更しようとする **Cell** の **CellContent** が、編集の基になった **WorkbookRevision** より後に変更されている状態、または対象の **Worksheet** がその後に削除された状態。同じ版を基にした変更でも、対象のCellが重ならなければEditConflictではない。
_Avoid_: Parse error, Calculation Error, unrelated concurrent edit

**Worksheet**:
**Workbook** に属する、行と列で構成された二次元の表。変更不能な **WorksheetId** と、利用者が変更できる **WorksheetName** を持ち、複数の **Cell** を含む。
_Avoid_: Sheet, page, table

**WorksheetId**:
**Workbook** 内で **Worksheet** を一意かつ永続的に識別する、利用者が変更できない識別子。
_Avoid_: WorksheetName, sheet index

**WorksheetName**:
利用者が **Worksheet** を識別するための、変更可能かつ **Workbook** 内で一意な名前。
_Avoid_: WorksheetId, sheet index

**Cell**:
**Worksheet** 上の行と列で一意に特定される単位。設定されている場合は **CellContent** を持ち、その有無と内容に対応する **CellValue** を得る。
_Avoid_: Field, box

**CellAddress**:
1つの **Worksheet** 内で、行と列によって **Cell** の位置を一意に特定する識別子。
_Avoid_: CellId, CellReference, index

**CellId**:
**WorksheetId** と **CellAddress** の組によって、**Workbook** 内の **Cell** を一意に特定する識別子。
_Avoid_: CellAddress, CellReference

**CellReference**:
**Formula** から **Cell** を指し示す表現。行と列のそれぞれについて相対参照または絶対参照を持ち、**Formula** が置かれた位置を基準に **CellAddress** を解決する。
_Avoid_: CellAddress, RangeReference, pointer

**RangeReference**:
2つの **CellReference** を端点として、その間にある長方形領域の **Cell** を指し示す表現。単一の **CellValue** ではない。
_Avoid_: CellReference, CellValue, array

**Precedent**:
ある **Formula** が値を得るために参照する **Cell**。A1を参照するB1の式では、A1がB1のPrecedentである。
_Avoid_: Dependent, parent

**Dependent**:
ある **Cell** を参照する **Formula** を持つ別の **Cell**。A1を参照するB1の式では、B1がA1のDependentである。
_Avoid_: Precedent, child

**DirtyCell**:
**CellContent** の変更、またはPrecedentの変更によって、現在の **WorkbookRevision** に対応する **CellValue** を再計算する必要がある **Cell**。前回と同じ値になる場合もDirtyCellに含まれる。
_Avoid_: Changed value, edited cell

**CellContent**:
利用者が **Cell** に設定した内容。直接値である **Literal** または **Formula** のいずれかであり、計算後の **CellValue** とは区別する。
_Avoid_: CellValue, result

**Literal**:
**Formula** ではなく、**Cell** に直接設定された値。
_Avoid_: Formula, constant

**CellValue**:
**CellContent** またはその不在から得られ、別の **Formula** がセルを参照するときに利用する値。`Blank`、`Number`、`Text`、`Boolean`、`Error` のいずれかであり、**Formula** や範囲参照は含まない。ある **WorkbookRevision** に対する値は、同じ **CalculationSnapshot** にまとめられる。
_Avoid_: CellContent, formula

**Recalculation**:
特定の **WorkbookRevision** から、それに対応する **CalculationSnapshot** を得る過程。
_Avoid_: Edit, save, render

**CalculationSnapshot**:
単一の **WorkbookRevision** から得られた、互いに整合する **CellValue** の集合。**Workbook** 自体の複製ではない。
_Avoid_: WorkbookRevision, Workbook copy, partial result

**Blank**:
**CellContent** が設定されていない **Cell** を表す **CellValue**。数値の `0` および空文字とは異なる。
_Avoid_: Zero, empty text, null

**Error**:
**Formula** を正常な値として評価できなかったことを表す **CellValue**。原因を示すコードと発生元の **CellId** を持ち、参照する別の **Formula** へ伝わっても発生元を維持する。
_Avoid_: Exception, crash

**CircularReference**:
1つ以上の **Formula** が互いを参照し、有限の参照関係だけでは **CellValue** を定められない状態。この状態に属する **Cell** は対応する **Error** を持ち、その影響はDependentへ伝わる。
_Avoid_: Iteration, recursive function

**Formula**:
リテラル、演算、**CellReference**、**RangeReference** などを組み合わせ、セルの計算結果を定める **CellContent**。利用者が入力した **FormulaSource** を正本として持つ。
_Avoid_: Equation, function

**FormulaSource**:
利用者が入力した **Formula** の文字列表現。構文が不正な場合も入力内容を保ち、対応する **Error** を得る。
_Avoid_: Parsed expression, syntax tree, CellValue

## Example dialogue

開発者: 「この Spreadsheet は何を学ぶためのものですか？」

ドメイン専門家: 「Workbook 内の Worksheet にある Cell が Formula で別の Cell を参照し、入力の変更に応じて CellValue が変わる仕組みを学ぶためのものです。Formula は CellContent であり、計算後の CellValue とは区別します。」

開発者: 「複数セルの貼り付けでは、セルごとに版を作りますか？」

ドメイン専門家: 「いいえ。貼り付け全体を1つの WorkbookChangeSet として適用し、1つの WorkbookRevision と、それに対応する CalculationSnapshot を作ります。」

開発者: 「同じWorkbookRevisionからA1とZ1を別々に編集したら競合しますか？」

ドメイン専門家: 「対象のCellが重ならないためEditConflictにはしません。それぞれのWorkbookChangeSetを原子的に適用し、WorkbookRevisionを順に進めます。」
