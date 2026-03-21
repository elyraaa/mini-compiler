/**
 * INTERPRETER / EXECUTOR
 * 
 * Tree-walking interpreter that evaluates the AST directly.
 * 
 * This is the "back-end" of our compiler pipeline.
 * A real compiler would emit machine code or bytecode here;
 * instead we interpret the AST in JavaScript for simplicity.
 * 
 * Features:
 *   - Integer arithmetic (+, -, *, / with truncation)
 *   - Division-by-zero detection
 *   - Pre-supplied input values (since we're in a browser)
 *   - Execution trace for educational purposes
 * 
 * Theory: Tree-walking interpreters correspond to "denotational semantics" —
 * each AST node maps to a mathematical value.
 * Reference: Nystrom, "Crafting Interpreters", Part II
 */

// ─────────────────────────────────────────────
//  RUNTIME ERROR CLASS
// ─────────────────────────────────────────────
export class RuntimeError {
  constructor(message, line) {
    this.message = message;
    this.line    = line ?? 0;
    this.phase   = 'Runtime';
  }

  toString() {
    return `[Runtime] Line ${this.line}: ${this.message}`;
  }
}

// ─────────────────────────────────────────────
//  INTERPRETER CLASS
// ─────────────────────────────────────────────
export class Interpreter {
  /**
   * @param {object}   ast    - The Program AST node
   * @param {string[]} inputs - Pre-supplied input values (one per 'input' stmt)
   */
  constructor(ast, inputs = []) {
    this.ast        = ast;
    this.inputs     = inputs.map(v => v.trim()).filter(v => v !== '');
    this.inputIdx   = 0;

    /** @type {Map<string, number>} Runtime environment (variable store) */
    this.env        = new Map();

    /** @type {Array<string|number>} Collected output values */
    this.output     = [];

    /** @type {Array<object>} Step-by-step execution trace */
    this.trace      = [];

    this.error      = null;
  }

  // ── Execution ───────────────────────────────

  run() {
    try {
      for (const stmt of this.ast.body) {
        this.execStatement(stmt);
      }
    } catch (err) {
      if (err instanceof RuntimeError) {
        this.error = err;
      } else {
        throw err;
      }
    }

    return {
      output: this.output,
      trace:  this.trace,
      env:    Object.fromEntries(this.env),
      error:  this.error,
    };
  }

  execStatement(stmt) {
    switch (stmt.type) {
      case 'VarDecl':
        this.execVarDecl(stmt);
        break;
      case 'InputStmt':
        this.execInputStmt(stmt);
        break;
      case 'OutputStmt':
        this.execOutputStmt(stmt);
        break;
      case 'AssignStmt':
        this.execAssignStmt(stmt);
        break;
      default:
        throw new RuntimeError(`Unknown statement type: ${stmt.type}`, stmt.line);
    }
  }

  execVarDecl(stmt) {
    const value = stmt.init !== null ? this.evalExpr(stmt.init) : 0;
    this.env.set(stmt.name, value);
    this.trace.push({
      line: stmt.line,
      op:   'DECLARE',
      name: stmt.name,
      value,
      desc: stmt.init
        ? `Declare '${stmt.name}' = ${value}`
        : `Declare '${stmt.name}' = 0 (default)`,
    });
  }

  execInputStmt(stmt) {
    if (this.inputIdx >= this.inputs.length) {
      throw new RuntimeError(
        `Not enough input values provided. Variable '${stmt.name}' needs an input.`,
        stmt.line
      );
    }
    const raw   = this.inputs[this.inputIdx++];
    const value = parseInt(raw, 10);
    if (isNaN(value)) {
      throw new RuntimeError(
        `Input value '${raw}' for variable '${stmt.name}' is not a valid integer`,
        stmt.line
      );
    }
    this.env.set(stmt.name, value);
    this.trace.push({
      line:  stmt.line,
      op:    'INPUT',
      name:  stmt.name,
      value,
      desc:  `Read input for '${stmt.name}' → ${value}`,
    });
  }

  execOutputStmt(stmt) {
    const value = this.evalExpr(stmt.expr);
    this.output.push(value);
    this.trace.push({
      line:  stmt.line,
      op:    'OUTPUT',
      value,
      desc:  `Output → ${value}`,
    });
  }

  execAssignStmt(stmt) {
    const value = this.evalExpr(stmt.expr);
    this.env.set(stmt.name, value);
    this.trace.push({
      line:  stmt.line,
      op:    'ASSIGN',
      name:  stmt.name,
      value,
      desc:  `'${stmt.name}' ← ${value}`,
    });
  }

  // ── Expression Evaluation ───────────────────

  evalExpr(expr) {
    switch (expr.type) {
      case 'NumberLiteral':
        return expr.value;

      case 'Identifier': {
        if (!this.env.has(expr.name)) {
          throw new RuntimeError(`Undefined variable '${expr.name}'`, expr.line);
        }
        return this.env.get(expr.name);
      }

      case 'UnaryExpr':
        return -this.evalExpr(expr.operand);

      case 'BinaryExpr': {
        const left  = this.evalExpr(expr.left);
        const right = this.evalExpr(expr.right);
        switch (expr.op) {
          case '+': return left + right;
          case '-': return left - right;
          case '*': return left * right;
          case '/':
            if (right === 0) {
              throw new RuntimeError('Division by zero is not allowed', expr.line);
            }
            // Integer division (truncate toward zero, like C/Java)
            return Math.trunc(left / right);
          default:
            throw new RuntimeError(`Unknown operator '${expr.op}'`, expr.line);
        }
      }

      default:
        throw new RuntimeError(`Unknown expression type: ${expr.type}`, expr?.line);
    }
  }
}

// ─────────────────────────────────────────────
//  UTILITY: Count input statements in AST
// ─────────────────────────────────────────────
export function countInputStatements(ast) {
  if (!ast || !ast.body) return 0;
  return ast.body.filter(s => s.type === 'InputStmt').length;
}

export function getInputVariableNames(ast) {
  if (!ast || !ast.body) return [];
  return ast.body
    .filter(s => s.type === 'InputStmt')
    .map(s => s.name);
}
