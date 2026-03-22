export class SemanticError {
  constructor(message, line) {
    this.message = message;
    this.line    = line ?? 0;
    this.phase   = 'Semantic Analysis';
  }

  toString() {
    return `[Semantic] Line ${this.line}: ${this.message}`;
  }
}

export class SemanticWarning {
  constructor(message, line) {
    this.message = message;
    this.line    = line ?? 0;
    this.phase   = 'Semantic Analysis';
  }

  toString() {
    return `[Warning] Line ${this.line}: ${this.message}`;
  }
}

// ─────────────────────────────────────────────
//  SYMBOL TABLE ENTRY
// ─────────────────────────────────────────────
/**
 * @typedef {Object} SymbolEntry
 * @property {string}  name         - Variable name
 * @property {number}  declaredLine - Line where var was declared
 * @property {boolean} initialized  - Has been assigned a value?
 * @property {boolean} used         - Has been read anywhere?
 * @property {number}  useCount     - Number of times read
 * @property {number}  assignCount  - Number of times assigned/inputted
 */

// ─────────────────────────────────────────────
//  SEMANTIC ANALYZER CLASS
// ─────────────────────────────────────────────
export class SemanticAnalyzer {
  constructor(ast) {
    this.ast         = ast;
    this.errors      = [];
    this.warnings    = [];
    /** @type {Map<string, SymbolEntry>} */
    this.symbolTable = new Map();
  }

  // ── Symbol Table Helpers ────────────────────

  declare(name, line, hasInit) {
    if (this.symbolTable.has(name)) {
      this.errors.push(new SemanticError(
        `Variable '${name}' has already been declared (first declared at line ${this.symbolTable.get(name).declaredLine})`,
        line
      ));
      return false;
    }
    this.symbolTable.set(name, {
      name,
      declaredLine:  line,
      initialized:   hasInit,
      used:          false,
      useCount:      0,
      assignCount:   hasInit ? 1 : 0,
    });
    return true;
  }

  markRead(name, line) {
    if (!this.symbolTable.has(name)) {
      this.errors.push(new SemanticError(
        `Variable '${name}' is used but has not been declared`,
        line
      ));
      return;
    }
    const sym = this.symbolTable.get(name);
    if (!sym.initialized) {
      this.warnings.push(new SemanticWarning(
        `Variable '${name}' may not be initialized before use`,
        line
      ));
    }
    sym.used     = true;
    sym.useCount += 1;
  }

  markAssigned(name, line) {
    if (!this.symbolTable.has(name)) {
      this.errors.push(new SemanticError(
        `Cannot assign to undeclared variable '${name}'`,
        line
      ));
      return;
    }
    const sym        = this.symbolTable.get(name);
    sym.initialized   = true;
    sym.assignCount  += 1;
  }

  // ── Visitor Methods ─────────────────────────

  analyze() {
    for (const stmt of this.ast.body) {
      this.visitStatement(stmt);
    }

    // Post-analysis: warn on unused variables
    for (const [, sym] of this.symbolTable) {
      if (!sym.used) {
        this.warnings.push(new SemanticWarning(
          `Variable '${sym.name}' is declared but never read`,
          sym.declaredLine
        ));
      }
    }

    return {
      errors:      this.errors,
      warnings:    this.warnings,
      symbolTable: this.symbolTable,
    };
  }

  visitStatement(stmt) {
    switch (stmt.type) {
      case 'VarDecl':
        this.visitVarDecl(stmt);
        break;
      case 'InputStmt':
        this.visitInputStmt(stmt);
        break;
      case 'OutputStmt':
        this.visitOutputStmt(stmt);
        break;
      case 'AssignStmt':
        this.visitAssignStmt(stmt);
        break;
      default:
        this.errors.push(new SemanticError(`Unknown statement type: ${stmt.type}`, stmt.line));
    }
  }

  visitVarDecl(stmt) {
    const hasInit = stmt.init !== null;
    this.declare(stmt.name, stmt.line, hasInit);
    if (hasInit) {
      this.visitExpression(stmt.init);
    }
  }

  visitInputStmt(stmt) {
    if (!this.symbolTable.has(stmt.name)) {
      this.errors.push(new SemanticError(
        `Cannot read into undeclared variable '${stmt.name}'. Declare it first with 'var ${stmt.name};'`,
        stmt.line
      ));
    } else {
      const sym        = this.symbolTable.get(stmt.name);
      sym.initialized   = true;
      sym.assignCount  += 1;
      // input counts as "used" (the user interacts with it)
      sym.used = true;
    }
  }

  visitOutputStmt(stmt) {
    this.visitExpression(stmt.expr);
  }

  visitAssignStmt(stmt) {
    // First evaluate RHS (so self-referential assignments like x = x + 1 work)
    this.visitExpression(stmt.expr);
    this.markAssigned(stmt.name, stmt.line);
    // Mark as used (the assignment itself "uses" the variable slot)
    if (this.symbolTable.has(stmt.name)) {
      this.symbolTable.get(stmt.name).used = true;
    }
  }

  visitExpression(expr) {
    switch (expr.type) {
      case 'NumberLiteral':
        // No semantic checks needed for literals
        break;

      case 'Identifier':
        this.markRead(expr.name, expr.line);
        break;

      case 'BinaryExpr':
        this.visitExpression(expr.left);
        this.visitExpression(expr.right);
        break;

      case 'UnaryExpr':
        this.visitExpression(expr.operand);
        break;

      default:
        this.errors.push(new SemanticError(`Unknown expression type: ${expr.type}`, expr.line));
    }
  }
}
