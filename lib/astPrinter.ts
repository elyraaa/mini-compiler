// ============================================================
// AST PRETTY PRINTER
// Converts the AST into a human-readable tree string
// for display in the compiler visualization UI.
// ============================================================

import { ASTNode, ProgramNode, StatementNode, ExpressionNode } from "./parser";

export interface TreeNode {
  label: string;
  detail?: string;
  children: TreeNode[];
  kind: string;
}

export function astToTree(ast: ProgramNode): TreeNode {
  return {
    label: "Program",
    kind: "program",
    detail: `${ast.body.length} statement${ast.body.length !== 1 ? "s" : ""}`,
    children: ast.body.map(stmtToTree),
  };
}

function stmtToTree(stmt: StatementNode): TreeNode {
  switch (stmt.kind) {
    case "VarDecl":
      return {
        label: "VarDecl",
        kind: "keyword",
        detail: stmt.name,
        children: [
          { label: "IDENTIFIER", kind: "identifier", detail: stmt.name, children: [] },
        ],
      };

    case "InputStmt":
      return {
        label: "InputStmt",
        kind: "keyword",
        detail: stmt.variable,
        children: [
          { label: "IDENTIFIER", kind: "identifier", detail: stmt.variable, children: [] },
        ],
      };

    case "OutputStmt":
      return {
        label: "OutputStmt",
        kind: "keyword",
        children: [exprToTree(stmt.expression)],
      };

    case "AssignStmt":
      return {
        label: "AssignStmt",
        kind: "operator",
        detail: `${stmt.variable} =`,
        children: [
          { label: "IDENTIFIER", kind: "identifier", detail: stmt.variable, children: [] },
          exprToTree(stmt.expression),
        ],
      };
  }
}

function exprToTree(expr: ExpressionNode): TreeNode {
  switch (expr.kind) {
    case "NumberLiteral":
      return {
        label: "NumberLiteral",
        kind: "number",
        detail: String(expr.value),
        children: [],
      };

    case "Identifier":
      return {
        label: "Identifier",
        kind: "identifier",
        detail: expr.name,
        children: [],
      };

    case "BinaryExpr":
      return {
        label: "BinaryExpr",
        kind: "operator",
        detail: expr.operator,
        children: [exprToTree(expr.left), exprToTree(expr.right)],
      };
  }
}
