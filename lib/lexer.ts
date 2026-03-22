// Lexical Analyzer

export type TokenType =
  | "KEYWORD"
  | "IDENTIFIER"
  | "NUMBER"
  | "OPERATOR"
  | "ASSIGN"
  | "LPAREN"
  | "RPAREN"
  | "SEMICOLON"
  | "EOF"
  | "ERROR";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export interface LexerError {
  message: string;
  line: number;
  column: number;
}

export interface LexerResult {
  tokens: Token[];
  errors: LexerError[];
}

const KEYWORDS = new Set(["var", "input", "output"]);
const OPERATORS = new Set(["+", "-", "*", "/"]);

export function tokenize(source: string): LexerResult {
  const tokens: Token[] = [];
  const errors: LexerError[] = [];

  let pos = 0;
  let line = 1;
  let column = 1;

  const advance = () => {
    const ch = source[pos++];
    if (ch === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
    return ch;
  };

  const peek = (offset = 0) => source[pos + offset];

  const makeToken = (
    type: TokenType,
    value: string,
    l: number,
    c: number
  ): Token => ({ type, value, line: l, column: c });

  while (pos < source.length) {
    const ch = source[pos];
    const startLine = line;
    const startCol = column;

    // Skip whitespace
    if (/\s/.test(ch)) {
      advance();
      continue;
    }

    // Handle comments
    if (ch === "/" && peek(1) === "*") {
      advance();
      advance();
      let closed = false;
      while (pos < source.length) {
        if (source[pos] === "*" && peek(1) === "/") {
          advance();
          advance();
          closed = true;
          break;
        }
        advance();
      }
      if (!closed) {
        errors.push({
          message: "Unterminated comment block",
          line: startLine,
          column: startCol,
        });
      }
      continue;
    }

    // Semicolon
    if (ch === ";") {
      advance();
      tokens.push(makeToken("SEMICOLON", ";", startLine, startCol));
      continue;
    }

    // Parentheses
    if (ch === "(") {
      advance();
      tokens.push(makeToken("LPAREN", "(", startLine, startCol));
      continue;
    }
    if (ch === ")") {
      advance();
      tokens.push(makeToken("RPAREN", ")", startLine, startCol));
      continue;
    }

    // Assignment operator
    if (ch === "=" && peek(1) !== "=") {
      advance();
      tokens.push(makeToken("ASSIGN", "=", startLine, startCol));
      continue;
    }

    // Arithmetic operators
    if (OPERATORS.has(ch)) {
      advance();
      tokens.push(makeToken("OPERATOR", ch, startLine, startCol));
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch)) {
      let num = "";
      while (pos < source.length && /[0-9]/.test(source[pos])) {
        num += advance();
      }
      tokens.push(makeToken("NUMBER", num, startLine, startCol));
      continue;
    }

    // Identifiers
    // Keywords
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = "";
      while (pos < source.length && /[a-zA-Z_0-9]/.test(source[pos])) {
        ident += advance();
      }
      const type = KEYWORDS.has(ident) ? "KEYWORD" : "IDENTIFIER";
      tokens.push(makeToken(type, ident, startLine, startCol));
      continue;
    }

    // Unrecognized characters
    errors.push({
      message: `Unexpected character '${ch}'`,
      line: startLine,
      column: startCol,
    });
    advance();
  }

  tokens.push(makeToken("EOF", "", line, column));
  return { tokens, errors };
}
