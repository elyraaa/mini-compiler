// Parser (Syntax Analyzer)

import { Token, TokenType } from "./lexer";

// AST Node Types
export type ASTNode =
  | ProgramNode
  | VarDeclNode
  | InputStmtNode
  | OutputStmtNode
  | AssignStmtNode
  | BinaryExprNode
  | NumberLiteralNode
  | IdentifierNode;

export interface ProgramNode {
  kind: "Program";
  body: StatementNode[];
}

export type StatementNode =
  | VarDeclNode
  | InputStmtNode
  | OutputStmtNode
  | AssignStmtNode;

export interface VarDeclNode {
  kind: "VarDecl";
  name: string;
  line: number;
  column: number;
}

export interface InputStmtNode {
  kind: "InputStmt";
  variable: string;
  line: number;
  column: number;
}

export interface OutputStmtNode {
  kind: "OutputStmt";
  expression: ExpressionNode;
  line: number;
  column: number;
}

export interface AssignStmtNode {
  kind: "AssignStmt";
  variable: string;
  expression: ExpressionNode;
  line: number;
  column: number;
}

export type ExpressionNode = BinaryExprNode | NumberLiteralNode | IdentifierNode;

export interface BinaryExprNode {
  kind: "BinaryExpr";
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
  line: number;
  column: number;
}

export interface NumberLiteralNode {
  kind: "NumberLiteral";
  value: number;
  line: number;
  column: number;
}

export interface IdentifierNode {
  kind: "Identifier";
  name: string;
  line: number;
  column: number;
}

// Parser Errors
export interface ParseError {
  message: string;
  line: number;
  column: number;
}

export interface ParseResult {
  ast: ProgramNode | null;
  errors: ParseError[];
}

// Recursive Descent Parser
export function parse(tokens: Token[]): ParseResult {
  let pos = 0;
  const errors: ParseError[] = [];

  // Helper Util
  const current = (): Token => tokens[pos] ?? tokens[tokens.length - 1];

  const peek = (): Token => tokens[pos];

  const isAtEnd = (): boolean => current().type === "EOF";

  const check = (type: TokenType, value?: string): boolean => {
    const tok = current();
    if (tok.type !== type) return false;
    if (value !== undefined && tok.value !== value) return false;
    return true;
  };

  const consume = (type: TokenType, value?: string): Token => {
    if (check(type, value)) {
      return tokens[pos++];
    }
    const tok = current();
    const expected = value ? `'${value}'` : type;
    const got =
      tok.type === "EOF" ? "end of file" : `'${tok.value}' (${tok.type})`;
    errors.push({
      message: `Expected ${expected} but got ${got}`,
      line: tok.line,
      column: tok.column,
    });
    // Error recovery
    return tok;
  };

  const synchronize = (): void => {
    while (!isAtEnd()) {
      if (current().type === "SEMICOLON") {
        pos++;
        return;
      }
      if (
        current().type === "KEYWORD" &&
        ["var", "input", "output"].includes(current().value)
      ) {
        return;
      }
      pos++;
    }
  };

  // Grammar Rules
  const parseProgram = (): ProgramNode => {
    const body: StatementNode[] = [];
    while (!isAtEnd()) {
      try {
        const stmt = parseStatement();
        if (stmt) body.push(stmt);
      } catch {
        synchronize();
      }
    }
    return { kind: "Program", body };
  };
  
  const parseStatement = (): StatementNode | null => {
    const tok = current();

    if (tok.type === "KEYWORD") {
      if (tok.value === "var") return parseVarDecl();
      if (tok.value === "input") return parseInputStmt();
      if (tok.value === "output") return parseOutputStmt();
    }

    if (tok.type === "IDENTIFIER") {
      return parseAssignStmt();
    }

    // if unknown statement
    errors.push({
      message: `Unexpected token '${tok.value}' at start of statement`,
      line: tok.line,
      column: tok.column,
    });
    synchronize();
    return null;
  };
  
  const parseVarDecl = (): VarDeclNode => {
    const kw = consume("KEYWORD", "var");
    const name = consume("IDENTIFIER");
    consume("SEMICOLON");
    return {
      kind: "VarDecl",
      name: name.value,
      line: kw.line,
      column: kw.column,
    };
  };

  
  const parseInputStmt = (): InputStmtNode => {
    const kw = consume("KEYWORD", "input");
    const varTok = consume("IDENTIFIER");
    consume("SEMICOLON");
    return {
      kind: "InputStmt",
      variable: varTok.value,
      line: kw.line,
      column: kw.column,
    };
  };
  
  const parseOutputStmt = (): OutputStmtNode => {
    const kw = consume("KEYWORD", "output");
    const expr = parseExpression();
    consume("SEMICOLON");
    return {
      kind: "OutputStmt",
      expression: expr,
      line: kw.line,
      column: kw.column,
    };
  };
  
  const parseAssignStmt = (): AssignStmtNode => {
    const varTok = consume("IDENTIFIER");
    consume("ASSIGN");
    const expr = parseExpression();
    consume("SEMICOLON");
    return {
      kind: "AssignStmt",
      variable: varTok.value,
      expression: expr,
      line: varTok.line,
      column: varTok.column,
    };
  };
  
  const parseExpression = (): ExpressionNode => {
    let left = parseTerm();

    while (
      check("OPERATOR", "+") ||
      check("OPERATOR", "-")
    ) {
      const op = tokens[pos++];
      const right = parseTerm();
      left = {
        kind: "BinaryExpr",
        operator: op.value,
        left,
        right,
        line: op.line,
        column: op.column,
      };
    }

    return left;
  };
  
  const parseTerm = (): ExpressionNode => {
    let left = parseFactor();

    while (
      check("OPERATOR", "*") ||
      check("OPERATOR", "/")
    ) {
      const op = tokens[pos++];
      const right = parseFactor();
      left = {
        kind: "BinaryExpr",
        operator: op.value,
        left,
        right,
        line: op.line,
        column: op.column,
      };
    }

    return left;
  };
  
  const parseFactor = (): ExpressionNode => {
    const tok = current();

    if (tok.type === "NUMBER") {
      pos++;
      return {
        kind: "NumberLiteral",
        value: parseInt(tok.value, 10),
        line: tok.line,
        column: tok.column,
      };
    }

    if (tok.type === "IDENTIFIER") {
      pos++;
      return {
        kind: "Identifier",
        name: tok.value,
        line: tok.line,
        column: tok.column,
      };
    }

    if (tok.type === "LPAREN") {
      pos++;
      const expr = parseExpression();
      consume("RPAREN");
      return expr;
    }

    // Error recovery for expressions
    errors.push({
      message: `Expected an expression, got '${tok.value}'`,
      line: tok.line,
      column: tok.column,
    });
    
    return {
      kind: "NumberLiteral",
      value: 0,
      line: tok.line,
      column: tok.column,
    };
  };

  const ast = parseProgram();
  return { ast: errors.length === 0 || ast.body.length > 0 ? ast : null, errors };
}
