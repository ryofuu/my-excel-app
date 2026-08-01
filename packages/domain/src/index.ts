export { brand, type Brand } from "./value-objects/brand";

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
} from "./value-objects/identifiers";

export {
  cellAddress,
  cellAddressEquals,
  cellId,
  cellIdParts,
  columnFromLabel,
  columnLabel,
  formatA1Address,
  isAddressWithin,
  parseA1Address,
  type CellAddress,
  type CellId,
  type CellIdParts,
} from "./value-objects/cell-address";

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
} from "./value-objects/cell-content";

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
} from "./value-objects/cell-value";

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
} from "./value-objects/workbook-change-set";

export {
  formatCellReference,
  type BinaryOperator,
  type CellReference,
  type Expression,
  type RangeReference,
  type UnaryOperator,
} from "./value-objects/formula/ast";

export { tokenizeFormula, type FormulaToken } from "./value-objects/formula/token";

export {
  parseFormula,
  referencesInExpression,
  type FormulaParseError,
  type FormulaParseResult,
} from "./value-objects/formula/parse";

export {
  translateFormula,
  type FormulaTranslation,
} from "./value-objects/formula/translate";

export {
  type CellDependency,
  type CompiledRevision,
  type Dependency,
  type DependencyGraph,
  type FormulaAnalysis,
  type RangeDependency,
  type RangeDependent,
} from "./derived/calculation/dependency-graph";

export {
  type CalculationTrace,
} from "./derived/calculation/calculation-trace";

export {
  valueInSnapshot,
  type CalculationSnapshot,
  type PreviousCalculation,
} from "./derived/calculation/calculation-snapshot";

export {
  compileRevision,
  dependenciesInExpression,
  dependentsOf,
} from "./services/calculation/compile-revision";

export { recalculate } from "./services/calculation/recalculate";
