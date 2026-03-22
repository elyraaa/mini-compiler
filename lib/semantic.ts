// Semantic Analyser


import {
  ProgramNode,
  StatementNode,
  ExpressionNode,
  ASTNode,
} from "./parser";

export interface SemanticError {
  message: string;
  line: number;
  column: number;
  severity: "error" | "warning";
}

export interface SymbolEntry {
  name: string;
  type: "int"; // All variables are integers per Rule 5
  declaredAt: { line: number; column: number };
  initialized: boolean;
}

export type SymbolTable = Map<string, SymbolEntry>;

export interface SemanticResult {
  errors: SemanticError[];
  symbolTable: SymbolTable;
}

/**
 * Analyzes the AST for semantic correctness.
 * Populates and returns the symbol table.
 */
export function analyze(ast: ProgramNode): SemanticResult {
  const errors: SemanticError[] = [];
  const symbolTable: SymbolTable = new Map();

  // ── Statement Analysis ────────────────────────────────────
  for (const stmt of ast.body) {
    analyzeStatement(stmt);
  }

  function analyzeStatement(stmt: StatementNode): void {
    switch (stmt.kind) {
      case "VarDecl":
        // Check for duplicate declaration
        if (symbolTable.has(stmt.name)) {
          errors.push({
            message: `Variable '${stmt.name}' has already been declared`,
            line: stmt.line,
            column: stmt.column,
            severity: "error",
          });
        } else {
          symbolTable.set(stmt.name, {
            name: stmt.name,
            type: "int",
            declaredAt: { line: stmt.line, column: stmt.column },
            initialized: false,
          });
        }
        break;

      case "InputStmt":
        // Variable must be declared before input
        if (!symbolTable.has(stmt.variable)) {
          errors.push({
            message: `Variable '${stmt.variable}' used in 'input' before declaration`,
            line: stmt.line,
            column: stmt.column,
            severity: "error",
          });
        } else {
          // Mark as initialized after input
          const entry = symbolTable.get(stmt.variable)!;
          symbolTable.set(stmt.variable, { ...entry, initialized: true });
        }
        break;

      case "OutputStmt":
        // Analyze the expression
        analyzeExpression(stmt.expression);
        break;

      case "AssignStmt":
        // Left-hand variable must be declared
        if (!symbolTable.has(stmt.variable)) {
          errors.push({
            message: `Assignment to undeclared variable '${stmt.variable}'`,
            line: stmt.line,
            column: stmt.column,
            severity: "error",
          });
        } else {
          // Analyze RHS expression, then mark LHS as initialized
          analyzeExpression(stmt.expression);
          const entry = symbolTable.get(stmt.variable)!;
          symbolTable.set(stmt.variable, { ...entry, initialized: true });
        }
        break;
    }
  }

  // ── Expression Analysis ───────────────────────────────────
  function analyzeExpression(expr: ExpressionNode): void {
    switch (expr.kind) {
      case "Identifier":
        // Check that identifier has been declared
        if (!symbolTable.has(expr.name)) {
          errors.push({
            message: `Use of undeclared variable '${expr.name}'`,
            line: expr.line,
            column: expr.column,
            severity: "error",
          });
        } else {
          // Warn if variable is used before being assigned a value
          const entry = symbolTable.get(expr.name)!;
          if (!entry.initialized) {
            errors.push({
              message: `Variable '${expr.name}' is used before being assigned a value`,
              line: expr.line,
              column: expr.column,
              severity: "warning",
            });
          }
        }
        break;

      case "NumberLiteral":
        // Always valid; integers per Rule 5
        break;

      case "BinaryExpr":
        analyzeExpression(expr.left);
        analyzeExpression(expr.right);
        // Division by zero detection (when right is a literal 0)
        if (expr.operator === "/" && expr.right.kind === "NumberLiteral" && expr.right.value === 0) {
          errors.push({
            message: `Division by zero detected`,
            line: expr.line,
            column: expr.column,
            severity: "warning",
          });
        }
        break;
    }
  }

  return { errors, symbolTable };
}
