import { cellAddress, columnFromLabel } from "../cell-address";
import type { CellReference } from "./ast";

export type FormulaToken =
  | Readonly<{ kind: "number"; lexeme: string; value: number; start: number; end: number }>
  | Readonly<{ kind: "text"; lexeme: string; value: string; start: number; end: number }>
  | Readonly<{ kind: "boolean"; lexeme: string; value: boolean; start: number; end: number }>
  | Readonly<{
      kind: "reference";
      lexeme: string;
      reference: CellReference;
      start: number;
      end: number;
    }>
  | Readonly<{ kind: "identifier"; lexeme: string; name: string; start: number; end: number }>
  | Readonly<{ kind: "operator"; lexeme: string; start: number; end: number }>
  | Readonly<{ kind: "left-paren" | "right-paren" | "comma" | "colon"; lexeme: string; start: number; end: number }>
  | Readonly<{ kind: "invalid"; lexeme: string; message: string; start: number; end: number }>
  | Readonly<{ kind: "eof"; lexeme: ""; start: number; end: number }>;

const isAlpha = (value: string): boolean => /[A-Za-z]/.test(value);
const isIdentifierPart = (value: string): boolean => /[A-Za-z0-9_]/.test(value);
const isDigit = (value: string): boolean => /\d/.test(value);

const referenceAt = (source: string, start: number): { readonly token: FormulaToken; readonly end: number } | null => {
  const remaining = source.slice(start);
  const match = /^\$?([A-Za-z]+)\$?([1-9]\d*)/.exec(remaining);
  if (match === null) {
    return null;
  }

  const lexeme = match[0];
  const columnText = match[1];
  const rowText = match[2];
  if (lexeme === undefined || columnText === undefined || rowText === undefined) {
    return null;
  }

  const end = start + lexeme.length;
  if (isIdentifierPart(source[end] ?? "")) {
    return null;
  }

  try {
    const reference: CellReference = {
      address: cellAddress(Number(rowText), columnFromLabel(columnText)),
      columnAbsolute: lexeme.startsWith("$"),
      rowAbsolute: /\$\d+$/.test(lexeme),
    };
    return {
      token: { kind: "reference", lexeme, reference, start, end },
      end,
    };
  } catch (error) {
    return {
      token: {
        kind: "invalid",
        lexeme,
        message: error instanceof Error ? error.message : "Invalid cell reference.",
        start,
        end,
      },
      end,
    };
  }
};

const numberAt = (source: string, start: number): { readonly lexeme: string; readonly end: number } | null => {
  const match = /^(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?/.exec(source.slice(start));
  if (match === null || match[0] === undefined) {
    return null;
  }
  return { lexeme: match[0], end: start + match[0].length };
};

/** Lexes the formula body. FormulaSource's leading '=' is intentionally skipped. */
export const tokenizeFormula = (source: string): readonly FormulaToken[] => {
  if (!source.startsWith("=")) {
    return [
      {
        kind: "invalid",
        lexeme: source,
        message: "A formula must start with '='.",
        start: 0,
        end: source.length,
      },
      { kind: "eof", lexeme: "", start: source.length, end: source.length },
    ];
  }

  const tokens: FormulaToken[] = [];
  let position = 1;

  while (position < source.length) {
    const current = source[position];
    if (current === undefined) {
      break;
    }
    if (/\s/.test(current)) {
      position += 1;
      continue;
    }

    if (current === '"') {
      const start = position;
      position += 1;
      let value = "";
      let terminated = false;
      while (position < source.length) {
        const character = source[position];
        if (character === '"') {
          if (source[position + 1] === '"') {
            value += '"';
            position += 2;
            continue;
          }
          position += 1;
          terminated = true;
          break;
        }
        value += character;
        position += 1;
      }
      const lexeme = source.slice(start, position);
      if (!terminated) {
        tokens.push({
          kind: "invalid",
          lexeme,
          message: "Unterminated text literal.",
          start,
          end: position,
        });
      } else {
        tokens.push({ kind: "text", lexeme, value, start, end: position });
      }
      continue;
    }

    if (isDigit(current) || (current === "." && isDigit(source[position + 1] ?? ""))) {
      const numeric = numberAt(source, position);
      if (numeric !== null) {
        const value = Number(numeric.lexeme);
        if (Number.isFinite(value)) {
          tokens.push({
            kind: "number",
            lexeme: numeric.lexeme,
            value,
            start: position,
            end: numeric.end,
          });
        } else {
          tokens.push({
            kind: "invalid",
            lexeme: numeric.lexeme,
            message: "A numeric literal must be finite.",
            start: position,
            end: numeric.end,
          });
        }
        position = numeric.end;
        continue;
      }
    }

    if (current === "$" || isAlpha(current)) {
      const reference = referenceAt(source, position);
      if (reference !== null) {
        tokens.push(reference.token);
        position = reference.end;
        continue;
      }

      const start = position;
      while (isIdentifierPart(source[position] ?? "")) {
        position += 1;
      }
      if (position === start && current === "$") {
        position += 1;
        tokens.push({
          kind: "invalid",
          lexeme: current,
          message: "A '$' must be followed by a cell reference.",
          start,
          end: position,
        });
        continue;
      }
      const lexeme = source.slice(start, position);
      if (/^true$/i.test(lexeme)) {
        tokens.push({ kind: "boolean", lexeme, value: true, start, end: position });
      } else if (/^false$/i.test(lexeme)) {
        tokens.push({ kind: "boolean", lexeme, value: false, start, end: position });
      } else {
        tokens.push({ kind: "identifier", lexeme, name: lexeme.toUpperCase(), start, end: position });
      }
      continue;
    }

    const start = position;
    const pair = source.slice(position, position + 2);
    if (pair === "<=" || pair === ">=" || pair === "<>") {
      tokens.push({ kind: "operator", lexeme: pair, start, end: start + 2 });
      position += 2;
      continue;
    }
    if ("+-*/&=<>".includes(current)) {
      tokens.push({ kind: "operator", lexeme: current, start, end: start + 1 });
      position += 1;
      continue;
    }
    if (current === "(") {
      tokens.push({ kind: "left-paren", lexeme: current, start, end: start + 1 });
      position += 1;
      continue;
    }
    if (current === ")") {
      tokens.push({ kind: "right-paren", lexeme: current, start, end: start + 1 });
      position += 1;
      continue;
    }
    if (current === ",") {
      tokens.push({ kind: "comma", lexeme: current, start, end: start + 1 });
      position += 1;
      continue;
    }
    if (current === ":") {
      tokens.push({ kind: "colon", lexeme: current, start, end: start + 1 });
      position += 1;
      continue;
    }

    tokens.push({
      kind: "invalid",
      lexeme: current,
      message: `Unexpected character '${current}'.`,
      start,
      end: start + 1,
    });
    position += 1;
  }

  tokens.push({ kind: "eof", lexeme: "", start: source.length, end: source.length });
  return tokens;
};
