export {
  MAX_COLUMN_NUMBER,
  MAX_ROW_NUMBER,
  columnNumber,
  revisionNumber,
  rowNumber,
  workbookId,
  workbookName,
  worksheetId,
  worksheetName,
  type ColumnNumber,
  type RevisionNumber,
  type RowNumber,
  type WorkbookId,
  type WorkbookName,
  type WorksheetId,
  type WorksheetName,
} from "./value-objects/identifiers.vo";

export {
  cellAddress,
  cellAddressEquals,
  cellId,
  cellIdParts,
  columnFromLabel,
  columnLabel,
  formatA1Address,
  isAddressWithin,
  parseCellId,
  parseA1Address,
  type CellAddress,
  type CellId,
  type CellIdParts,
} from "./value-objects/cell-address.vo";

export {
  booleanLiteral,
  cellContentEquals,
  formulaContent,
  formulaSource,
  literalContent,
  numberLiteral,
  parseCellInput,
  textLiteral,
  type CellContent,
  type FormulaSource,
  type Literal,
} from "./value-objects/cell-content.vo";

export {
  BLANK,
  cellValueEquals,
  errorValue,
  formatCellValue,
  isErrorValue,
  literalValue,
  type CellError,
  type CellErrorCode,
  type CellValue,
} from "./value-objects/cell-value.vo";

export {
  Cell,
  Workbook,
  WorkbookRevision,
  Worksheet,
  type CellProperties,
  type WorkbookProperties,
  type WorkbookRevisionProperties,
  type WorksheetProperties,
} from "./entities";

export {
  workbookChangeSet,
  type CellChange,
  type EditConflict,
  type WorkbookChangeSet,
} from "./value-objects/workbook-change-set.vo";

export {
  formatCellReference,
  type BinaryOperator,
  type CellReference,
  type Expression,
  type RangeReference,
  type UnaryOperator,
} from "./value-objects/formula/formula.ast";

export { tokenizeFormula, type FormulaToken } from "./value-objects/formula/formula.tokenizer";

export {
  parseFormula,
  referencesInExpression,
  type FormulaParseError,
  type FormulaParseResult,
} from "./value-objects/formula/formula.parser";

export {
  translateFormula,
  type FormulaTranslation,
} from "./value-objects/formula/formula.translator";

export {
  type CellDependency,
  type CompiledRevision,
  type Dependency,
  type DependencyGraph,
  type FormulaAnalysis,
  type RangeDependency,
  type RangeDependent,
} from "./derived/calculation/dependency-graph.derived";

export {
  type CalculationTrace,
} from "./derived/calculation/calculation-trace.derived";

export {
  valueInSnapshot,
  type CalculationSnapshot,
  type PreviousCalculation,
} from "./derived/calculation/calculation-snapshot.derived";

export {
  compileRevision,
  dependenciesInExpression,
  dependentsOf,
} from "./services/calculation/compile-revision.service";

export { recalculate } from "./services/calculation/recalculate.service";

export {
  createWorkbookRevision,
  type WorkbookRevisionCreation,
} from "./services/revision/create-workbook-revision.service";
